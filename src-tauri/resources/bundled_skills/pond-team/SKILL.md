---
name: Pond Team
description: Pond 团队与任务相关问题时使用：按相对路径 read 实例根下 JSON；Leader 统筹需求时先检索团队再澄清、冻结后拆任务。禁止用 sessions_list 推断团队规模。
---

# Pond 团队空间

## 数据在哪（不写死绝对路径）

所有路径均相对 **OpenClaw 当前实例根目录**（主实例一般为用户目录下的 `.openclaw`；其它 Pond 实例为 `.openclaw-<实例id>`）。团队与配置**不在** workspace 目录内，与 `workspace/` 平级。

设 **`<stem>`** = Pond 当前实例 id，若其中含路径分隔符则替换为 `_`（与磁盘文件名一致）。则：

| 用途 | 相对「实例根」的路径 |
| --- | --- |
| OpenClaw 配置（含 `agents.list`） | `openclaw.json` |
| 团队元数据（`leader_agent_id`、`members` 等，snake_case） | `team/<stem>.json` |
| 团队任务（根对象含 `tasks`；项内 camelCase） | `team/<stem>_tasks.json` |

从 **默认 workspace**（实例根下的 `workspace/`）用 **read** 读取时，可先试相对路径（相对 workspace）：

- `../openclaw.json`
- `../team/<stem>.json`
- `../team/<stem>_tasks.json`

若环境限制无法访问 workspace 上级目录，再用 **read** 的绝对路径能力，由当前会话所在实例自行解析（不要猜测 `~` 展开方式）。

## 指派与成员：以谁为准

- **谁能被指派、团队有几名执行角色**：以 **`openclaw.json` 里的 `agents.list`** 为唯一权威；角色 id 用于任务里的 `claimed_by_agent_id` 及对话路由。
- **`team/<stem>.json` 的 `members`**：在 Pond 中会在保存角色列表时与 `agents.list` **对齐**（保留同 id 下已有 `display_name` / `role`）；读盘时若与当前配置不一致，**以 `agents.list` 为准** 理解「谁能干活」。
- **`leader_agent_id`**：Pond 固定为 id **`main`**（若存在该角色）；读 `team/*.json` 时应与 `agents.list` 交叉核对。

## 何时使用本技能

- 用户询问 **团队人数、Leader、组员分工、任务状态**，或对齐 **Pond 团队任务台**。
- 用户或 **Leader** 提出 **新项目、新需求、要团队开干**：按下方 **Leader 统筹需求** 顺序执行，不要凭记忆报人数或任务进度。

## 工作流程 A：只读查询（默认顺序）

1. 用 **read** 读取 **`../openclaw.json`**，确认 `agents.list` 中的角色 id。
2. 用 **read** 读取 **`../team/<stem>.json`**，核对 `leader_agent_id`（应为 `main` 若存在）、`members`（展示与备注）。
3. 涉及任务列表或状态时，用 **read** 读取 **`../team/<stem>_tasks.json`**。

## 工作流程 B：Leader 统筹需求（接到「要做项目 / 提需求」时）

以下顺序 **不要跳步**。未读 JSON 前不得断言「团队有人」「任务已分」。

### 1. 检索现状

执行 **工作流程 A** 的三步。对照 **`agents.list`** 弄清可指派 id；`members` 仅作展示名/职责参考。

### 2. 前置条件（人齐不齐）

- 若 **`agents.list` 过少**（例如只有 `main`、或缺少你期望的开发/测试等执行侧角色）：先 **停下拆任务**，向用户说明缺口，**建议**在 Pond / OpenClaw 配置里 **先增加并保存** 所需角色。是否「必须开发+测试各一名」由项目约定，**非 Pond 强制**；**Pond 强制**的是存在 **`main`** 作为 Leader 角色（见协作约定）。
- 本技能 **不假装** 已创建角色；创建 agent、改配置由用户在 Pond 或 OpenClaw 侧完成，你只说明 **缺什么、为何要先补**。

### 3. 多轮澄清需求

在团队 **可执行角色已具备**（或用户明确接受暂时缺人、仍要先写需求）的前提下：

- 与用户 **多轮对话**，收敛：**目标、范围、非目标、验收标准、优先级、风险与依赖**。
- 每轮可给出 **「当前理解」** 的短摘要，请用户 **确认或修正**；未确认处用问句标出，不要替用户拍板细节。

### 4. 需求冻结

当用户口头确认「可以按此版推进」后，输出一份 **需求摘要**（条目化），作为后续分派与验收的 **唯一文字依据**；后续变更再走 **变更说明**，避免 silent scope creep。

### 5. 拆任务与让团队动起来

- 将需求摘要拆成 **可执行任务**：每条写清 **标题、指派给哪个 agent id（或待领取）、阻塞/依赖**；指派 id 必须存在于 **`agents.list`**。
- **任务是否已写入系统** 以 **`../team/<stem>_tasks.json`** 为准。条目可为 **`open`（待领取，无认领人）** 或 **`claimed`（已指派）** 等，以文件为准。
- **优先自动化、少依赖人工录入**：Leader 在拆完任务后，应使用 OpenClaw 内置 **`read` + `write`（或 `apply_patch`）** 直接更新该 JSON 根对象的 **`tasks`** 数组，使任务出现在文件中；这与本技能随团队空间同步到 `skills/pond-team/` 的方式一致，**无需**再接入单独的 MCP 或自定义「Pond 工具」——模型已有文件工具即可。应急时仍可在 **Pond 团队任务台** 手动添加（待领取或指派并认领）。
- **不得**声称「任务已在系统里」而文件未体现。
- **从对话中无法读写实例根文件** 时：请用户在任务台录入，或输出可复制给人类的任务清单。

### 6. 任务 JSON 条目（与 Pond 落盘一致）

文件根对象为 `{ "tasks": [ ... ] }`。每一项为对象，字段名 **camelCase**（与磁盘一致）：

| 字段 | 说明 |
| --- | --- |
| `id` | 字符串，新建时使用 UUID |
| `title` | 非空标题 |
| `status` | `open` \| `claimed` \| `done` \| `failed` |
| `createdAtMs` / `updatedAtMs` | 毫秒时间戳（整数） |
| `claimedByAgentId` | 可选；`open` 时应省略或 `null`；`claimed` 时为执行方 agent id |
| `failureReason` | 仅当 `status` 为 **`failed`** 时必填：说明阻塞、依赖或无法交付的原因，供 Leader 协调 |

新建 **`open`**：`status` 为 `open`，不设 `claimedByAgentId`。新建并 **直接指派**：`status` 为 `claimed`，并设 `claimedByAgentId`。

## 工作流程 C：执行方闭环（防「进行中」锁死）

适用于已出现在 **`../team/<stem>_tasks.json`** 中的任务。

1. **领取**：若任务为 `open` 且应由你执行，将该项改为 `claimed`，写入你的 **agent id** 到 `claimedByAgentId`，更新 `updatedAtMs`。
2. **交付**：工作完成后 **必须** 将该项 `status` 设为 **`done`**，并更新 `updatedAtMs`。未完成前不得结束本轮而不写回文件。
3. **无法完成且需 Leader 介入**：将 `status` 设为 **`failed`**，填写 **`failureReason`**（具体原因：依赖、阻塞、验收争议等），并更新 `updatedAtMs`。不要静默搁置「进行中」任务。
4. **无法写文件**（权限或环境限制）：在回复中明确说明，并请 Leader 或用户在 **Pond 任务台** 代为点「完成」「标记失败」或「放回待领取」。
5. **重新排队**：Leader 协调后可将 **`failed`** 或需重试的任务改回 **`open`**（清空认领与 `failureReason`），或由用户在任务台点「重新打开」；不要从数组中物理删除条目。

## Gotchas

- **`sessions_list` / 会话数量不等于团队人数**。团队规模以 `agents.list` 与团队元数据为准。
- **不要用「当前会话」推断还有哪些 agent**；其它角色可能尚未产生会话。
- **任务状态以任务 JSON 为准**；仅当文件中已写入完成/认领信息时才能如此表述。
- **`<stem>`** 须与当前 Pond/OpenClaw 实例 id 一致；勿与其它实例混淆。
- **任务变更提醒**依赖本机 **Gateway 已启动** 且能连上；失败时仅 stderr 可见日志，**不保证**执行方会话内一定出现提醒。

## 任务状态（常见取值）

以文件为准：**待领取** `open`、**进行中** `claimed`、**已完成** `done`、**失败** `failed`（须带 `failureReason`）。新建任务可为 **待领取** 或 **指派并认领（`claimed`）**。

## 协作约定

- **Leader**（`leader_agent_id` = **`main`**）：拍板、分派、跨角色衔接；统筹需求时遵守 **工作流程 B**。非 Leader 不替他人承诺交付时间。
- **Pond 客户端**：Team Leader 固定为 **`main`**；`team/<stem>.json` 中 `leader_agent_id` 与此一致。
- 交接时写清：**任务标题、agent id、阻塞**；多角色并行时可标明当前 **agent id**。

## 与 OpenClaw 的关系

不改变 OpenClaw 的路由与会话模型；仅约束 Pond 团队数据的读法与诚实性。OpenClaw 中 **Skills** 是教模型如何用已有工具（含 `read` / `write`）的说明；**Tools** 指 Gateway 暴露给模型的可调用能力（如 `exec`、文件工具等）。本协作流程依赖 **技能 + 文件工具**，不要求为 Pond 单独注册新工具类型。
