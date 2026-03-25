<div align="center">

# Pond

---

**A desktop tool for multi-instance OpenClaw.**

[![GitHub Release](https://img.shields.io/github/v/release/tageecc/pond)](https://github.com/tageecc/pond/releases)
[![License](https://img.shields.io/github/license/tageecc/pond)](https://github.com/tageecc/pond/blob/main/LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/tageecc/pond)](https://github.com/tageecc/pond/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/tageecc/pond)](https://github.com/tageecc/pond/issues)

<br/>

[![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-stable-dea582?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9-f69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-docs-111111)](https://docs.openclaw.ai)

<br/>

**Pond is a native desktop shell for [OpenClaw](https://docs.openclaw.ai)**—built so you are not stuck in five terminals and three config files when you scale from one bot to **many agents** and **many instances** on the same machine.

If you use OpenClaw seriously, you already split **profiles** (`~/.openclaw` vs `~/.openclaw-{id}`), restart Gateways, watch spend, and coordinate who talks to whom. Pond puts **team management**, **Gateway control**, **chat**, **dashboards**, and **analytics** behind one UI, with Rust doing the process and filesystem work.

[GitHub Releases](https://github.com/tageecc/pond/releases) · [Contributing](./CONTRIBUTING.md) · [简体中文](./README_zh.md)

</div>

---

## Contents

- [Downloads](#downloads)
- [Why Pond](#why-pond)
- [Highlights](#highlights)
- [Screenshots](#screenshots)
- [Features](#features)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Stack](#stack)
- [FAQ](#faq)
- [Contributing](#contributing)
- [Star History](#star-history)
- [License](#license)

---

## Downloads

### Releases

| | |
|--|--|
| **All releases** | [github.com/tageecc/pond/releases](https://github.com/tageecc/pond/releases) |
| **Latest (installers)** | [github.com/tageecc/pond/releases/latest](https://github.com/tageecc/pond/releases/latest) — open **Assets** and pick the file for your OS (macOS arm64 / x86_64 DMG, Windows `.msi`, Linux `.AppImage`). |

Download installers from **[GitHub Releases](https://github.com/tageecc/pond/releases)**: **two macOS DMGs** (Apple Silicon and Intel), **Windows MSI**, and **Linux AppImage** (x64).

**macOS:** Download the DMG that matches your CPU (**Apple Silicon** vs **Intel**). Unsigned builds may be blocked by Gatekeeper—**Control-click** the app, choose **Open**, then confirm once (or allow in **System Settings → Privacy & Security**).

Maintainers: see [RELEASING.md](./RELEASING.md) for versioning and tagging.

---

## Why Pond

| Without Pond | With Pond |
|--------------|-----------|
| Jump between dirs and CLI to switch profiles | **Instance switcher**—same app, clear boundaries |
| Hard to see which Gateway is up and on which port | **Per-instance Gateway** status in the title bar and dashboard |
| Multi-agent setup lives only in JSON | **Team** surface: roles, leader, team space, tasks (`team_meta`, `team_tasks`) |
| Usage and sessions scattered | **Dashboard + Analytics**—spend, tokens, sessions, host metrics in one place |

Pond does **not** replace the OpenClaw runtime; it **operates** it: same `openclaw.json` layout, same Gateway protocol, extra structure for teams and operations.

---

## Highlights

1. **Teams first** — Multiple agents per instance with a first-class **Team** sidebar (role list, team space, tasks). Chat can target a **role** when your roster has more than one agent.
2. **Many instances, zero confusion** — Each profile is isolated (`default` vs `~/.openclaw-{id}/`), each with its own Gateway and config. Import from disk, reorder, and stay oriented.
3. **One window for ops** — Start/stop/restart Gateway per instance, tail logs, run diagnostics, manage skills, API key pools, and Tailscale hooks without leaving the app.
4. **Shipped as a real desktop app** — Tauri 2 + Rust backend, React 19 front end; tray, autostart, and window state like production software expects.

---

## Screenshots

We want real UI shots here. Add PNGs under `docs/assets/` and drop them into this section—**PRs welcome.**

---

## Features

**Team & instances**

- **Multi-agent** — Roles from `agents.list`, Team Leader, **team space** (metadata + roster via `team_meta`), **team tasks** (`team_tasks`); chat selects **role** when needed.
- **Multi-instance** — Separate OpenClaw homes on one machine; import, switch, and remember order.

**Operations**

- **Gateway lifecycle** — Per-instance start/stop/restart; port, uptime, memory; optional stop on exit.
- **Chat (WebSocket)** — Streaming, tools, reasoning, execution timeline (`ChatView`, `ws_gateway`).
- **Observability** — Dashboard + Analytics: instances, CPU/RAM, spend, tokens, cron, sessions; sync usage from sessions.

**Configuration**

- Deep settings: models, channels, skills, browser, session, workspace, heartbeat, Hooks, logs, advanced—plus **Team** in the sidebar.

**Also**

- Skills install/uninstall, catalog, open skill dirs, install via Agent path.
- Diagnostics, channel probes, API key pool import across configs.
- Onboarding: import existing `~/.openclaw` or configure provider keys.

---

## How it works

```
  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
  │  React UI   │────▶│ Tauri (Rust) │────▶│ OpenClaw Gateway │
  │  Zustand    │     │ invoke / WS  │     │  ~/.openclaw*    │
  └─────────────┘     └──────────────┘     └─────────────────┘
```

1. **Discover** — Load each **instance** from disk (`openclaw.json`).
2. **Team** — Within an instance, manage agents and Pond-side team data (`team_meta`, `team_tasks`).
3. **Control** — Rust runs **per-instance** Gateway processes.
4. **Interact** — WebSocket chat; optional **role** scope; cron and similar data read from Gateway.
5. **Observe** — Metrics and spend in-app; some persistence under app data.
6. **Configure** — Stay aligned with upstream OpenClaw conventions.

---

## Quick start

> [!TIP]
> You need **Rust** for `pnpm tauri:dev`. If you only install Node, the build will fail with `cargo metadata` errors. Install Rust via [rustup](https://rustup.rs/), then open a **new** terminal.

**Prerequisites:** Node.js **20+**, [pnpm](https://pnpm.io), [Rust stable](https://rustup.rs/)

```bash
git clone https://github.com/tageecc/pond.git
cd pond
pnpm install
pnpm tauri:dev
```

If `pnpm install` fails while fetching resources:

```bash
rm -rf node_modules/.cache && pnpm install
```

**Production build**

```bash
pnpm build
pnpm tauri build
```

Artifacts: `src-tauri/target/release/bundle/`. Large generated resources under `resources/` stay gitignored.

**Where data lives**

| Kind | Where |
|------|--------|
| App preferences (theme, autostart, tray, exit behavior, view, instance) | Tauri [Store](https://v2.tauri.app/plugin/store/) — see `src/lib/appStore.ts` |
| OpenClaw config | Each instance directory (`openclaw.json`, …) |
| Pond app data (usage, chat persistence, …) | `app_data_dir` (e.g. macOS `~/Library/Application Support/ai.clawhub.pond`) |

---

## Stack

| Layer | Tech |
|-------|------|
| UI | React 19, TypeScript, TailwindCSS, Radix UI, Framer Motion, Visx |
| Shell | Tauri 2, Rust |
| State | Zustand |
| OpenClaw | `openclaw` npm package — [docs](https://docs.openclaw.ai) |

Rust commands: `src-tauri/src/commands/` · Registration: `lib.rs` · UI: `src/components/`

---

## FAQ

**`failed to run 'cargo metadata'`** — Install Rust, restart the terminal, run `pnpm tauri:dev` again.

---

## Contributing

Issues and PRs are welcome. Run `pnpm exec tsc --noEmit` before you open a PR. See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

**Security:** [SECURITY.md](./SECURITY.md)

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=tageecc/pond&type=Date)](https://www.star-history.com/#tageecc/pond&Date)

---

## License

[MIT](LICENSE)
