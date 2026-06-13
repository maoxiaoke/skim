# Skim

**A skills manager for Claude Code & Codex.** Inventory, disable, archive, and delete the local AI skills that pile up in `~/.claude/skills`, `~/.codex/skills`, `~/.agents/skills`, and your projects — safely, from one desktop app.

> No telemetry. No network requests. Your skills never leave your machine.

## Why

Skills accumulate. Agents ship no management UI. Deleting by hand is risky, and "disable" isn't even a folder operation — it lives in each agent's config file with its own quirks. Skim handles all of it:

| Action | What Skim actually does |
|---|---|
| **Disable / Enable** | Edits the agent's *native* config — `skillOverrides` in Claude's `settings.json` (all four visibility levels), `[[skills.config]]` in Codex's `config.toml`. **Never touches your skill files.** |
| **Archive** | Moves the folder to `~/.skim/archive/` with a manifest. One-click restore, even after months. |
| **Delete** | Moves to the system Trash. Never `rm -rf`. |

Every config write is backed up first (`~/.skim/backups/`, last 10 per file), written atomically, and comment-preserving (TOML edits go through `toml_edit`). If Skim reads a config it can't parse, that agent degrades to read-only instead of guessing.

### Details Skim gets right

- **Codex path quirk**: a `[[skills.config]]` entry only works when `path` points at the `SKILL.md` file — directory paths are silently dead. Skim writes the working form and flags dead entries. (Verified against codex-cli 0.139.0.)
- **Project-level Claude skills** are disabled via `.claude/settings.local.json` — untracked by git, so you never commit a teammate-breaking change.
- **Project discovery** decodes agents' session records to find every project you've actually used, validates the directories still exist, and lets you add folders manually.
- **Claude's four visibility levels** (`on` / `name-only` / `user-invocable-only` / `off`) are exposed in Advanced mode — `name-only` keeps a skill callable while freeing its description from your context window.

## Install

**Download**: grab `Skim.dmg` from Releases, drag to Applications.

The app is currently unsigned. On first launch macOS will complain; either right-click → Open → Open, or:

```sh
xattr -dr com.apple.quarantine /Applications/Skim.app
```

**Homebrew** (once the tap is published):

```sh
brew install --cask skim-skills
```

## Develop

Prereqs: Node 22+, pnpm, Rust stable.

```sh
pnpm install
pnpm tauri dev      # run the app
pnpm test           # domain unit tests (coverage gate: 85%)
pnpm bench          # 200-skill resolve benchmark
cd src-tauri && cargo test            # Rust commands
cargo test -- --ignored               # R3 config-rehearsal + scan benchmark
pnpm tauri build    # produce .app / .dmg
```

### Architecture (docs/tech-design.md)

```
React UI  →  src/domain/   pure functions, zero IO (lint-enforced) — parse, resolve, plan
          →  src/io/       the only effectful TS — turns OpPlans into IPC calls
          →  src-tauri/    thin Rust: scoped reads, toml_edit surgical writes,
                           atomic replace + backup, trash. All destructive power lives here.
```

Design language: [docs/design.md](docs/design.md). Product spec: [docs/prd.md](docs/prd.md).

## License

MIT
