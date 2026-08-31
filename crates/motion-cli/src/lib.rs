use std::{fs::File, io::Read, path::PathBuf};

use cap_project::{
    EXTERNAL_VIDEO_DEFINITION_ID, MotionArtifact, MotionArtifactQuality, MotionArtifactStatus,
    MotionDefinition, MotionDefinitionStatus, MotionDurationPolicy, MotionOverlayRole,
    MotionSegment, ProjectConfiguration, add_motion_segment, import_external_motion_artifact,
    move_motion_segment, register_motion_definition, resize_motion_segment,
    set_motion_segment_props,
};
use clap::{Args, Parser, Subcommand, ValueEnum};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

mod render;
pub use render::*;

#[derive(Parser)]
#[command(name = "motion")]
pub struct MotionCommandLine {
    #[command(flatten)]
    pub motion: MotionArgs,
}

impl MotionCommandLine {
    pub fn run(self) -> Result<MotionOutput, String> {
        self.motion.run()
    }

    pub fn run_with_renderer(
        self,
        renderer: &dyn MotionRenderRunner,
    ) -> Result<MotionOutput, String> {
        self.motion.run_with_renderer(renderer)
    }
}

#[derive(Args)]
pub struct MotionArgs {
    #[arg(long, value_enum, global = true, default_value_t = MotionOutputFormat::Text)]
    format: MotionOutputFormat,
    #[command(subcommand)]
    command: MotionCommands,
}

impl MotionArgs {
    pub fn output_format(&self) -> MotionOutputFormat {
        self.format
    }

    pub fn run(self) -> Result<MotionOutput, String> {
        self.run_with_renderer(&RemotionCliRunner)
    }

    pub fn run_with_renderer(
        self,
        renderer: &dyn MotionRenderRunner,
    ) -> Result<MotionOutput, String> {
        match self.command {
            MotionCommands::Definition(args) => args.run(),
            MotionCommands::Artifact(args) => args.run(),
            MotionCommands::Add(args) => args.run(),
            MotionCommands::Move(args) => args.run(),
            MotionCommands::Resize(args) => args.run(),
            MotionCommands::Props(args) => args.run(),
            MotionCommands::Render(args) => args.run(renderer),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, ValueEnum)]
pub enum MotionOutputFormat {
    #[default]
    Text,
    Json,
}

#[derive(Subcommand)]
enum MotionCommands {
    Definition(MotionDefinitionArgs),
    Artifact(MotionArtifactArgs),
    Add(MotionAddArgs),
    Move(MotionMoveArgs),
    Resize(MotionResizeArgs),
    Props(MotionPropsArgs),
    Render(MotionRenderArgs),
}

#[derive(Args)]
struct MotionArtifactArgs {
    #[command(subcommand)]
    command: MotionArtifactCommands,
}

impl MotionArtifactArgs {
    fn run(self) -> Result<MotionOutput, String> {
        match self.command {
            MotionArtifactCommands::Import(args) => args.run(),
        }
    }
}

#[derive(Subcommand)]
enum MotionArtifactCommands {
    Import(MotionArtifactImportArgs),
}

#[derive(Args)]
struct MotionArtifactImportArgs {
    #[arg(long)]
    expected_revision: u64,
    #[arg(long)]
    segment_id: String,
    #[arg(long)]
    artifact_id: String,
    #[arg(long)]
    path: PathBuf,
    #[arg(long)]
    start: f64,
    #[arg(long)]
    duration: f64,
    #[arg(long)]
    width: u32,
    #[arg(long)]
    height: u32,
    #[arg(long)]
    fps: f64,
    #[arg(long, default_value_t = 0)]
    track: u32,
    #[arg(long, default_value_t = 0)]
    z_index: i32,
    #[arg(long, value_enum, default_value_t = OverlayRoleArg::Animation)]
    role: OverlayRoleArg,
    #[arg(long, default_value_t = false)]
    has_alpha: bool,
    project_path: PathBuf,
}

impl MotionArtifactImportArgs {
    fn run(self) -> Result<MotionOutput, String> {
        if !self.path.is_absolute() {
            return Err("external artifact path must be absolute".into());
        }
        let mut file = File::open(&self.path)
            .map_err(|error| format!("external artifact cannot be opened: {error}"))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let count = file
                .read(&mut buffer)
                .map_err(|error| format!("external artifact cannot be hashed: {error}"))?;
            if count == 0 {
                break;
            }
            hasher.update(&buffer[..count]);
        }
        let content_hash = format!("{:x}", hasher.finalize());
        let segment = MotionSegment {
            id: self.segment_id.clone(),
            definition_id: EXTERNAL_VIDEO_DEFINITION_ID.into(),
            definition_version: 1,
            start: self.start,
            end: self.start + self.duration,
            track: self.track,
            z_index: self.z_index,
            role: self.role.into(),
            duration_policy: MotionDurationPolicy::Trim,
            ..Default::default()
        };
        let artifact = MotionArtifact {
            id: self.artifact_id.clone(),
            segment_id: self.segment_id,
            content_hash,
            quality: MotionArtifactQuality::Final,
            status: MotionArtifactStatus::Ready,
            path: self.path.to_string_lossy().into_owned(),
            width: self.width,
            height: self.height,
            fps: self.fps,
            has_alpha: self.has_alpha,
            duration: self.duration,
            error: None,
        };
        let project = import_external_motion_artifact(
            self.project_path,
            self.expected_revision,
            segment,
            artifact.clone(),
        )
        .map_err(|error| error.to_string())?;
        Ok(MotionOutput::artifact(project, artifact))
    }
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum RenderQualityArg {
    Preview,
    Final,
}

impl From<RenderQualityArg> for cap_project::MotionArtifactQuality {
    fn from(value: RenderQualityArg) -> Self {
        match value {
            RenderQualityArg::Preview => Self::Preview,
            RenderQualityArg::Final => Self::Final,
        }
    }
}

#[derive(Args)]
struct MotionRenderArgs {
    #[arg(long)]
    expected_revision: u64,
    #[arg(long)]
    segment: String,
    #[arg(long, value_enum, default_value_t = RenderQualityArg::Preview)]
    quality: RenderQualityArg,
    #[arg(long)]
    workspace: Option<PathBuf>,
    project_path: PathBuf,
}

impl MotionRenderArgs {
    fn run(self, renderer: &dyn MotionRenderRunner) -> Result<MotionOutput, String> {
        let (project, artifact) = render_motion_segment(
            RenderMotionOptions {
                project_path: &self.project_path,
                expected_revision: self.expected_revision,
                segment_id: &self.segment,
                quality: self.quality.into(),
                workspace: self.workspace.as_deref(),
            },
            renderer,
        )?;
        Ok(MotionOutput::artifact(project, artifact))
    }
}

#[derive(Args)]
struct MotionDefinitionArgs {
    #[command(subcommand)]
    command: MotionDefinitionCommands,
}

impl MotionDefinitionArgs {
    fn run(self) -> Result<MotionOutput, String> {
        match self.command {
            MotionDefinitionCommands::Register(args) => args.run(),
        }
    }
}

#[derive(Subcommand)]
enum MotionDefinitionCommands {
    Register(MotionDefinitionRegisterArgs),
}

#[derive(Args)]
struct MotionDefinitionRegisterArgs {
    #[arg(long)]
    expected_revision: u64,
    #[arg(long)]
    id: String,
    #[arg(long)]
    version: u32,
    #[arg(long)]
    source: String,
    #[arg(long)]
    composition_id: String,
    #[arg(long, value_enum, default_value_t = DefinitionStatusArg::Draft)]
    status: DefinitionStatusArg,
    #[arg(long)]
    min_duration: f64,
    #[arg(long)]
    default_duration: f64,
    #[arg(long)]
    max_duration: f64,
    #[arg(long, value_enum, default_value_t = DurationPolicyArg::Responsive)]
    default_policy: DurationPolicyArg,
    #[arg(long, default_value_t = 0.0)]
    intro_duration: f64,
    #[arg(long, default_value_t = 0.0)]
    outro_duration: f64,
    #[arg(long, default_value = "{}")]
    default_props_json: String,
    project_path: PathBuf,
}

impl MotionDefinitionRegisterArgs {
    fn run(self) -> Result<MotionOutput, String> {
        let default_props = parse_props(&self.default_props_json)?;
        let definition = MotionDefinition {
            id: self.id.clone(),
            version: self.version,
            source: self.source,
            composition_id: self.composition_id,
            status: self.status.into(),
            min_duration: self.min_duration,
            default_duration: self.default_duration,
            max_duration: self.max_duration,
            default_policy: self.default_policy.into(),
            intro_duration: self.intro_duration,
            outro_duration: self.outro_duration,
            default_props,
            ..Default::default()
        };
        let project =
            register_motion_definition(self.project_path, self.expected_revision, definition)
                .map_err(|error| error.to_string())?;
        let definition = project.motion.definition(&self.id, self.version).cloned();
        Ok(MotionOutput::definition(project, definition))
    }
}

#[derive(Args)]
struct MotionAddArgs {
    #[arg(long)]
    expected_revision: u64,
    #[arg(long)]
    definition_id: String,
    #[arg(long)]
    definition_version: u32,
    #[arg(long)]
    segment_id: String,
    #[arg(long)]
    start: f64,
    #[arg(long)]
    duration: f64,
    #[arg(long, default_value_t = 0)]
    track: u32,
    #[arg(long, default_value_t = 0)]
    z_index: i32,
    #[arg(long, value_enum, default_value_t = OverlayRoleArg::Animation)]
    role: OverlayRoleArg,
    #[arg(long, value_enum, default_value_t = DurationPolicyArg::Responsive)]
    duration_policy: DurationPolicyArg,
    #[arg(long, default_value = "{}")]
    props_json: String,
    project_path: PathBuf,
}

impl MotionAddArgs {
    fn run(self) -> Result<MotionOutput, String> {
        let segment = MotionSegment {
            id: self.segment_id.clone(),
            definition_id: self.definition_id,
            definition_version: self.definition_version,
            start: self.start,
            end: self.start + self.duration,
            track: self.track,
            z_index: self.z_index,
            role: self.role.into(),
            duration_policy: self.duration_policy.into(),
            props: parse_props(&self.props_json)?,
            ..Default::default()
        };
        let project = add_motion_segment(self.project_path, self.expected_revision, segment)
            .map_err(|error| error.to_string())?;
        let segment = project.motion.segment(&self.segment_id).cloned();
        Ok(MotionOutput::segment(project, segment))
    }
}

#[derive(Args)]
struct MotionMoveArgs {
    #[arg(long)]
    expected_revision: u64,
    #[arg(long)]
    segment: String,
    #[arg(long)]
    start: f64,
    #[arg(long)]
    track: Option<u32>,
    project_path: PathBuf,
}

impl MotionMoveArgs {
    fn run(self) -> Result<MotionOutput, String> {
        let project = move_motion_segment(
            self.project_path,
            self.expected_revision,
            &self.segment,
            self.start,
            self.track,
        )
        .map_err(|error| error.to_string())?;
        let segment = project.motion.segment(&self.segment).cloned();
        Ok(MotionOutput::segment(project, segment))
    }
}

#[derive(Args)]
struct MotionResizeArgs {
    #[arg(long)]
    expected_revision: u64,
    #[arg(long)]
    segment: String,
    #[arg(long)]
    duration: f64,
    project_path: PathBuf,
}

impl MotionResizeArgs {
    fn run(self) -> Result<MotionOutput, String> {
        let project = resize_motion_segment(
            self.project_path,
            self.expected_revision,
            &self.segment,
            self.duration,
        )
        .map_err(|error| error.to_string())?;
        let segment = project.motion.segment(&self.segment).cloned();
        Ok(MotionOutput::segment(project, segment))
    }
}

#[derive(Args)]
struct MotionPropsArgs {
    #[command(subcommand)]
    command: MotionPropsCommands,
}

impl MotionPropsArgs {
    fn run(self) -> Result<MotionOutput, String> {
        match self.command {
            MotionPropsCommands::Set(args) => args.run(),
        }
    }
}

#[derive(Subcommand)]
enum MotionPropsCommands {
    Set(MotionPropsSetArgs),
}

#[derive(Args)]
struct MotionPropsSetArgs {
    #[arg(long)]
    expected_revision: u64,
    #[arg(long)]
    segment: String,
    #[arg(long)]
    props_json: String,
    project_path: PathBuf,
}

impl MotionPropsSetArgs {
    fn run(self) -> Result<MotionOutput, String> {
        let props = parse_props(&self.props_json)?;
        let project = set_motion_segment_props(
            self.project_path,
            self.expected_revision,
            &self.segment,
            props,
        )
        .map_err(|error| error.to_string())?;
        let segment = project.motion.segment(&self.segment).cloned();
        Ok(MotionOutput::segment(project, segment))
    }
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum DurationPolicyArg {
    Responsive,
    Retime,
    Trim,
}

impl From<DurationPolicyArg> for MotionDurationPolicy {
    fn from(value: DurationPolicyArg) -> Self {
        match value {
            DurationPolicyArg::Responsive => Self::Responsive,
            DurationPolicyArg::Retime => Self::Retime,
            DurationPolicyArg::Trim => Self::Trim,
        }
    }
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum OverlayRoleArg {
    Animation,
    Avatar,
    AiVideo,
    ScreenRecording,
    Evidence,
}

impl From<OverlayRoleArg> for MotionOverlayRole {
    fn from(value: OverlayRoleArg) -> Self {
        match value {
            OverlayRoleArg::Animation => Self::Animation,
            OverlayRoleArg::Avatar => Self::Avatar,
            OverlayRoleArg::AiVideo => Self::AiVideo,
            OverlayRoleArg::ScreenRecording => Self::ScreenRecording,
            OverlayRoleArg::Evidence => Self::Evidence,
        }
    }
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum DefinitionStatusArg {
    Draft,
    Approved,
    Published,
    Deprecated,
}

impl From<DefinitionStatusArg> for MotionDefinitionStatus {
    fn from(value: DefinitionStatusArg) -> Self {
        match value {
            DefinitionStatusArg::Draft => Self::Draft,
            DefinitionStatusArg::Approved => Self::Approved,
            DefinitionStatusArg::Published => Self::Published,
            DefinitionStatusArg::Deprecated => Self::Deprecated,
        }
    }
}

fn parse_props(json: &str) -> Result<Value, String> {
    let props: Value = serde_json::from_str(json)
        .map_err(|error| format!("invalid motion props JSON: {error}"))?;
    if !props.is_object() {
        return Err("motion props must be a JSON object".into());
    }
    Ok(props)
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MotionOutput {
    pub ok: bool,
    pub revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub definition: Option<MotionDefinition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub segment: Option<MotionSegment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artifact: Option<cap_project::MotionArtifact>,
}

impl MotionOutput {
    fn definition(project: ProjectConfiguration, definition: Option<MotionDefinition>) -> Self {
        Self {
            ok: true,
            revision: project.project_revision,
            definition,
            segment: None,
            artifact: None,
        }
    }

    fn segment(project: ProjectConfiguration, segment: Option<MotionSegment>) -> Self {
        Self {
            ok: true,
            revision: project.project_revision,
            definition: None,
            segment,
            artifact: None,
        }
    }

    fn artifact(project: ProjectConfiguration, artifact: cap_project::MotionArtifact) -> Self {
        Self {
            ok: true,
            revision: project.project_revision,
            definition: None,
            segment: project.motion.segment(&artifact.segment_id).cloned(),
            artifact: Some(artifact),
        }
    }
}
