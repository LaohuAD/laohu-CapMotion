use std::path::PathBuf;

use cap_project::{
    MotionDefinition, MotionDefinitionStatus, MotionDurationPolicy, MotionSegment,
    ProjectConfiguration, add_motion_segment, move_motion_segment, register_motion_definition,
    resize_motion_segment, set_motion_segment_props,
};
use clap::{Args, Parser, Subcommand, ValueEnum};
use serde::Serialize;
use serde_json::Value;

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
        match self.command {
            MotionCommands::Definition(args) => args.run(),
            MotionCommands::Add(args) => args.run(),
            MotionCommands::Move(args) => args.run(),
            MotionCommands::Resize(args) => args.run(),
            MotionCommands::Props(args) => args.run(),
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
    Add(MotionAddArgs),
    Move(MotionMoveArgs),
    Resize(MotionResizeArgs),
    Props(MotionPropsArgs),
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
}

impl MotionOutput {
    fn definition(project: ProjectConfiguration, definition: Option<MotionDefinition>) -> Self {
        Self {
            ok: true,
            revision: project.project_revision,
            definition,
            segment: None,
        }
    }

    fn segment(project: ProjectConfiguration, segment: Option<MotionSegment>) -> Self {
        Self {
            ok: true,
            revision: project.project_revision,
            definition: None,
            segment,
        }
    }
}
