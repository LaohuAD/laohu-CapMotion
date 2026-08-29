use std::{collections::BTreeSet, fmt};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use specta::Type;

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MotionRenderer {
    #[default]
    Remotion,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MotionDurationPolicy {
    #[default]
    Responsive,
    Retime,
    Trim,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MotionDefinitionStatus {
    #[default]
    Draft,
    Approved,
    Published,
    Deprecated,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MotionArtifactQuality {
    #[default]
    Preview,
    Final,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MotionArtifactStatus {
    #[default]
    Ready,
    Rendering,
    Stale,
    Failed,
}

#[derive(Type, Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MotionTransform {
    pub x: f64,
    pub y: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub rotation: f64,
}

impl Default for MotionTransform {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
        }
    }
}

#[derive(Type, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MotionDefinition {
    pub id: String,
    pub version: u32,
    pub renderer: MotionRenderer,
    pub source: String,
    pub composition_id: String,
    pub status: MotionDefinitionStatus,
    pub min_duration: f64,
    pub default_duration: f64,
    pub max_duration: f64,
    pub default_policy: MotionDurationPolicy,
    pub intro_duration: f64,
    pub outro_duration: f64,
    pub default_props: Value,
}

impl Default for MotionDefinition {
    fn default() -> Self {
        Self {
            id: String::new(),
            version: 1,
            renderer: MotionRenderer::default(),
            source: String::new(),
            composition_id: String::new(),
            status: MotionDefinitionStatus::default(),
            min_duration: 0.0,
            default_duration: 0.0,
            max_duration: f64::MAX,
            default_policy: MotionDurationPolicy::default(),
            intro_duration: 0.0,
            outro_duration: 0.0,
            default_props: Value::Object(Default::default()),
        }
    }
}

#[derive(Type, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MotionSegment {
    pub id: String,
    pub definition_id: String,
    pub definition_version: u32,
    pub start: f64,
    pub end: f64,
    pub track: u32,
    pub z_index: i32,
    pub transform: MotionTransform,
    pub opacity: f64,
    pub duration_policy: MotionDurationPolicy,
    pub props: Value,
    pub artifact_id: Option<String>,
}

impl Default for MotionSegment {
    fn default() -> Self {
        Self {
            id: String::new(),
            definition_id: String::new(),
            definition_version: 1,
            start: 0.0,
            end: 0.0,
            track: 0,
            z_index: 0,
            transform: MotionTransform::default(),
            opacity: 1.0,
            duration_policy: MotionDurationPolicy::default(),
            props: Value::Object(Default::default()),
            artifact_id: None,
        }
    }
}

impl MotionSegment {
    pub fn duration(&self) -> f64 {
        self.end - self.start
    }

    pub fn validate_against(
        &self,
        definition: &MotionDefinition,
    ) -> Result<(), MotionValidationError> {
        if !self.start.is_finite() || !self.end.is_finite() || self.end <= self.start {
            return Err(MotionValidationError::InvalidTimeRange {
                segment_id: self.id.clone(),
                start: self.start,
                end: self.end,
            });
        }

        if !self.opacity.is_finite() || !(0.0..=1.0).contains(&self.opacity) {
            return Err(MotionValidationError::InvalidOpacity {
                segment_id: self.id.clone(),
                opacity: self.opacity,
            });
        }

        if self.duration_policy == MotionDurationPolicy::Responsive {
            let duration = self.duration();
            if duration < definition.min_duration || duration > definition.max_duration {
                return Err(MotionValidationError::DurationOutOfBounds {
                    segment_id: self.id.clone(),
                    duration,
                    min: definition.min_duration,
                    max: definition.max_duration,
                });
            }
        }

        Ok(())
    }
}

#[derive(Type, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MotionArtifact {
    pub id: String,
    pub segment_id: String,
    pub content_hash: String,
    pub quality: MotionArtifactQuality,
    pub status: MotionArtifactStatus,
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub has_alpha: bool,
    pub duration: f64,
    pub error: Option<String>,
}

impl Default for MotionArtifact {
    fn default() -> Self {
        Self {
            id: String::new(),
            segment_id: String::new(),
            content_hash: String::new(),
            quality: MotionArtifactQuality::default(),
            status: MotionArtifactStatus::default(),
            path: String::new(),
            width: 0,
            height: 0,
            fps: 0.0,
            has_alpha: false,
            duration: 0.0,
            error: None,
        }
    }
}

#[derive(Type, Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct MotionConfiguration {
    pub definitions: Vec<MotionDefinition>,
    pub segments: Vec<MotionSegment>,
    pub artifacts: Vec<MotionArtifact>,
}

impl MotionConfiguration {
    pub fn definition(&self, id: &str, version: u32) -> Option<&MotionDefinition> {
        self.definitions
            .iter()
            .find(|definition| definition.id == id && definition.version == version)
    }

    pub fn segment(&self, id: &str) -> Option<&MotionSegment> {
        self.segments.iter().find(|segment| segment.id == id)
    }

    pub fn segment_mut(&mut self, id: &str) -> Option<&mut MotionSegment> {
        self.segments.iter_mut().find(|segment| segment.id == id)
    }

    pub fn validate(&self) -> Result<(), MotionValidationError> {
        let mut definition_keys = BTreeSet::new();
        for definition in &self.definitions {
            let key = (definition.id.as_str(), definition.version);
            if !definition_keys.insert(key) {
                return Err(MotionValidationError::DuplicateDefinition {
                    definition_id: definition.id.clone(),
                    definition_version: definition.version,
                });
            }

            if !definition.min_duration.is_finite()
                || !definition.default_duration.is_finite()
                || !definition.max_duration.is_finite()
                || definition.min_duration < 0.0
                || definition.min_duration > definition.default_duration
                || definition.default_duration > definition.max_duration
                || definition.intro_duration < 0.0
                || definition.outro_duration < 0.0
                || definition.intro_duration + definition.outro_duration > definition.min_duration
            {
                return Err(MotionValidationError::InvalidDefinitionDuration {
                    definition_id: definition.id.clone(),
                    definition_version: definition.version,
                });
            }
        }

        let mut segment_ids = BTreeSet::new();
        for segment in &self.segments {
            if !segment_ids.insert(segment.id.as_str()) {
                return Err(MotionValidationError::DuplicateSegment {
                    segment_id: segment.id.clone(),
                });
            }

            let definition = self
                .definition(&segment.definition_id, segment.definition_version)
                .ok_or_else(|| MotionValidationError::DefinitionNotFound {
                    segment_id: segment.id.clone(),
                    definition_id: segment.definition_id.clone(),
                    definition_version: segment.definition_version,
                })?;
            segment.validate_against(definition)?;
        }

        let mut artifact_ids = BTreeSet::new();
        for artifact in &self.artifacts {
            if !artifact_ids.insert(artifact.id.as_str()) {
                return Err(MotionValidationError::DuplicateArtifact {
                    artifact_id: artifact.id.clone(),
                });
            }
            if self.segment(&artifact.segment_id).is_none() {
                return Err(MotionValidationError::ArtifactSegmentNotFound {
                    artifact_id: artifact.id.clone(),
                    segment_id: artifact.segment_id.clone(),
                });
            }
        }

        Ok(())
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum MotionValidationError {
    DuplicateDefinition {
        definition_id: String,
        definition_version: u32,
    },
    DuplicateSegment {
        segment_id: String,
    },
    DuplicateArtifact {
        artifact_id: String,
    },
    DefinitionNotFound {
        segment_id: String,
        definition_id: String,
        definition_version: u32,
    },
    ArtifactSegmentNotFound {
        artifact_id: String,
        segment_id: String,
    },
    InvalidDefinitionDuration {
        definition_id: String,
        definition_version: u32,
    },
    InvalidTimeRange {
        segment_id: String,
        start: f64,
        end: f64,
    },
    InvalidOpacity {
        segment_id: String,
        opacity: f64,
    },
    DurationOutOfBounds {
        segment_id: String,
        duration: f64,
        min: f64,
        max: f64,
    },
}

impl fmt::Display for MotionValidationError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid motion configuration: {self:?}")
    }
}

impl std::error::Error for MotionValidationError {}
