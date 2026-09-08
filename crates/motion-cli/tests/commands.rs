use std::sync::Mutex;

use cap_motion_cli::{MotionCommandLine, MotionOutput, MotionRenderRequest, MotionRenderRunner};
use cap_project::{MotionOverlayRole, ProjectConfiguration};
use clap::Parser;

fn create_project() -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    ProjectConfiguration::default()
        .write(directory.path())
        .unwrap();
    directory
}

fn run(directory: &tempfile::TempDir, args: &[&str]) -> MotionOutput {
    let mut command = vec!["motion"];
    command.extend_from_slice(args);
    command.push(directory.path().to_str().unwrap());
    MotionCommandLine::parse_from(command).run().unwrap()
}

#[test]
fn definition_add_move_resize_and_props_form_one_revision_chain() {
    let directory = create_project();
    let registered = run(
        &directory,
        &[
            "definition",
            "register",
            "--expected-revision",
            "0",
            "--id",
            "case-cards",
            "--version",
            "1",
            "--source",
            "motion/case-cards",
            "--composition-id",
            "CaseCards",
            "--min-duration",
            "1",
            "--default-duration",
            "5",
            "--max-duration",
            "12",
            "--format",
            "json",
        ],
    );
    assert_eq!(registered.revision, 1);
    assert_eq!(registered.definition.unwrap().id, "case-cards");

    let added = run(
        &directory,
        &[
            "add",
            "--expected-revision",
            "1",
            "--definition-id",
            "case-cards",
            "--definition-version",
            "1",
            "--segment-id",
            "motion-1",
            "--start",
            "12.5",
            "--duration",
            "5",
            "--props-json",
            "{\"title\":\"两个案例\"}",
        ],
    );
    assert_eq!(added.revision, 2);
    assert_eq!(added.segment.unwrap().start, 12.5);

    let moved = run(
        &directory,
        &[
            "move",
            "--expected-revision",
            "2",
            "--segment",
            "motion-1",
            "--start",
            "20",
            "--track",
            "2",
        ],
    );
    assert_eq!(moved.segment.unwrap().end, 25.0);

    let resized = run(
        &directory,
        &[
            "resize",
            "--expected-revision",
            "3",
            "--segment",
            "motion-1",
            "--duration",
            "8",
        ],
    );
    assert_eq!(resized.segment.unwrap().end, 28.0);

    let props = run(
        &directory,
        &[
            "props",
            "set",
            "--expected-revision",
            "4",
            "--segment",
            "motion-1",
            "--props-json",
            "{\"title\":\"更新\"}",
        ],
    );
    assert_eq!(props.revision, 5);
    assert_eq!(props.segment.unwrap().props["title"], "更新");
}

#[test]
fn stale_revision_is_a_structured_non_success_result() {
    let directory = create_project();
    run(
        &directory,
        &[
            "definition",
            "register",
            "--expected-revision",
            "0",
            "--id",
            "title",
            "--version",
            "1",
            "--source",
            "motion/title",
            "--composition-id",
            "Title",
            "--min-duration",
            "1",
            "--default-duration",
            "2",
            "--max-duration",
            "5",
        ],
    );

    let command = MotionCommandLine::parse_from([
        "motion",
        "definition",
        "register",
        "--expected-revision",
        "0",
        "--id",
        "stale",
        "--version",
        "1",
        "--source",
        "motion/stale",
        "--composition-id",
        "Stale",
        "--min-duration",
        "1",
        "--default-duration",
        "2",
        "--max-duration",
        "5",
        directory.path().to_str().unwrap(),
    ]);
    let error = command.run().unwrap_err();

    assert!(error.contains("expected 0, found 1"));
}

#[test]
fn external_artifact_import_is_one_revision_safe_upper_track_transaction() {
    let directory = create_project();
    let media = directory.path().join("avatar.mp4");
    std::fs::write(&media, b"external video bytes").unwrap();
    let output = run(
        &directory,
        &[
            "artifact",
            "import",
            "--expected-revision",
            "0",
            "--segment-id",
            "avatar-001",
            "--artifact-id",
            "avatar-001-final",
            "--path",
            media.to_str().unwrap(),
            "--start",
            "30",
            "--duration",
            "25",
            "--width",
            "1280",
            "--height",
            "720",
            "--fps",
            "30",
            "--track",
            "4",
            "--z-index",
            "40",
            "--role",
            "avatar",
        ],
    );

    assert_eq!(output.revision, 1);
    let segment = output.segment.unwrap();
    let artifact = output.artifact.unwrap();
    assert_eq!(segment.start, 30.0);
    assert_eq!(segment.end, 55.0);
    assert_eq!(segment.track, 4);
    assert_eq!(segment.role, MotionOverlayRole::Avatar);
    assert_eq!(segment.artifact_id.as_deref(), Some("avatar-001-final"));
    assert_eq!(artifact.path, media.to_str().unwrap());
    assert_eq!(artifact.width, 1280);
    assert_eq!(artifact.height, 720);
    assert!(!artifact.content_hash.is_empty());

    let project = ProjectConfiguration::load(directory.path()).unwrap();
    assert!(
        project.timeline.is_none(),
        "base timeline must remain untouched"
    );
}

#[derive(Default)]
struct FakeRenderer {
    requests: Mutex<Vec<MotionRenderRequest>>,
}

impl MotionRenderRunner for FakeRenderer {
    fn render(&self, request: &MotionRenderRequest) -> Result<(), String> {
        self.requests.lock().unwrap().push(request.clone());
        std::fs::create_dir_all(request.output_path.parent().unwrap()).unwrap();
        std::fs::write(&request.output_path, b"fake transparent video").unwrap();
        Ok(())
    }
}

#[test]
fn render_command_builds_content_addressed_cache_and_links_artifact() {
    let directory = create_project();
    run(
        &directory,
        &[
            "definition",
            "register",
            "--expected-revision",
            "0",
            "--id",
            "case-cards",
            "--version",
            "1",
            "--source",
            "motion/case-cards",
            "--composition-id",
            "KineticStatement",
            "--min-duration",
            "1",
            "--default-duration",
            "5",
            "--max-duration",
            "12",
            "--default-props-json",
            "{\"component\":\"KineticStatement\",\"mode\":\"claim\"}",
        ],
    );
    run(
        &directory,
        &[
            "add",
            "--expected-revision",
            "1",
            "--definition-id",
            "case-cards",
            "--definition-version",
            "1",
            "--segment-id",
            "motion-1",
            "--start",
            "4",
            "--duration",
            "5",
            "--props-json",
            "{\"title\":\"两个案例\"}",
        ],
    );

    let workspace = directory.path().join("workspace");
    std::fs::create_dir_all(workspace.join("src")).unwrap();
    std::fs::write(
        workspace.join("src/animation.tsx"),
        "export const version = 1;",
    )
    .unwrap();
    let renderer = FakeRenderer::default();
    let command = MotionCommandLine::parse_from([
        "motion",
        "render",
        "--expected-revision",
        "2",
        "--segment",
        "motion-1",
        "--quality",
        "preview",
        "--workspace",
        workspace.to_str().unwrap(),
        directory.path().to_str().unwrap(),
    ]);
    let output = command.run_with_renderer(&renderer).unwrap();

    assert_eq!(output.revision, 3);
    let artifact = output.artifact.unwrap();
    assert_eq!(artifact.segment_id, "motion-1");
    assert_eq!(
        artifact.quality,
        cap_project::MotionArtifactQuality::Preview
    );
    assert!(directory.path().join(&artifact.path).is_file());
    assert!(artifact.path.ends_with("preview.webm"));
    let first_artifact_id = artifact.id.clone();

    let requests = renderer.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].composition_id, "KineticStatement");
    assert_eq!(requests[0].props["title"], "两个案例");
    assert_eq!(requests[0].props["durationInFrames"], 150);
    assert_eq!(requests[0].width, 960);
    assert_eq!(requests[0].height, 540);
    drop(requests);

    let cached_renderer = FakeRenderer::default();
    let cached = MotionCommandLine::parse_from([
        "motion",
        "render",
        "--expected-revision",
        "3",
        "--segment",
        "motion-1",
        "--quality",
        "preview",
        "--workspace",
        workspace.to_str().unwrap(),
        directory.path().to_str().unwrap(),
    ])
    .run_with_renderer(&cached_renderer)
    .unwrap();
    assert_eq!(cached.revision, 3);
    assert!(cached_renderer.requests.lock().unwrap().is_empty());

    std::fs::write(
        workspace.join("src/animation.tsx"),
        "export const version = 2;",
    )
    .unwrap();
    let changed_source_renderer = FakeRenderer::default();
    let changed_source = MotionCommandLine::parse_from([
        "motion",
        "render",
        "--expected-revision",
        "3",
        "--segment",
        "motion-1",
        "--quality",
        "preview",
        "--workspace",
        workspace.to_str().unwrap(),
        directory.path().to_str().unwrap(),
    ])
    .run_with_renderer(&changed_source_renderer)
    .unwrap();
    assert_eq!(changed_source.revision, 4);
    assert_ne!(changed_source.artifact.unwrap().id, first_artifact_id);
    assert_eq!(changed_source_renderer.requests.lock().unwrap().len(), 1);
}

#[test]
fn node_renderer_preserves_unicode_paths_and_json_without_shell_parsing() {
    use cap_motion_cli::RemotionCliRunner;
    use cap_project::MotionArtifactQuality;
    let directory = tempfile::tempdir().unwrap();
    let workspace = directory.path().join("动画 workspace & quotes");
    std::fs::create_dir_all(workspace.join("node_modules/@remotion/cli")).unwrap();
    std::fs::create_dir_all(workspace.join("src")).unwrap();
    std::fs::write(workspace.join("src/index.ts"), "// fixture").unwrap();
    std::fs::write(workspace.join("node_modules/@remotion/cli/remotion-cli.js"),
        r#"const fs = require('node:fs'); const args = process.argv.slice(2); fs.writeFileSync(args[3], JSON.stringify(args));"#).unwrap();
    let output = workspace.join("成片 & preview.json");
    let props = serde_json::json!({"title": "中文 \"quoted\" & %PATH% $HOME", "items": [1,2]});
    RemotionCliRunner
        .render(&MotionRenderRequest {
            workspace: workspace.clone(),
            composition_id: "Main".into(),
            output_path: output.clone(),
            props: props.clone(),
            quality: MotionArtifactQuality::Preview,
            width: 1920,
            height: 1080,
            fps: 30,
            duration_in_frames: 30,
            has_alpha: true,
        })
        .unwrap();
    let args: Vec<String> = serde_json::from_slice(&std::fs::read(output).unwrap()).unwrap();
    assert_eq!(args[0], "render");
    assert_eq!(args[1], workspace.join("src/index.ts").to_str().unwrap());
    let props_arg = args.iter().position(|a| a == "--props").unwrap() + 1;
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&args[props_arg]).unwrap(),
        props
    );
}
