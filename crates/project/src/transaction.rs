use std::{fmt, fs::OpenOptions, io, path::Path};

use fs2::FileExt;

use crate::ProjectConfiguration;

#[derive(Debug)]
pub enum ProjectTransactionError {
    Io(io::Error),
    RevisionConflict { expected: u64, actual: u64 },
    RevisionOverflow,
    Mutation(String),
}

impl fmt::Display for ProjectTransactionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => error.fmt(formatter),
            Self::RevisionConflict { expected, actual } => write!(
                formatter,
                "project revision conflict: expected {expected}, found {actual}"
            ),
            Self::RevisionOverflow => formatter.write_str("project revision overflow"),
            Self::Mutation(message) => formatter.write_str(message),
        }
    }
}

impl std::error::Error for ProjectTransactionError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            _ => None,
        }
    }
}

impl From<io::Error> for ProjectTransactionError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

pub fn mutate_project<F>(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    mutation: F,
) -> Result<ProjectConfiguration, ProjectTransactionError>
where
    F: FnOnce(&mut ProjectConfiguration) -> Result<(), String>,
{
    let project_path = project_path.as_ref();
    let lock_path = project_path.join(".project-config.lock");
    let lock_file = OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .truncate(false)
        .open(lock_path)?;
    lock_file.lock_exclusive()?;

    let result = (|| {
        let mut project = ProjectConfiguration::load(project_path)?;
        if project.project_revision != expected_revision {
            return Err(ProjectTransactionError::RevisionConflict {
                expected: expected_revision,
                actual: project.project_revision,
            });
        }

        mutation(&mut project).map_err(ProjectTransactionError::Mutation)?;
        project.project_revision = project
            .project_revision
            .checked_add(1)
            .ok_or(ProjectTransactionError::RevisionOverflow)?;
        project.write(project_path)?;
        Ok(project)
    })();

    lock_file.unlock()?;
    result
}

pub fn replace_project_configuration(
    project_path: impl AsRef<Path>,
    replacement: ProjectConfiguration,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    let expected_revision = replacement.project_revision;
    mutate_project(project_path, expected_revision, move |project| {
        *project = replacement;
        project.project_revision = expected_revision;
        Ok(())
    })
}
