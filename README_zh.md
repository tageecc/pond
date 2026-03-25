<div align="center">

# Pond

---

**面向多实例的 OpenClaw 桌面工具。**

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

**Pond 是 [OpenClaw](https://docs.openclaw.ai) 的桌面控制面**：当你从「一个 bot」升级到 **多智能体**、**多实例** 时，不必在多个终端和零散配置里来回切换——**团队管理、Gateway、对话、概览与数据分析** 都在一个原生窗口里完成。

OpenClaw 的配置和数据都在本机目录里；Pond 负责 **实例边界、进程与团队协作**：同一台机器上多套 `~/.openclaw` 与 `~/.openclaw-{id}`，各自 Gateway、配置与团队数据范围清晰可管理。

[GitHub Releases](https://github.com/tageecc/pond/releases) · [贡献指南](./CONTRIBUTING.md) · [English](./README.md)

</div>

---

## 下载安装包

### 版本发布（Releases）

| | |
|--|--|
| **全部版本** | [github.com/tageecc/pond/releases](https://github.com/tageecc/pond/releases) |
| **最新版（安装包）** | [github.com/tageecc/pond/releases/latest](https://github.com/tageecc/pond/releases/latest) — 在 **Assets** 中按系统选择（macOS arm64 / x86_64 的 DMG、Windows `.msi`、Linux `.AppImage`）。 |

可在 **[GitHub Releases](https://github.com/tageecc/pond/releases)** 获取安装包：**两份 macOS DMG**（Apple Silicon 与 Intel x86_64）、**Windows MSI**、**Linux AppImage**（x64）。

**macOS：** 按芯片选择对应 DMG（**M 系列** 选 aarch64/arm64；**Intel Mac** 选 x86_64）。未签名时首次可能被拦截，请 **Control-点按** 应用选 **打开**，或在 **系统设置 → 隐私与安全性** 中允许。

维护者发布流程见 [RELEASING.md](./RELEASING.md)。

---

## 为什么用 Pond

| 没有 Pond | 有 Pond |
|-----------|---------|
| 切目录、敲 CLI 换 profile | **实例切换器**，边界一目了然 |
| 不知道哪个 Gateway 在跑、端口多少 | **按实例** 看 Gateway 状态（标题栏 + 概览） |
| 多智能体只活在 JSON 里 | **团队** 入口：角色、Leader、团队空间、任务（`team_meta` / `team_tasks`） |
| 用量与会话分散 | **概览 + 数据分析**：消费、Token、会话、本机指标集中看 |

Pond **不替代** OpenClaw 运行时，而是 **运维与协作层**：目录与协议仍跟上游一致，多一层团队与操作体验。

---

## 亮点

1. **团队优先** — 每实例多角色，侧栏 **团队**（角色列表、团队空间、任务）；多角色时对话可按 **角色** 分流。
2. **多实例不混乱** — `default` 与 `~/.openclaw-{id}/` 隔离，各自 Gateway 与配置；支持导入、切换与排序。
3. **运维集中** — 按实例启停 Gateway、看日志、跑诊断、管技能、API Key 池、Tailscale 等，少切窗口。
4. **正经桌面应用** — Tauri 2 + Rust，React 19 前端；托盘、开机自启、窗口状态等符合日常使用预期。

---

## 界面预览

将截图放在 `docs/assets/` 并在本段引用。**欢迎 PR 补图。**

---

## 功能

**团队与实例**

- **多智能体** — `agents.list`、Team Leader、**团队空间**（`team_meta`）、**团队任务**（`team_tasks`）；多角色时可选对话角色。
- **多实例** — 单机多套 OpenClaw 家目录；导入、切换、实例顺序。

**运维**

- **Gateway** — 按实例启停与重启；端口、运行时长、内存；退出时可选择停止 Gateway。
- **对话（WebSocket）** — 流式、工具、推理、执行时间线（`ChatView` / `ws_gateway`）。
- **观测** — 概览 + 数据分析；用量可从会话同步。

**配置**

- 模型、渠道、技能、浏览器、会话、工作区、心跳、Hooks、日志、高级项；侧栏 **团队** 独立分组。

**其它**

- 技能安装与目录、目录拉取、经 Agent 安装；诊断与渠道探测；API Key 池；首次引导导入或配密钥。

---

## 工作原理

```
  ┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
  │  React UI   │────▶│ Tauri (Rust) │────▶│ OpenClaw Gateway │
  │  Zustand    │     │ invoke / WS  │     │  ~/.openclaw*    │
  └─────────────┘     └─────────────┘     └─────────────────┘
```

1. **发现** — 从磁盘加载各 **实例**（`openclaw.json`）。
2. **团队** — 在实例内管理多智能体与 Pond 侧团队数据（`team_meta`、`team_tasks`）。
3. **控制** — Rust **按实例** 管理 Gateway 进程。
4. **交互** — WebSocket 对话；可选 **角色**；定时任务等来自 Gateway。
5. **观测** — 指标与消费在应用内聚合；部分数据在应用数据目录。
6. **配置** — 与上游 OpenClaw 约定一致。

---

## 快速开始

> [!TIP]
> 开发 **Tauri** 必须本机已装 **Rust**。若只装了 Node，会出现 `cargo metadata` 相关错误。请用 [rustup](https://rustup.rs/) 安装后 **新开终端** 再执行 `pnpm tauri:dev`。

**环境：** Node.js **20+**、[pnpm](https://pnpm.io)、[Rust stable](https://rustup.rs/)

```bash
git clone https://github.com/tageecc/pond.git
cd pond
pnpm install
pnpm tauri:dev
```

若安装阶段拉取资源失败：

```bash
rm -rf node_modules/.cache && pnpm install
```

**生产构建**

```bash
pnpm build
pnpm tauri build
```

产物：`src-tauri/target/release/bundle/`。`resources/` 下大文件由构建生成，勿提交 Git。

**数据落点**

| 类型 | 位置 |
|------|------|
| 应用偏好（主题、自启、托盘、退出行为、视图、实例） | Tauri [Store](https://v2.tauri.app/plugin/store/)，见 `src/lib/appStore.ts` |
| OpenClaw 配置 | 各实例目录（`openclaw.json` 等） |
| Pond 应用数据（用量、聊天持久化等） | `app_data_dir`（如 macOS `~/Library/Application Support/ai.clawhub.pond`） |

---

## 技术栈

| 层级 | 技术 |
|------|------|
| UI | React 19、TypeScript、TailwindCSS、Radix UI、Framer Motion、Visx |
| 桌面 | Tauri 2、Rust |
| 状态 | Zustand |
| OpenClaw | `openclaw` npm 包，见 [文档](https://docs.openclaw.ai) |

Rust：`src-tauri/src/commands/` · 注册：`lib.rs` · 界面：`src/components/`

---

## 常见问题

**`failed to run 'cargo metadata'`** — 安装 Rust 后新开终端，再执行 `pnpm tauri:dev`。

---

## 贡献

欢迎 Issue 与 PR。合并前执行 `pnpm exec tsc --noEmit`。详见 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)。

**安全披露：** [SECURITY.md](./SECURITY.md)

---

## Star 趋势

[![Star History Chart](https://api.star-history.com/svg?repos=tageecc/pond&type=Date)](https://www.star-history.com/#tageecc/pond&Date)

---

## 许可证

[MIT](LICENSE)
