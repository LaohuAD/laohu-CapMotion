# Repository Layout

## Purpose

The repository has one product base and one clearly owned Agent workflow area. Cap source stays compatible with upstream layout, while Laohu-specific content production assets remain searchable without scattering across the root.

## Product source

```text
apps/       Desktop, CLI, web, browser extension, and supporting applications
crates/     Rust capture, project, editing, rendering, encoding, and export crates
packages/   Shared TypeScript packages
infra/      Deployment infrastructure
scripts/    Cap build, release, and maintenance scripts
```

These directories follow Cap upstream conventions. Do not wrap them in another `product/` directory or move individual upstream crates into workflow folders.

## Agent entry points

```text
.agents/skills/   Codex-discoverable skills
docs/             Product architecture, specifications, and implementation plans
```

The root `AGENTS.md` is local project guidance and may contain user-specific operating rules. Cap's upstream coding guidance is preserved at `docs/upstream/cap-agent-guidelines.md` so it remains available without replacing local instructions.

## Laohu video workflow

```text
workflows/laohu-video/
  README.md
  规范/
  模板/
  示例/
  知识沉淀/
  作品/
  参考资料/
  归档/
```

Tracked reusable assets are `规范/`, `模板/`, and `示例/`. The remaining directories hold private or local material and are ignored by Git.

## Ownership rules

1. A file has one canonical location.
2. Product code lives with the Cap subsystem that builds or runs it.
3. Agent workflow rules and reusable video assets live under `workflows/laohu-video/`.
4. Skills remain under `.agents/skills/` and reference workflow assets through repository-relative paths.
5. Product design belongs in `docs/`; per-video analysis belongs in the local `作品/` tree.
6. Upstream reference source is not copied into `参考资料/Cap` after Cap becomes the root product.
7. Compatibility is handled by migrations and updated references, not permanent duplicate directories.

## Navigation checks

After a directory change, verify:

```bash
rg -n '(^|[ /])(规范|模板|examples|参考项目)/' README.md docs .agents workflows
git ls-files | sort
```

Any old-path match must either describe a migration explicitly or be updated to the canonical workflow path.
