---
name: Pond Team
description: Pond 团队协作技能。开启团队空间后自动配置 tools.sessions.visibility=all 和 tools.fs.workspaceOnly=false。使用 sessions_send 与其他 agent 通信，read ../team/*.json 查看任务状态。
---

# Pond 团队空间

## 数据在哪（不写死绝对路径）

所有路径均相对 **OpenClaw 当前实例根目录**（主实例一般为用户目录下的 `.openclaw`；其它 Pond 实例为 `.openclaw-<实例id>`）。团队与配置**不在** workspace 目录内，与 `workspace/` 平级。

设 **`<stem>`** = Pond 当前实例 id，若其中含路径分隔符则替换为 `_`（与磁盘文件名一致）。

**重要**：
- 默认实例（`~/.openclaw/`）的 `<stem>` 是 **`default`**
- 其他实例（如 `.openclaw-abc/`）的 `<stem>` 是对应的实例 id（如 `abc`）

| 用途 | 相对「实例根」的路径 | 示例（默认实例） |
| --- | --- | --- |
| OpenClaw 配置（含 `agents.list`） | `openclaw.json` | `openclaw.json` |
| 团队元数据（`leader_agent_id`、`members` 等，snake_case） | `team/<stem>.json` | `team/default.json` |
| 团队任务（根对象含 `tasks`；项内 camelCase） | `team/<stem>_tasks.json` | `team/default_tasks.json` |

从 **默认 workspace**（实例根下的 `workspace/`）用 **read** 读取时，可先试相对路径（相对 workspace）：

- `../openclaw.json`
- `../team/<stem>.json`
- `../team/<stem>_tasks.json`

若环境限制无法访问 workspace 上级目录，再用 **read** 的绝对路径能力，由当前会话所在实例自行解析（不要猜测 `~` 展开方式）。

## 指派与成员：以谁为准

- **谁能被指派、团队有几名执行角色**：以 **`openclaw.json` 里的 `agents.list`** 为唯一权威；角色 id 用于任务里的 `claimed_by_agent_id` 及对话路由。
- **`team/<stem>.json` 的 `members`**：在 Pond 中会在保存角色列表时与 `agents.list` **对齐**（保留同 id 下已有 `role`）；读盘时若与当前配置不一致，**以 `agents.list` 为准** 理解「谁能干活」。
- **`leader_agent_id`**：Pond 固定为 id **`main`**（若存在该角色）；读 `team/*.json` 时应与 `agents.list` 交叉核对。

## 何时使用本技能

- 用户询问 **团队人数、Leader、组员分工、任务状态**，或对齐 **Pond 团队任务台**。
- 用户或 **Leader** 提出 **新项目、新需求、要团队开干**：按下方 **Leader 统筹需求** 顺序执行，不要凭记忆报人数或任务进度。
- **每次对话开始时（首轮回复前）**：非 Leader agent 应主动检查任务列表，查看是否有分配给自己的任务。

## 工作流程 A：只读查询（默认顺序）

1. 用 **read** 读取 **`../openclaw.json`**，确认 `agents.list` 中的角色 id。
2. 用 **read** 读取 **`../team/<stem>.json`**，核对 `leader_agent_id`（应为 `main` 若存在）、`members`（展示与备注）。
3. 涉及任务列表或状态时，用 **read** 读取 **`../team/<stem>_tasks.json`**。

## 工作流程 B：Leader 统筹需求（接到「要做项目 / 提需求」时）

以下顺序 **不要跳步**。未读 JSON 前不得断言「团队有人」「任务已分」。

### 1. 检索现状

执行 **工作流程 A** 的三步。对照 **`agents.list`** 弄清可指派 id；`members` 中的 `name` 是成员显示名称，`role` 是职责描述。

### 2. 前置条件检查（必须通过才能接任务）

**在开始拆分任务前，Leader 必须检查以下条件**：

#### 2.1 团队规模检查
```
读取 ../openclaw.json 的 agents.list

如果 agents.list 长度 < 2（只有 main，没有其他执行方）：
❌ 停止拆任务
✅ 告诉用户："当前团队只有 Leader（main），无法分配任务。
   请在 Pond UI 的「团队 → 角色列表」中添加至少一个执行方角色。"
```

#### 2.2 角色激活状态提示（推荐）
```
读取 ../team/<stem>.json 的 members 数组

members 数组结构说明：
{
  "agent_id": "agent-abc123",    // 自动生成的唯一ID（必需）
  "name": "小红",                // 成员名称（从 agents.list 自动同步，可选）
  "role": "后端开发，负责 API 实现和数据库设计"  // 职责描述（必需）
}

注意：
- agent_id 是系统自动生成的（如 agent-abc123、agent-def456）
- name 字段会在保存团队信息时自动从 agents.list[].name 同步
- ✅ 优先使用 name 字段显示成员名称（如："任务已分配给小红"）
- ⚠️ 如果 name 不存在（旧数据），使用 agent_id 作为 fallback
- role 是必填的职责描述，用于说明该成员负责什么工作

显示成员名称的推荐代码：
```javascript
const displayName = member.name || member.agent_id
console.log(`任务已分配给 ${displayName}`)
```

建议检查哪些角色尚未激活：
💡 "角色 X, Y 尚未激活。拆分任务后，请在 Pond UI 中点击对应角色开始协作。"
```

**如果所有检查通过**：继续下面的步骤。

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

**Leader 完成任务创建后的通知流程**：

1. **在 Pond 任务台中指派任务**（推荐方式）：
   - 创建任务时，直接通过下拉框选择要分配给谁
   - 任务状态自动设为 `claimed`，`claimedByAgentId` 自动设为选定的 agent
   - 这样 agent 打开对话时会立即看到分配的任务

2. **或者创建 open 任务，让成员自己认领**：
   - 任务状态设为 `open`，不指定执行人
   - 告诉用户："请在 Pond UI 中点击对应 agent，让他们查看并认领任务"

3. **明确告知用户下一步操作**（关键！）：

告诉用户：
> "✅ 任务已创建：
> - task-001: 【标题】→ 已分配给 coder
> - task-002: 【标题】→ 已分配给 tester
> - task-003: 【标题】→ 待认领（open）
> 
> **下一步**：请在 Pond UI 中点击 **coder** 和 **tester**，他们会看到分配的任务并开始执行。"

**为什么需要用户手动点击**：
- OpenClaw 的 agent 不会自动开始对话
- 用户必须在 UI 中点击对应的 agent，触发他们的首轮回复
- 首轮回复时，agent 会检查任务列表

**禁止行为**：
- ❌ 不要说"任务已分配"就结束，必须告诉用户下一步操作
- ❌ 不要自己创建 subagent 来执行团队成员的任务
- ❌ 不要假设团队成员会"自动"看到任务

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

### 检查分配给你的任务（每次对话开始时执行）

**非 Leader agent 在每轮对话时的首要任务**：

#### 读取并检查任务列表

使用 `read` 工具读取 `../team/<stem>_tasks.json`，获取所有任务。

**重点关注两类任务**：

1. **已分配给你的任务**（优先）：
   ```
   筛选条件：
   - status == "claimed"
   - claimedByAgentId == 你的 agent_id
   
   这些是 Leader 或任务台明确分配给你的任务
   
   如果找到：
   ✅ 立即告知用户："我看到有分配给我的任务：【任务标题】，现在开始执行。"
   ✅ 立即开始执行该任务
   ```

2. **待领取的任务**（次要）：
   ```
   筛选条件：
   - status == "open"
   - claimedByAgentId 为 null 或不存在
   
   这些是未指定执行人的待认领任务
   
   如果找到：
   📋 简要列出任务标题
   💬 告诉用户："当前有 X 个待领取任务。您希望我认领哪个？"
   ⏸️  等待用户明确指示，不要自动认领
   ```

**严格顺序（不可打乱）**：
```
1. 读取 ../team/<stem>_tasks.json (强制)
2. 查找 claimedByAgentId == 自己的任务 (强制)
3. 如果有分配的任务，立即执行 (强制)
4. 如果没有分配的任务，告知用户有 X 个待认领任务（如果有）
5. 然后才处理用户的其他问题
```

**禁止行为**：
- ❌ 不要先说"你好"再检查任务
- ❌ 不要自动认领 open 任务（必须等用户指示）
- ❌ 不要忽略已分配的任务
- ❌ 不要尝试"智能匹配"任务

### 执行与完成任务

当用户明确指示你认领某个任务时：

1. **领取**：将任务的 `status` 改为 `claimed`，设置 `claimedByAgentId` 为你的 agent_id，更新 `updatedAtMs`
2. **通知 Leader**（推荐）：使用 `sessions_send` 告知 Leader：
   ```javascript
   sessions_send({
     sessionKey: "main",
     message: "我已领取任务【任务标题】",
     timeoutSeconds: 0
   })
   ```
3. **执行任务**：开始实际工作
4. **完成**：工作完成后，将 `status` 设为 `done`，更新 `updatedAtMs`
5. **汇报**（推荐）：使用 `sessions_send` 通知 Leader：
   ```javascript
   sessions_send({
     sessionKey: "main",
     message: "任务【标题】已完成。简要说明：...",
     timeoutSeconds: 0
   })
   ```

**如果无法完成**：
1. 将 `status` 设为 `failed`
2. 填写 `failureReason`（具体原因：依赖、阻塞等）
3. 更新 `updatedAtMs`
4. 通知 Leader：
   ```javascript
   sessions_send({
     sessionKey: "main",
     message: "任务【标题】遇到阻塞：【原因】，需要协助",
     timeoutSeconds: 30
   })
   ```

**无法写文件时**：在回复中说明，请用户在 Pond 任务台手动操作。

## Agent 间通信（推荐使用）

Pond 团队支持 OpenClaw 原生的 agent 间通信工具。团队空间创建时已自动配置 `tools.sessions.visibility = "all"`，允许 agent 之间发现和通信。

**重要原则：优先使用消息传递而非读取完整历史**。

### 发送消息（主要方式）

使用 `sessions_send` 主动通知其他 agent：

```javascript
sessions_send({
  sessionKey: "目标agent的id",  // 例如 "main", "coder", "tester"
  message: "你的消息内容",
  timeoutSeconds: 0  // 0 = 不等待回复（fire-and-forget），> 0 = 等待回复
})
```

**使用场景**：
- 汇报任务进度/完成
- 请求帮助或协作
- 通知阻塞/依赖问题

### 查询历史（谨慎使用）

**仅在真正必要时**使用 `sessions_history`，例如接手未完成的任务或 debug：

```javascript
sessions_history({
  sessionKey: "目标agent的id",
  includeTools: false  // 建议设为 false 以减少噪音
})
```

**警告**：
- ⚠️ 读取完整历史会导致上下文膨胀
- ⚠️ 可能被其他 agent 的错误推理误导
- ⚠️ 优先使用 `sessions_send` 请求对方提供摘要

### 发现在线成员

使用 `sessions_list` 查看团队成员状态（仅查看元数据，不读取对话内容）：

```javascript
sessions_list()
// 由于已配置 visibility: "all"，可以看到所有 agent 的会话列表
```

**用途**：
- 查看哪些 agent 在线/活跃
- 获取正确的 sessionKey 用于 sessions_send
- 不会读取对话内容，仅元数据

### 完整协作示例

```javascript
// 场景：Main agent 分配任务给 Coder，Coder 完成后通知 Main

// 1. Main agent 分配任务
sessions_send({
  sessionKey: "coder",
  message: "新任务：实现用户登录功能。需求详见 tasks.json #42",
  timeoutSeconds: 0  // fire-and-forget
})

// 2. Coder agent 领取任务（修改 tasks.json）
// 使用 read 和 write 工具操作 ../team/xxx_tasks.json

// 3. Coder agent 完成后汇报
sessions_send({
  sessionKey: "main",
  message: "任务 #42 已完成。代码位置：src/auth/login.ts，测试通过率 100%",
  timeoutSeconds: 0
})

// 4. Main agent 需要更多细节时（罕见）
sessions_send({
  sessionKey: "coder",
  message: "能否详细说明登录流程的实现细节？",
  timeoutSeconds: 30  // 等待回复
})
```

## Gotchas 与常见错误

### 任务分配方式
- **推荐：在 Pond 任务台手动指派**：创建任务时直接选择要分配给谁，状态自动设为 claimed
- **替代：创建 open 任务**：让 agent 自己查看任务标题并决定是否认领
- **不存在自动匹配**：Agent 不会根据 agent_id 或 role 字段自动判断任务是否适合

### role 字段的真实用途
- **role 是可选的备注字段**：用于在 Pond UI 中显示，帮助人类理解 agent 的用途
- **不参与程序逻辑**：不用于任务匹配、不用于权限控制、不用于任何自动化判断
- **agent_id 可以是任意字符串**：小红、小明、agent-001、coder 都可以，没有语义假设

### 通知与激活机制
- **`sessions_send` 不会唤醒 agent**：消息发送到不活跃的 session 不会自动触发对话
- **用户必须手动点击 agent**：Leader 创建任务后，必须告诉用户"请在 UI 中点击 coder/tester"
- **首轮回复是检查时机**：Agent 会在首轮回复时检查是否有分配给自己的任务

### 任务状态管理
- **已分配 vs 待认领**：
  - claimed + claimedByAgentId = 已分配给特定 agent
  - open + claimedByAgentId=null = 待认领，任何人都可以认领
- **状态以 JSON 文件为准**：不要凭记忆，必须读取 `../team/<stem>_tasks.json`
- **认领需要用户确认**：Agent 看到 open 任务后，应该询问用户是否认领，不要自动认领

### 协作流程关键点
- **Leader 不要自己执行所有任务**：main 不应该创建 subagent 来做团队成员的工作
- **明确告诉用户下一步操作**：创建任务后说"请点击 coder"，而不是"任务已分配"就结束
- **任务台是主要分配方式**：通过 UI 手动指派比通过 sessions_send 通知更可靠

### 技术细节
- **`<stem>`** 须与当前实例 id 一致；默认实例是 `default`，其他实例是实例 id
- **文件路径使用相对路径**：从 workspace 访问用 `../team/<stem>_tasks.json`
- **Gateway 必须运行**：Pond 后端的自动通知依赖 Gateway

## 任务状态（常见取值）

以文件为准：**待领取** `open`、**进行中** `claimed`、**已完成** `done`、**失败** `failed`（须带 `failureReason`）。新建任务可为 **待领取** 或 **指派并认领（`claimed`）**。

## 协作约定

- **Leader**（`leader_agent_id` = **`main`**）：拍板、分派、跨角色衔接；统筹需求时遵守 **工作流程 B**。非 Leader 不替他人承诺交付时间。
- **Pond 客户端**：Team Leader 固定为 **`main`**；`team/<stem>.json` 中 `leader_agent_id` 与此一致。
- 交接时写清：**任务标题、agent id、阻塞**；多角色并行时可标明当前 **agent id**。

## 与 OpenClaw 的关系

不改变 OpenClaw 的路由与会话模型；仅约束 Pond 团队数据的读法与诚实性。OpenClaw 中 **Skills** 是教模型如何用已有工具（含 `read` / `write`）的说明；**Tools** 指 Gateway 暴露给模型的可调用能力（如 `exec`、文件工具等）。本协作流程依赖 **技能 + 文件工具**，不要求为 Pond 单独注册新工具类型。
