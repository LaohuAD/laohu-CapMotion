use cap_motion_cli::{MotionCommandLine, MotionOutput};
use cap_project::ProjectConfiguration;
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
