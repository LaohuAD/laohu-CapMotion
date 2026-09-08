use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{
    AspectRatio, BackgroundSource, BackgroundSourceBinding, ProjectConfiguration,
    ProjectTransactionError, XY, mutate_project,
};

#[derive(Type, Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct BackgroundPresentationPatch {
    pub source_binding: Option<BackgroundSourceBinding>,
    pub display_position: Option<XY<f64>>,
}

#[derive(Type, Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default, deny_unknown_fields)]
pub struct ProjectPresentationPatch {
    pub aspect_ratio: Option<AspectRatio>,
    pub background: Option<BackgroundPresentationPatch>,
}

pub fn update_project_presentation(
    project_path: impl AsRef<Path>,
    expected_revision: u64,
    patch: ProjectPresentationPatch,
) -> Result<ProjectConfiguration, ProjectTransactionError> {
    let project_path = project_path.as_ref().to_path_buf();
    let desktop_snapshot = project_path
        .join("assets/current-desktop-background.jpg")
        .canonicalize()
        .ok()
        .map(|path| path.to_string_lossy().into_owned());

    mutate_project(&project_path, expected_revision, move |project| {
        if let Some(aspect_ratio) = patch.aspect_ratio {
            project.aspect_ratio = Some(aspect_ratio);
        }
        if let Some(background) = patch.background {
            if let Some(position) = background.display_position {
                if !position.x.is_finite()
                    || !position.y.is_finite()
                    || !(0.0..=1.0).contains(&position.x)
                    || !(0.0..=1.0).contains(&position.y)
                {
                    return Err("background displayPosition x and y must be between 0 and 1".into());
                }
                project.background.display_position = Some(position);
            }
            if let Some(source_binding) = background.source_binding {
                match source_binding {
                    BackgroundSourceBinding::CurrentDesktop => {
                        let path = desktop_snapshot.clone().ok_or_else(|| {
                            "currentDesktop background requires assets/current-desktop-background.jpg"
                                .to_string()
                        })?;
                        project.background.source =
                            BackgroundSource::Wallpaper { path: Some(path) };
                        project.background.source_binding = Some(source_binding);
                    }
                }
            }
        }
        Ok(())
    })
}
