# Contributing

Thanks for helping improve ClawTeam.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Before you contribute

- Search [existing issues](https://github.com/tageecc/clawteam/issues) to avoid duplicates.
- For **security-sensitive** reports, use [SECURITY.md](./SECURITY.md), not public issues.

## Pull requests

1. **Typecheck**: `pnpm exec tsc --noEmit` must pass.
2. **Style**: Match existing patterns in the repo.
3. **Commits**: Describe what changed and why; avoid empty or generic-only titles.
4. **Branch**: From `main`, open a PR back to `main`.
5. If behavior is user-visible, note how you tested it in the PR description.

**Tooling:** use **pnpm** for install and scripts (this repo uses `pnpm-lock.yaml`).

## Development setup

**Prerequisites:** Node.js 20+, [pnpm](https://pnpm.io), [Rust stable](https://rustup.rs/)

```bash
pnpm install
pnpm tauri:dev    # bundle OpenClaw + Node into resources/, then desktop + hot reload
pnpm dev          # Vite only (no Tauri shell)
```

If resource download fails during install:

```bash
rm -rf node_modules/.cache && pnpm install
```

**Production build**

```bash
pnpm build
pnpm tauri build   # artifacts: src-tauri/target/release/bundle/
```

`pnpm build` may download Node and bundle OpenClaw into `resources/` for packaging (see `package.json` scripts).

## Project layout

```
src/                    # React app
  components/           # UI (Dashboard, AgentView, ChatView, …)
  stores/               # Zustand
src-tauri/src/
  commands/             # gateway, config, team_meta, team_tasks, ws_gateway, …
  lib.rs                # Tauri command registration
  utils/
resources/              # bundled at build time (large artifacts gitignored)
```

## Tauri bridge

Frontend calls Rust with `invoke` from `@tauri-apps/api/core`. Commands are registered in `src-tauri/src/lib.rs`.

## Data locations (local dev)

- OpenClaw config: `~/.openclaw/openclaw.json` or `~/.openclaw-{id}/openclaw.json`
- App preferences: Tauri Store — `src/lib/appStore.ts`
- ClawTeam app data: platform `app_data_dir` (bundle id `ai.clawhub.clawteam`)

## Debugging

- Rust logs: terminal running `pnpm tauri:dev`
- Frontend: DevTools in dev
- Inspect OpenClaw JSON: `cat ~/.openclaw/openclaw.json` (adjust path per instance)

Questions: [Issues](https://github.com/tageecc/clawteam/issues).

## Releasing

See [RELEASING.md](./RELEASING.md) for version bumps, tags, and GitHub Releases (DMG / MSI / AppImage).
