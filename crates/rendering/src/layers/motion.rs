use std::{collections::HashMap, path::PathBuf, sync::Arc};

use cap_project::{MotionFramePlan, XY};

use crate::{
    DecodedSegmentFrames, RenderVideoConstants, RenderingError,
    composite_frame::{CompositeVideoFramePipeline, CompositeVideoFrameUniforms},
    decoder::{AsyncVideoDecoderHandle, spawn_alpha_decoder, spawn_decoder},
    yuv_converter::YuvConverterPipelines,
};

use super::DisplayLayer;

struct MotionVideo {
    source_path: PathBuf,
    decoder: AsyncVideoDecoderHandle,
    layer: DisplayLayer,
}

pub struct MotionLayer {
    videos: HashMap<String, MotionVideo>,
    active_artifacts: Vec<String>,
    yuv_pipelines: Arc<YuvConverterPipelines>,
    composite_pipeline: Arc<CompositeVideoFramePipeline>,
    prefer_cpu_conversion: bool,
}

impl MotionLayer {
    pub fn new(
        yuv_pipelines: Arc<YuvConverterPipelines>,
        composite_pipeline: Arc<CompositeVideoFramePipeline>,
        prefer_cpu_conversion: bool,
    ) -> Self {
        Self {
            videos: HashMap::new(),
            active_artifacts: Vec::new(),
            yuv_pipelines,
            composite_pipeline,
            prefer_cpu_conversion,
        }
    }

    fn artifact_path(constants: &RenderVideoConstants, plan: &MotionFramePlan) -> PathBuf {
        let path = PathBuf::from(&plan.artifact_path);
        if path.is_absolute() {
            path
        } else {
            constants.recording_meta.project_path.join(path)
        }
    }

    async fn ensure_video(
        &mut self,
        constants: &RenderVideoConstants,
        plan: &MotionFramePlan,
    ) -> Option<&mut MotionVideo> {
        let source_path = Self::artifact_path(constants, plan);
        let needs_decoder = self
            .videos
            .get(&plan.artifact_id)
            .is_none_or(|video| video.source_path != source_path);

        if needs_decoder {
            let fps = plan.artifact_fps.round().clamp(1.0, u32::MAX as f64) as u32;
            let decoder_result = if plan.has_alpha {
                spawn_alpha_decoder("motion", source_path.clone(), fps).await
            } else {
                spawn_decoder("motion", source_path.clone(), fps, 0.0, false).await
            };
            let decoder = match decoder_result {
                Ok(decoder) => decoder,
                Err(error) => {
                    tracing::warn!(
                        artifact_id = plan.artifact_id,
                        path = %source_path.display(),
                        %error,
                        "Motion artifact decoder could not be created"
                    );
                    return None;
                }
            };
            let layer = DisplayLayer::new_with_all_shared_pipelines(
                &constants.device,
                self.yuv_pipelines.clone(),
                self.composite_pipeline.clone(),
                self.prefer_cpu_conversion,
            );
            self.videos.insert(
                plan.artifact_id.clone(),
                MotionVideo {
                    source_path,
                    decoder,
                    layer,
                },
            );
        }

        self.videos.get_mut(&plan.artifact_id)
    }

    fn uniforms(plan: &MotionFramePlan, output_size: (u32, u32)) -> CompositeVideoFrameUniforms {
        let target_bounds = plan.target_bounds.map(|value| value as f32);
        CompositeVideoFrameUniforms {
            crop_bounds: [
                0.0,
                0.0,
                plan.artifact_width as f32,
                plan.artifact_height as f32,
            ],
            target_bounds,
            output_size: [output_size.0 as f32, output_size.1 as f32],
            frame_size: [plan.artifact_width as f32, plan.artifact_height as f32],
            target_size: [
                target_bounds[2] - target_bounds[0],
                target_bounds[3] - target_bounds[1],
            ],
            opacity: plan.opacity as f32,
            preserve_source_alpha: if plan.has_alpha { 1.0 } else { 0.0 },
            rotation_radians: plan.rotation_radians as f32,
            ..Default::default()
        }
    }

    fn segment_frames(frame: crate::DecodedFrame, local_time: f64) -> DecodedSegmentFrames {
        DecodedSegmentFrames {
            screen_frame: Some(frame),
            camera_frame: None,
            segment_time: local_time as f32,
            recording_time: local_time as f32,
            segment_has_camera: false,
        }
    }

    pub async fn prepare(
        &mut self,
        constants: &RenderVideoConstants,
        uniforms: &crate::ProjectUniforms,
    ) -> Result<(), RenderingError> {
        self.active_artifacts.clear();
        let timeline_time = uniforms.frame_number as f64 / uniforms.frame_rate.max(1) as f64;
        let plans = uniforms.project.motion.frame_plans_at(
            timeline_time,
            uniforms.output_size.0,
            uniforms.output_size.1,
        );

        for plan in plans {
            let Some(video) = self.ensure_video(constants, &plan).await else {
                continue;
            };
            let Some(frame) = video.decoder.get_frame(plan.local_time as f32).await else {
                continue;
            };
            let segment_frames = Self::segment_frames(frame, plan.local_time);
            video.layer.prepare(
                &constants.device,
                &constants.queue,
                &segment_frames,
                XY::new(plan.artifact_width, plan.artifact_height),
                Self::uniforms(&plan, uniforms.output_size),
            );
            self.active_artifacts.push(plan.artifact_id);
        }
        Ok(())
    }

    pub async fn prepare_with_encoder(
        &mut self,
        constants: &RenderVideoConstants,
        uniforms: &crate::ProjectUniforms,
        encoder: &mut wgpu::CommandEncoder,
    ) -> Result<(), RenderingError> {
        self.active_artifacts.clear();
        let timeline_time = uniforms.frame_number as f64 / uniforms.frame_rate.max(1) as f64;
        let plans = uniforms.project.motion.frame_plans_at(
            timeline_time,
            uniforms.output_size.0,
            uniforms.output_size.1,
        );

        for plan in plans {
            let Some(video) = self.ensure_video(constants, &plan).await else {
                continue;
            };
            let Some(frame) = video.decoder.get_frame(plan.local_time as f32).await else {
                continue;
            };
            let segment_frames = Self::segment_frames(frame, plan.local_time);
            let ready = video.layer.prepare_with_encoder(
                &constants.device,
                &constants.queue,
                &segment_frames,
                XY::new(plan.artifact_width, plan.artifact_height),
                Self::uniforms(&plan, uniforms.output_size),
                encoder,
            );
            if ready {
                self.active_artifacts.push(plan.artifact_id);
            }
        }
        Ok(())
    }

    pub fn copy_to_textures(&mut self, encoder: &mut wgpu::CommandEncoder) {
        for artifact_id in &self.active_artifacts {
            if let Some(video) = self.videos.get_mut(artifact_id) {
                video.layer.copy_to_texture(encoder);
            }
        }
    }

    pub fn render(&self, pass: &mut wgpu::RenderPass<'_>) {
        for artifact_id in &self.active_artifacts {
            if let Some(video) = self.videos.get(artifact_id) {
                video.layer.render(pass);
            }
        }
    }

    pub fn has_content(&self) -> bool {
        !self.active_artifacts.is_empty()
    }
}
