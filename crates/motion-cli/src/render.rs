use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use cap_project::{
    MotionArtifact, MotionArtifactQuality, MotionArtifactStatus, MotionDurationPolicy,
    ProjectConfiguration, record_motion_artifact,
};
use serde::Serialize;
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug)]
pub struct MotionRenderRequest {
    pub workspace: PathBuf,
    pub composition_id: String,
    pub output_path: PathBuf,
    pub props: Value,
    pub quality: MotionArtifactQuality,
    pub width: u32,
    pub height: u32,
    pub fps: u32,
    pub duration_in_frames: u32,
    pub has_alpha: bool,
}

pub trait MotionRenderRunner {
    fn render(&self, request: &MotionRenderRequest) -> Result<(), String>;
}

#[derive(Default)]
pub struct RemotionCliRunner;

impl MotionRenderRunner for RemotionCliRunner {
    fn render(&self, request: &MotionRenderRequest) -> Result<(), String> {
        #[cfg(windows)]
        let executable = request.workspace.join("node_modules/.bin/remotion.cmd");
        #[cfg(not(windows))]
        let executable = request.workspace.join("node_modules/.bin/remotion");

        if !executable.is_file() {
            return Err(format!(
                "Remotion dependencies are missing at {}; run npm ci in {}",
                executable.display(),
                request.workspace.display()
            ));
        }

        let entry = request.workspace.join("src/index.ts");
        if !entry.is_file() {
            return Err(format!(
                "Remotion entry does not exist: {}",
                entry.display()
            ));
        }

        let props = serde_json::to_string(&request.props)
            .map_err(|error| format!("failed to encode Remotion props: {error}"))?;
        let mut command = Command::new(executable);
        command
            .current_dir(&request.workspace)
            .arg("render")
            .arg(entry)
            .arg(&request.composition_id)
            .arg(&request.output_path)
            .arg("--props")
            .arg(props)
            .arg("--image-format")
            .arg("png")
            .arg("--log")
            .arg("error");

        match request.quality {
            MotionArtifactQuality::Preview => {
                command
                    .arg("--codec")
                    .arg("vp8")
                    .arg("--pixel-format")
                    .arg("yuva420p")
                    .arg("--scale")
                    .arg("0.5");
            }
            MotionArtifactQuality::Final => {
                command
                    .arg("--codec")
                    .arg("prores")
                    .arg("--prores-profile")
                    .arg("4444")
                    .arg("--pixel-format")
                    .arg("yuva444p10le");
            }
        }

        let status = command
            .status()
            .map_err(|error| format!("failed to start Remotion renderer: {error}"))?;
        if !status.success() {
            return Err(format!("Remotion renderer exited with status {status}"));
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug)]
pub struct RenderMotionOptions<'a> {
    pub project_path: &'a Path,
    pub expected_revision: u64,
    pub segment_id: &'a str,
    pub quality: MotionArtifactQuality,
    pub workspace: Option<&'a Path>,
}

pub fn render_motion_segment(
    options: RenderMotionOptions<'_>,
    runner: &dyn MotionRenderRunner,
) -> Result<(ProjectConfiguration, MotionArtifact), String> {
    let project = ProjectConfiguration::load(options.project_path)
        .map_err(|error| format!("failed to load project: {error}"))?;
    if project.project_revision != options.expected_revision {
        return Err(format!(
            "project revision conflict: expected {}, found {}",
            options.expected_revision, project.project_revision
        ));
    }

    let segment = project
        .motion
        .segment(options.segment_id)
        .cloned()
        .ok_or_else(|| format!("motion segment {} does not exist", options.segment_id))?;
    let definition = project
        .motion
        .definition(&segment.definition_id, segment.definition_version)
        .cloned()
        .ok_or_else(|| {
            format!(
                "motion definition {} version {} does not exist",
                segment.definition_id, segment.definition_version
            )
        })?;

    let workspace = resolve_workspace(options.workspace)?;
    let fps = 30u32;
    let render_duration = match segment.duration_policy {
        MotionDurationPolicy::Responsive => segment.duration(),
        MotionDurationPolicy::Retime | MotionDurationPolicy::Trim => definition.default_duration,
    };
    let duration_in_frames = (render_duration * fps as f64).round().max(1.0) as u32;
    let props = merged_props(
        &definition.default_props,
        &segment.props,
        duration_in_frames,
    )?;
    let workspace_fingerprint = workspace_fingerprint(&workspace)?;
    let (width, height, file_name) = match options.quality {
        MotionArtifactQuality::Preview => (960, 540, "preview.webm"),
        MotionArtifactQuality::Final => (1920, 1080, "final.mov"),
    };
    let content_hash = content_hash(&json!({
        "definitionId": definition.id,
        "definitionVersion": definition.version,
        "source": definition.source,
        "workspaceFingerprint": workspace_fingerprint,
        "compositionId": definition.composition_id,
        "quality": options.quality,
        "width": width,
        "height": height,
        "fps": fps,
        "durationInFrames": duration_in_frames,
        "props": props,
    }))?;
    let relative_path = PathBuf::from("motion")
        .join("cache")
        .join(&content_hash)
        .join(file_name);
    let output_path = options.project_path.join(&relative_path);
    let artifact = MotionArtifact {
        id: format!(
            "motion-{}-{}",
            &content_hash[..16],
            match options.quality {
                MotionArtifactQuality::Preview => "preview",
                MotionArtifactQuality::Final => "final",
            }
        ),
        segment_id: segment.id,
        content_hash,
        quality: options.quality,
        status: MotionArtifactStatus::Ready,
        path: relative_path.to_string_lossy().replace('\\', "/"),
        width,
        height,
        fps: fps as f64,
        has_alpha: true,
        duration: duration_in_frames as f64 / fps as f64,
        error: None,
    };
    let render_request = MotionRenderRequest {
        workspace,
        composition_id: definition.composition_id,
        output_path: output_path.clone(),
        props,
        quality: options.quality,
        width,
        height,
        fps,
        duration_in_frames,
        has_alpha: true,
    };

    let cache_ready = output_path
        .metadata()
        .is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0);
    let already_linked = cache_ready
        && project
            .motion
            .segment(options.segment_id)
            .is_some_and(|segment| segment.artifact_id.as_deref() == Some(&artifact.id))
        && project.motion.artifacts.iter().any(|existing| {
            existing.id == artifact.id
                && existing.content_hash == artifact.content_hash
                && existing.quality == artifact.quality
                && existing.status == MotionArtifactStatus::Ready
        });
    if already_linked {
        return Ok((project, artifact));
    }
    if !cache_ready {
        std::fs::create_dir_all(
            output_path
                .parent()
                .ok_or_else(|| "motion output has no parent directory".to_string())?,
        )
        .map_err(|error| format!("failed to create motion cache directory: {error}"))?;
        runner.render(&render_request)?;
    }
    if !output_path
        .metadata()
        .is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
    {
        return Err(format!(
            "Remotion did not produce a non-empty artifact at {}",
            output_path.display()
        ));
    }

    let project = record_motion_artifact(
        options.project_path,
        options.expected_revision,
        artifact.clone(),
    )
    .map_err(|error| error.to_string())?;

    Ok((project, artifact))
}

fn resolve_workspace(explicit: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(path) = explicit {
        return Ok(path.to_path_buf());
    }
    if let Some(path) = std::env::var_os("CAP_REMOTION_WORKSPACE") {
        return Ok(PathBuf::from(path));
    }
    let current = std::env::current_dir()
        .map_err(|error| format!("failed to read current directory: {error}"))?;
    let candidate = current.join("workflows/laohu-video/模板/remotion-assets/workspace");
    if candidate.is_dir() {
        return Ok(candidate);
    }
    Err("Remotion workspace was not found; pass --workspace or set CAP_REMOTION_WORKSPACE".into())
}

fn merged_props(defaults: &Value, instance: &Value, duration: u32) -> Result<Value, String> {
    let mut merged = defaults.as_object().cloned().unwrap_or_else(Map::new);
    let instance = instance
        .as_object()
        .ok_or_else(|| "motion segment props must be a JSON object".to_string())?;
    merged.extend(instance.clone());
    merged.insert("durationInFrames".into(), Value::from(duration));
    merged.insert("renderMode".into(), Value::from("asset"));
    Ok(Value::Object(merged))
}

fn content_hash(value: &impl Serialize) -> Result<String, String> {
    let encoded = serde_json::to_vec(value)
        .map_err(|error| format!("failed to encode motion render inputs: {error}"))?;
    let digest = Sha256::digest(encoded);
    Ok(format!("{digest:x}"))
}

fn workspace_fingerprint(workspace: &Path) -> Result<String, String> {
    let mut files = Vec::new();
    for directory in ["src", "public"] {
        collect_files(&workspace.join(directory), &mut files)?;
    }
    for file in [
        "package.json",
        "package-lock.json",
        "remotion.config.ts",
        "remotion.config.js",
        "tsconfig.json",
    ] {
        let path = workspace.join(file);
        if path.is_file() {
            files.push(path);
        }
    }
    files.sort();
    files.dedup();

    let mut digest = Sha256::new();
    for path in files {
        let relative = path.strip_prefix(workspace).map_err(|error| {
            format!(
                "failed to make Remotion source path {} relative: {error}",
                path.display()
            )
        })?;
        let relative = relative.to_string_lossy();
        let contents = fs::read(&path).map_err(|error| {
            format!(
                "failed to read Remotion source file {}: {error}",
                path.display()
            )
        })?;
        digest.update((relative.len() as u64).to_le_bytes());
        digest.update(relative.as_bytes());
        digest.update((contents.len() as u64).to_le_bytes());
        digest.update(contents);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn collect_files(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    let entries = fs::read_dir(directory).map_err(|error| {
        format!(
            "failed to inspect Remotion source directory {}: {error}",
            directory.display()
        )
    })?;
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "failed to inspect an entry in Remotion source directory {}: {error}",
                directory.display()
            )
        })?;
        let file_type = entry.file_type().map_err(|error| {
            format!(
                "failed to inspect Remotion source path {}: {error}",
                entry.path().display()
            )
        })?;
        if file_type.is_dir() {
            collect_files(&entry.path(), files)?;
        } else if file_type.is_file() {
            files.push(entry.path());
        }
    }
    Ok(())
}
