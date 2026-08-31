# Cap Foundation And Motion CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cap the repository root while preserving the existing Laohu workflow assets, then add a backward-compatible Motion data model and revision-checked CLI operations for `.cap` projects.

**Architecture:** Merge the shallow Cap upstream history into the current repository instead of copying it as an unrelated reference directory. Store motion definitions, instances, and artifacts in a defaulted top-level `motion` configuration so existing timeline struct literals remain source compatible. Store `projectRevision` in the same atomically replaced `project-config.json`, protect mutations with an advisory project lock, and fail on stale expected revisions. Keep command parsing in the lightweight `cap-motion-cli` crate so its complete mutation chain remains testable without loading Cap's native media stack.

**Tech Stack:** Git, Rust 2024, serde, specta, fs2 advisory locks, clap, Cap CLI integration tests.

---

## File map

- `LICENSE`: Cap upstream AGPLv3 and component license notice.
- `licenses/LICENSE-LAOHU-WORKFLOW-MIT`: license for the pre-existing Laohu workflow assets.
- `.gitignore`: merged Cap build exclusions plus Laohu private-media exclusions; `docs/` remains trackable.
- `README.md`: product positioning, upstream relationship, build entry points, and retained workflow documentation.
- `docs/architecture/repository-layout.md`: explains which directories are Cap product source and which are Agent workflow assets.
- `workflows/laohu-video/README.md`: single navigation entry for all video workflow assets.
- `crates/project/src/motion.rs`: motion definitions, instances, artifacts, validation, and duration behavior.
- `crates/project/src/transaction.rs`: project lock and atomic revision-checked configuration mutation.
- `crates/project/src/lib.rs`: exports the new motion and revision modules.
- `crates/project/src/configuration.rs`: adds the defaulted `motion` field to `ProjectConfiguration`.
- `crates/project/Cargo.toml`: adds `fs2` for advisory file locking.
- `crates/project/src/motion_operations.rs`: tested motion add, move, resize, and props domain operations.
- `crates/motion-cli/`: isolated clap protocol and command-chain tests.
- `apps/cli/src/project.rs`: exposes current revision in project inspection.
- `apps/cli/src/main.rs`: clap command definitions and dispatch.
- `apps/cli/tests/cli.rs`: black-box CLI coverage.
- `apps/cli/README.md`: command reference and examples.

### Task 1: Merge Cap upstream into the product root — completed

**Files:**
- Modify: repository Git history and root tracked tree
- Modify: `.gitignore`
- Modify: `LICENSE`
- Create: `licenses/LICENSE-LAOHU-WORKFLOW-MIT`
- Modify: `README.md`
- Create: `docs/architecture/repository-layout.md`

- [ ] **Step 1: Register and fetch the upstream repository**

Run:

```bash
git remote add upstream https://github.com/CapSoftware/Cap.git
git fetch --depth=1 upstream main
```

Expected: `git remote -v` shows `origin` at `LaohuAD/laohu-Voice2MotionFrameCut` and `upstream` at `CapSoftware/Cap`.

- [ ] **Step 2: Merge the upstream root without committing conflict resolutions**

Run:

```bash
git merge --allow-unrelated-histories --no-commit upstream/main
```

Expected: Cap source directories are staged and conflicts are limited to overlapping root documentation or policy files.

- [ ] **Step 3: Resolve repository identity and ignore rules**

Preserve these Laohu exclusions in the merged `.gitignore`:

```gitignore
AGENTS.md
LOG.md
skills-lock.json
作品/
知识沉淀/
参考项目/
归档/
*.mp4
*.mov
*.mkv
*.webm
*.wav
*.mp3
*.srt
*.ass
*.vtt
*.edl.json
*.raw.json
```

Preserve Cap build exclusions such as `node_modules`, `target`, `.turbo`, `.output`, `.sst`, and local environment files. Do not include Cap's `/docs/` ignore rule because product specifications and plans are tracked.

- [ ] **Step 4: Preserve licensing correctly**

Move the former root MIT text to `licenses/LICENSE-LAOHU-WORKFLOW-MIT`, then use Cap's upstream `LICENSE` as the root license. Add a short notice above the MIT text:

```text
This license applies to the original Laohu workflow, documentation, Agent skills,
and templates that predate the Cap source merge, except where a file states otherwise.
```

Expected: Cap source is not incorrectly relicensed as MIT.

- [ ] **Step 5: Rewrite the product README and repository layout note**

The README must state:

```text
- This repository is a Cap fork and desktop product base.
- Cap remains a separate app from Codex.
- Existing ASR, EDL, subtitle, and Remotion assets are supporting workflows.
- macOS is the first implementation target.
- upstream sync uses the CapSoftware/Cap remote.
```

`docs/architecture/repository-layout.md` must map `apps/`, `crates/`, and `packages/` to Cap, `.agents/skills/` to Agent discovery, and `workflows/laohu-video/` to the Laohu workflow.

Consolidate tracked workflow assets under one owner directory:

```text
规范/                    -> workflows/laohu-video/规范/
模板/                    -> workflows/laohu-video/模板/
examples/                -> workflows/laohu-video/示例/
.env.example             -> workflows/laohu-video/.env.example
```

Keep `.agents/skills/` at the root because it is the standard Agent discovery path. Update tracked references after moving files; do not keep duplicate compatibility copies.

Create `workflows/laohu-video/README.md` as the only workflow navigation entry. It must identify the private local directories `知识沉淀/`, `作品/`, `参考资料/`, and `归档/`, even when they are absent from a fresh clone.

- [ ] **Step 6: Move local private workflow directories into their owner area**

If present, move ignored local directories without adding their contents to Git:

```text
知识沉淀/                 -> workflows/laohu-video/知识沉淀/
作品/                     -> workflows/laohu-video/作品/
参考项目/                 -> workflows/laohu-video/参考资料/
归档/                     -> workflows/laohu-video/归档/
```

Before each move, verify the source and destination explicitly. If both exist, merge by named child entry and stop on a name collision; never overwrite private files.

- [ ] **Step 7: Remove the duplicate nested Cap checkout from the working tree**

Delete only the migrated `workflows/laohu-video/参考资料/Cap` after verifying that root `apps/`, `crates/`, `packages/`, `Cargo.toml`, and `package.json` exist. Preserve every unrelated reference entry.

- [ ] **Step 8: Validate and commit the merge**

Run:

```bash
git diff --check
git status --short
git commit -m "feat: adopt Cap as the product foundation"
```

Expected: one merge commit with Cap source at root and all pre-existing workflow assets retained.

### Task 2: Add the backward-compatible Motion domain model — completed

**Files:**
- Create: `crates/project/src/motion.rs`
- Modify: `crates/project/src/lib.rs`
- Modify: `crates/project/src/configuration.rs`
- Test: `crates/project/src/motion.rs`

- [ ] **Step 1: Write failing serialization and validation tests**

Add tests covering an empty old configuration, a full motion round trip, and minimum duration rejection:

```rust
#[test]
fn missing_motion_configuration_defaults_to_empty() {
    let project: ProjectConfiguration = serde_json::from_str("{}").unwrap();
    assert!(project.motion.definitions.is_empty());
    assert!(project.motion.segments.is_empty());
    assert!(project.motion.artifacts.is_empty());
}

#[test]
fn motion_configuration_round_trips() {
    let mut project = ProjectConfiguration::default();
    project.motion.definitions.push(sample_definition());
    project.motion.segments.push(sample_segment());
    let json = serde_json::to_string(&project).unwrap();
    let decoded: ProjectConfiguration = serde_json::from_str(&json).unwrap();
    assert_eq!(decoded.motion.segments[0].definition_id, "case-cards");
}

#[test]
fn responsive_segment_rejects_duration_below_definition_minimum() {
    let error = sample_segment()
        .validate_against(&sample_definition(), 0.4)
        .unwrap_err();
    assert!(matches!(error, MotionValidationError::DurationBelowMinimum { .. }));
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cargo test -p cap-project motion -- --nocapture
```

Expected: FAIL because the motion module and `ProjectConfiguration.motion` do not exist.

- [ ] **Step 3: Implement focused motion types**

Define the following public types in `motion.rs` with `Type`, `Serialize`, `Deserialize`, `Clone`, `Debug`, and equality derives where valid:

```rust
pub enum MotionRenderer { Remotion }
pub enum MotionDurationPolicy { Responsive, Retime, Trim }
pub enum MotionDefinitionStatus { Draft, Approved, Published, Deprecated }
pub enum MotionArtifactQuality { Preview, Final }
pub enum MotionArtifactStatus { Ready, Rendering, Stale, Failed }
pub struct MotionTransform { pub x: f64, pub y: f64, pub scale_x: f64, pub scale_y: f64, pub rotation: f64 }
pub enum MotionParameterValue { Null, Bool(bool), Number(f64), String(String), Array(Vec<MotionParameterValue>), Object(BTreeMap<String, MotionParameterValue>) }
pub struct MotionDefinition { pub id: String, pub version: String, pub renderer: MotionRenderer, pub source: String, pub composition_id: String, pub status: MotionDefinitionStatus, pub min_duration: f64, pub default_duration: f64, pub max_duration: Option<f64>, pub default_policy: MotionDurationPolicy, pub intro_duration: f64, pub outro_duration: f64, pub default_props: BTreeMap<String, MotionParameterValue> }
pub struct MotionSegment { pub id: String, pub definition_id: String, pub definition_version: String, pub start: f64, pub end: f64, pub track: u32, pub z_index: i32, pub transform: MotionTransform, pub opacity: f64, pub duration_policy: MotionDurationPolicy, pub props: BTreeMap<String, MotionParameterValue>, pub artifact_id: Option<String> }
pub struct MotionArtifact { pub id: String, pub segment_id: String, pub content_hash: String, pub quality: MotionArtifactQuality, pub status: MotionArtifactStatus, pub path: String, pub width: u32, pub height: u32, pub fps: u32, pub has_alpha: bool, pub duration: f64, pub error: Option<String> }
pub struct MotionConfiguration { pub definitions: Vec<MotionDefinition>, pub segments: Vec<MotionSegment>, pub artifacts: Vec<MotionArtifact> }
```

All JSON fields use camelCase. Defaults produce an empty `MotionConfiguration`, identity transform, opacity `1.0`, and responsive duration policy.

- [ ] **Step 4: Add validation and lookup methods**

Implement:

```rust
impl MotionSegment {
    pub fn duration(&self) -> f64;
    pub fn validate_against(
        &self,
        definition: &MotionDefinition,
        requested_duration: f64,
    ) -> Result<(), MotionValidationError>;
}

impl MotionConfiguration {
    pub fn definition(&self, id: &str, version: &str) -> Option<&MotionDefinition>;
    pub fn segment(&self, id: &str) -> Option<&MotionSegment>;
    pub fn segment_mut(&mut self, id: &str) -> Option<&mut MotionSegment>;
    pub fn validate(&self) -> Result<(), MotionValidationError>;
}
```

Validation rejects missing definitions, duplicate IDs, non-finite times, `end <= start`, opacity outside `0..=1`, and responsive durations below `min_duration` or above `max_duration`.

- [ ] **Step 5: Export the module and add the defaulted project field**

In `lib.rs` add `mod motion; pub use motion::*;`. In `ProjectConfiguration` add:

```rust
#[serde(default)]
pub motion: MotionConfiguration,
```

and initialize it in `Default`.

- [ ] **Step 6: Run scoped checks and commit**

Run:

```bash
cargo fmt --all
cargo test -p cap-project motion -- --nocapture
cargo check -p cap-project
git add crates/project
git commit -m "feat: add motion project model"
```

Expected: all motion tests pass and old `{}` configurations deserialize.

### Task 3: Add revision-checked project mutation — completed with single-file revision

**Files:**
- Create: `crates/project/src/transaction.rs`
- Modify: `crates/project/src/lib.rs`
- Modify: `crates/project/Cargo.toml`
- Test: `crates/project/src/revision.rs`

- [ ] **Step 1: Write failing revision tests**

Add tests that create a temporary `.cap` directory and verify initial revision, successful mutation, stale rejection, and no partial write:

```rust
#[test]
fn stale_revision_does_not_change_configuration() {
    let dir = tempfile::tempdir().unwrap();
    ProjectConfiguration::default().write(dir.path()).unwrap();
    mutate_project(dir.path(), 0, |project| {
        project.audio.mute = true;
        Ok(())
    })
    .unwrap();
    let error = mutate_project(dir.path(), 0, |project| {
        project.audio.mute = false;
        Ok(())
    })
    .unwrap_err();
    assert!(matches!(error, ProjectMutationError::RevisionConflict { current: 1, expected: 0 }));
    assert!(ProjectConfiguration::load(dir.path()).unwrap().audio.mute);
}
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
cargo test -p cap-project revision -- --nocapture
```

Expected: FAIL because revision support does not exist.

- [x] **Step 3: Implement the single-file revision and advisory lock**

Add `fs2 = "0.4"` and implement:

```rust
pub enum ProjectTransactionError { Io(std::io::Error), RevisionConflict { expected: u64, actual: u64 }, RevisionOverflow, Mutation(String) }
pub fn mutate_project<F>(project_path: &Path, expected_revision: u64, mutate: F) -> Result<ProjectConfiguration, ProjectTransactionError>
where F: FnOnce(&mut ProjectConfiguration) -> Result<(), String>;
```

`mutate_project` opens `.project-config.lock`, acquires an exclusive advisory lock, reloads `project-config.json`, checks `projectRevision`, runs the closure, validates the full configuration, increments the revision, and atomically replaces the one configuration file. This removes the failure window and directory clutter of a separate revision sidecar.

- [ ] **Step 4: Run scoped checks and commit**

Run:

```bash
cargo fmt --all
cargo test -p cap-project revision -- --nocapture
cargo check -p cap-project
git add crates/project
git commit -m "feat: add revision checked project mutations"
```

Expected: stale revisions never alter the configuration and successful mutations increment exactly once.

### Task 4: Implement Motion CLI domain operations — core complete, native binary verification pending Xcode

**Files:**
- Create: `crates/motion-cli/src/lib.rs`
- Create: `crates/project/src/motion_operations.rs`
- Modify: `apps/cli/src/main.rs`
- Modify: `apps/cli/src/project.rs`
- Test: `crates/motion-cli/tests/commands.rs`
- Test: `crates/project/tests/motion_operations.rs`

- [ ] **Step 1: Write failing black-box CLI tests**

Add tests for `motion definition register`, `motion add`, `move`, `resize`, `props set`, and stale revisions. Register a definition before adding its first instance:

```rust
let definition = run(&[
    "motion", "definition", "register", project.to_str().unwrap(),
    "--expected-revision", "0",
    "--id", "case-cards",
    "--version", "1.0.0",
    "--source", "motion/case-cards",
    "--composition-id", "CaseCards",
    "--min-duration", "1.0",
    "--default-duration", "5.0",
    "--format", "json",
]);
assert!(definition.status.success(), "stderr: {}", stderr(&definition));
```

A representative add assertion is:

```rust
let output = run(&[
    "motion", "add", project.to_str().unwrap(),
    "--expected-revision", "1",
    "--definition-id", "case-cards",
    "--definition-version", "1.0.0",
    "--segment-id", "motion-1",
    "--start", "12.5",
    "--duration", "5.0",
    "--format", "json",
]);
assert!(output.status.success(), "stderr: {}", stderr(&output));
let json = parse_json(&output);
assert_eq!(json["revision"], 2);
assert_eq!(json["segment"]["start"], 12.5);
```

- [ ] **Step 2: Run the CLI test and verify it fails**

The original black-box command cannot currently reach the feature test because Cap's macOS `cidre` dependency calls `xcodebuild`, and this machine only has Command Line Tools. The command protocol is therefore tested through the isolated crate:

```bash
cargo test -p cap-motion-cli
```

The full `cargo check -p cap` remains an explicit environment-gated acceptance check.

- [ ] **Step 3: Implement typed motion operations**

Implement functions that call `cap_project::mutate_project`:

```rust
pub fn register_definition(args: MotionDefinitionRegisterArgs) -> Result<MotionMutationResult, String>;
pub fn add(args: MotionAddArgs) -> Result<MotionMutationResult, String>;
pub fn move_segment(args: MotionMoveArgs) -> Result<MotionMutationResult, String>;
pub fn resize(args: MotionResizeArgs) -> Result<MotionMutationResult, String>;
pub fn set_props(args: MotionPropsSetArgs) -> Result<MotionMutationResult, String>;
```

`add` requires an existing definition and unique segment ID. `move` preserves duration. `resize` validates the selected duration policy. `props set` accepts a JSON object, converts it to `MotionParameterValue`, and marks the referenced artifact stale when render inputs change.

- [ ] **Step 4: Add clap commands and structured output**

Add top-level `motion` with subcommands:

```text
motion definition register
motion add
motion move
motion resize
motion props set
```

Every mutating command requires `--expected-revision`. JSON output includes `ok`, `revision`, and the changed segment. Revision conflicts must be machine-readable and non-zero.

- [ ] **Step 5: Add revision to project inspection**

Extend `ProjectInspection` with `revision: u64` loaded through `load_project_revision` so Codex can obtain the correct precondition before any mutation.

- [ ] **Step 6: Run scoped checks and commit**

Run:

```bash
cargo fmt --all
cargo test -p cap --test cli motion_ -- --nocapture
cargo check -p cap
git add apps/cli
git commit -m "feat: add revision safe motion CLI"
```

Expected: all motion commands round-trip through the real CLI binary and stale updates fail safely.

### Task 5: Document and verify the first vertical slice — in progress

**Files:**
- Modify: `apps/cli/README.md`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-29-cap-foundation-motion-cli.md`

- [ ] **Step 1: Document a complete Agent workflow**

Add an example that runs:

```bash
cap project inspect /path/to/demo.cap --format json
cap motion definition register /path/to/demo.cap --expected-revision 0 --id case-cards --version 1.0.0 --source motion/case-cards --composition-id CaseCards --min-duration 1 --default-duration 5 --format json
cap motion add /path/to/demo.cap --expected-revision 1 --definition-id case-cards --definition-version 1.0.0 --segment-id motion-1 --start 12.5 --duration 5 --format json
cap motion move /path/to/demo.cap --expected-revision 2 --segment motion-1 --start 18 --format json
cap motion resize /path/to/demo.cap --expected-revision 3 --segment motion-1 --duration 8 --format json
```

Explain that the render artifact is still pending in this phase and that Cap UI/media integration follows in the next implementation plan.

- [ ] **Step 2: Run final scoped validation**

Run:

```bash
cargo fmt --all -- --check
cargo test -p cap-project
cargo test -p cap --test cli
cargo check -p cap
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 3: Audit repository state and retained assets**

Run:

```bash
test -d apps/desktop
test -d crates/project
test -d .agents/skills
test -d workflows/laohu-video/规范
test -d workflows/laohu-video/模板
git remote -v
git status --short
```

Expected: Cap is the root product, workflow assets remain, both remotes exist, and only intentional plan progress changes remain.

- [ ] **Step 4: Commit documentation**

Run:

```bash
git add README.md apps/cli/README.md docs/superpowers/plans/2026-08-29-cap-foundation-motion-cli.md
git commit -m "docs: describe the motion CLI workflow"
```

Expected: the first vertical slice is independently buildable, testable, and documented.
