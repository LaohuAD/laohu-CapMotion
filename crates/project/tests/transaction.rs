use std::sync::{Arc, Barrier};

use cap_project::{
    MotionDefinition, ProjectConfiguration, ProjectTransactionError, mutate_project,
    replace_project_configuration,
};

fn create_project() -> tempfile::TempDir {
    let directory = tempfile::tempdir().unwrap();
    ProjectConfiguration::default()
        .write(directory.path())
        .unwrap();
    directory
}

fn definition(id: &str) -> MotionDefinition {
    serde_json::from_value(serde_json::json!({
        "id": id,
        "version": 1,
        "renderer": "remotion",
        "source": format!("motion/{id}"),
        "compositionId": "Test",
        "status": "draft",
        "minDuration": 1.0,
        "defaultDuration": 2.0,
        "maxDuration": 5.0,
        "defaultPolicy": "responsive",
        "introDuration": 0.2,
        "outroDuration": 0.2
    }))
    .unwrap()
}

#[test]
fn legacy_project_revision_defaults_to_zero() {
    let project: ProjectConfiguration = serde_json::from_value(serde_json::json!({})).unwrap();

    assert_eq!(project.project_revision, 0);
}

#[test]
fn successful_mutation_increments_revision_and_persists_once() {
    let directory = create_project();

    let updated = mutate_project(directory.path(), 0, |project| {
        project.motion.definitions.push(definition("title"));
        Ok(())
    })
    .unwrap();

    assert_eq!(updated.project_revision, 1);
    assert_eq!(updated.motion.definitions[0].id, "title");
    let loaded = ProjectConfiguration::load(directory.path()).unwrap();
    assert_eq!(loaded.project_revision, 1);
    assert_eq!(loaded.motion.definitions[0].id, "title");
}

#[test]
fn stale_revision_is_rejected_without_changing_the_project() {
    let directory = create_project();
    mutate_project(directory.path(), 0, |_| Ok(())).unwrap();

    let error = mutate_project(directory.path(), 0, |project| {
        project.motion.definitions.push(definition("stale"));
        Ok(())
    })
    .unwrap_err();

    assert!(matches!(
        error,
        ProjectTransactionError::RevisionConflict {
            expected: 0,
            actual: 1
        }
    ));
    let loaded = ProjectConfiguration::load(directory.path()).unwrap();
    assert_eq!(loaded.project_revision, 1);
    assert!(loaded.motion.definitions.is_empty());
}

#[test]
fn failed_mutation_does_not_change_config_or_revision() {
    let directory = create_project();

    let error = mutate_project(directory.path(), 0, |project| {
        project.motion.definitions.push(definition("discarded"));
        Err("user cancelled".into())
    })
    .unwrap_err();

    assert!(matches!(
        error,
        ProjectTransactionError::Mutation(message) if message == "user cancelled"
    ));
    let loaded = ProjectConfiguration::load(directory.path()).unwrap();
    assert_eq!(loaded.project_revision, 0);
    assert!(loaded.motion.definitions.is_empty());
}

#[test]
fn concurrent_writers_with_the_same_revision_cannot_both_commit() {
    let directory = create_project();
    let path = Arc::new(directory.path().to_path_buf());
    let barrier = Arc::new(Barrier::new(3));
    let mut handles = Vec::new();

    for id in ["first", "second"] {
        let path = Arc::clone(&path);
        let barrier = Arc::clone(&barrier);
        handles.push(std::thread::spawn(move || {
            barrier.wait();
            mutate_project(path.as_ref(), 0, |project| {
                project.motion.definitions.push(definition(id));
                Ok(())
            })
        }));
    }

    barrier.wait();
    let results: Vec<_> = handles
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect();

    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert_eq!(
        results
            .iter()
            .filter(|result| matches!(
                result,
                Err(ProjectTransactionError::RevisionConflict { .. })
            ))
            .count(),
        1
    );
    let loaded = ProjectConfiguration::load(directory.path()).unwrap();
    assert_eq!(loaded.project_revision, 1);
    assert_eq!(loaded.motion.definitions.len(), 1);
}

#[test]
fn editor_replacement_uses_the_same_revision_transaction() {
    let directory = create_project();
    let mut replacement = ProjectConfiguration::load(directory.path()).unwrap();
    replacement.audio.mute = true;

    let updated = replace_project_configuration(directory.path(), replacement).unwrap();

    assert_eq!(updated.project_revision, 1);
    assert!(updated.audio.mute);
    let mut stale = ProjectConfiguration::default();
    stale.project_revision = 0;
    let error = replace_project_configuration(directory.path(), stale).unwrap_err();
    assert!(matches!(
        error,
        ProjectTransactionError::RevisionConflict {
            expected: 0,
            actual: 1
        }
    ));
    let persisted = ProjectConfiguration::load(directory.path()).unwrap();
    assert!(persisted.audio.mute);
    assert_eq!(persisted.project_revision, 1);
}
