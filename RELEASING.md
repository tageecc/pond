# Releasing ClawTeam

ClawTeam ships **macOS DMG**, **Windows MSI**, and **Linux AppImage** via [GitHub Releases](https://github.com/tageecc/clawteam/releases). Builds run in CI when you push a **version tag** (`v*`), using [tauri-apps/tauri-action](https://github.com/tauri-apps/tauri-action).

## One-time: repository settings

1. **Actions permissions**  
   Settings → Actions → General → Workflow permissions → **Read and write** (so `GITHUB_TOKEN` can create releases and upload assets).

2. **Optional: signing / updater**  
   For Tauri updater signing, add repo secret `TAURI_SIGNING_PRIVATE_KEY` (see [Tauri signing](https://v2.tauri.app/plugin/updater/)). Not required to attach unsigned DMG/MSI/AppImage for manual download.

## Version alignment

Before tagging, bump the same version in:

- `package.json` (`version`)
- `src-tauri/tauri.conf.json` (`version`)
- `src-tauri/Cargo.toml` (`version`)

Then update `CHANGELOG.md` under `[Unreleased]` or the new section.

## Publish a release

```bash
git checkout main
git pull
# edit versions + CHANGELOG, commit
git tag v1.0.1
git push origin main
git push origin v1.0.1
```

Pushing the tag starts **CI → Release** jobs (macOS, Ubuntu, Windows). They attach artifacts to a **draft** GitHub Release. Open the release on GitHub, check notes and files, then **Publish release**.

## What users download

| Platform | CI artifact |
|----------|----------------|
| macOS Apple Silicon (M1/M2/M3) | DMG built for `aarch64-apple-darwin` |
| macOS Intel | DMG built for `x86_64-apple-darwin` |
| Windows x64 | `.msi` |
| Linux x64 | `.AppImage` |

Filenames follow Tauri bundle output (look for `aarch64`, `x86_64`, or `arm64` in the asset name). Local builds: `src-tauri/target/release/bundle/`.

## Local smoke build

若环境里存在 `CI=1`（部分 IDE/自动化会注入），直接运行 `pnpm tauri build` 可能报错 `invalid value '1' for '--ci'`。请使用：

```bash
pnpm install
pnpm tauri:build
```

或先清除：`env -u CI pnpm exec tauri build`。

Artifacts appear under `src-tauri/target/release/bundle/`.
