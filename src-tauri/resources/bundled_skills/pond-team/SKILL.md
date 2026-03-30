---
name: Pond Team
description: Pond 团队协作技能。开启团队空间后自动配置 tools.sessions.visibility=all 和 tools.fs.workspaceOnly=false。使用 sessions_send 与其他 agent 通信，read ../team/*.json 查看任务状态。
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
- **每次对话开始时（首轮回复前）**：非 Leader agent 应主动检查是否有待领取的任务，并根据自己的职责决定是否认领。

## 工作流程 A：只读查询（默认顺序）

1. 用 **read** 读取 **`../openclaw.json`**，确认 `agents.list` 中的角色 id。
2. 用 **read** 读取 **`../team/<stem>.json`**，核对 `leader_agent_id`（应为 `main` 若存在）、`members`（展示与备注）。
3. 涉及任务列表或状态时，用 **read** 读取 **`../team/<stem>_tasks.json`**。

## 工作流程 B：Leader 统筹需求（接到「要做项目 / 提需求」时）

以下顺序 **不要跳步**。未读 JSON 前不得断言「团队有人」「任务已分」。

### 1. 检索现状

执行 **工作流程 A** 的三步。对照 **`agents.list`** 弄清可指派 id；`members` 仅作展示名/职责参考。

### 2. 前置条件检查（必须通过才能接任务）

**在开始拆分任务前，Leader 必须检查以下条件**：

#### 2.1 团队规模检查
```
agents.list 的长度必须 >= 2（至少有 main + 1个执行方）

如果只有 main：
❌ 停止拆任务
✅ 告诉用户："当前团队只有 Leader（main），无法分配任务。
   请在 Pond UI 的「团队 → 角色列表」中添加至少一个执行方角色（如 coder, tester），
   并为每个角色填写职责说明（例如：负责编写代码、实现功能）。"
```

#### 2.2 职责定义检查
```
读取 ../team/<stem>.json 的 members 数组
检查每个 member 是否有非空的 role 字段

如果任何成员缺少 role 或 role 为空字符串：
❌ 停止拆任务
✅ 告诉用户："角色 X 缺少职责说明，无法自动分配任务。
   请在「团队 → 角色列表」中为该角色填写职责（例如：负责测试、验证功能）。"
```

#### 2.3 职能完整性检查（推荐）
```
检查 members 中是否至少有一个角色的 role 字段包含开发相关关键词：
- 开发、编写、实现、代码、编程、构建、搭建
- develop, code, implement, build, create, write

如果没有开发角色：
⚠️  警告用户："团队中似乎没有负责开发的角色，建议添加一个开发角色。
   是否仍要继续拆分任务？"
   
（这是建议而非强制，用户可以选择继续）
```

#### 2.4 角色激活状态（可选建议）
```
可选：检查 ~/.openclaw/agents/<agent_id>/sessions/ 是否存在

如果某个角色从未有过对话：
💡 提示用户："角色 X 尚未激活（从未有过对话）。
   拆分任务后，请记得在 Pond UI 中点击该角色开始协作。"
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

**Leader 必须完成的通知流程**：

任务写入文件后，Leader 必须做两件事：

1. **发送系统级通知**（尝试唤醒 agent）：
```javascript
sessions_send({
  sessionKey: "coder",
  message: "新任务已分配。请检查团队任务列表。",
  timeoutSeconds: 0
})

sessions_send({
  sessionKey: "tester",
  message: "新任务已分配。请检查团队任务列表。",
  timeoutSeconds: 0
})
```

2. **明确告知用户下一步操作**（关键！）：

告诉用户：
> "✅ 任务已创建并分配：
> - task-001: 【标题】→ 已认领（我负责）
> - task-002: 【标题】→ 待 coder 认领
> - task-003: 【标题】→ 待 tester 认领
> 
> **下一步**：请在 Pond UI 中点击 **coder** 和 **tester** 的对话，他们会自动检测并认领任务。系统通知已发送，但他们需要被激活才能开始工作。"

**为什么需要用户手动激活**：
- OpenClaw 的 agent 不会因为收到 `sessions_send` 而自动开始对话
- 用户必须在 UI 中点击对应的 agent 卡片，触发他们的首轮回复
- 首轮回复时，agent 会自动检查任务列表并认领任务

**禁止行为**：
- ❌ 不要说"任务已分配给团队"就结束，用户不知道下一步要做什么
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

### 主动发现任务（每次对话开始时执行）

**非 Leader agent 在每轮对话时的首要任务**：

#### 步骤 1: 读取你的职责定义

**在做任何事情之前**，先读取 `../team/<stem>.json`，找到 `members` 数组中你的 `agent_id` 对应的 `role` 字段。

```javascript
// 示例：假设你的 agent_id 是 "coder"
{
  "members": [
    { "agent_id": "main", "role": "团队负责人，统筹规划" },
    { "agent_id": "coder", "role": "负责编写代码、实现功能、搭建项目" },  // ← 这是你的职责
    { "agent_id": "tester", "role": "负责测试、验证功能、发现bug" }
  ]
}
```

**如果你的 role 字段不存在或为空**：
```
❌ 停止所有操作
✅ 告诉用户："我的职责定义缺失，无法判断适合的任务。
   请在 Pond UI 的「团队 → 角色列表」中为我（agent_id: XXX）填写职责说明。"
```

#### 步骤 2: 读取任务列表

使用 `read` 工具读取 `../team/<stem>_tasks.json`，获取所有任务。

#### 步骤 3: 匹配任务与职责

**匹配规则**（根据你的 role 字段内容）：

1. **提取你的职责关键词**：
   - 从你的 `role` 字段中提取动词和名词
   - 例如："负责编写代码、实现功能" → 关键词：编写、代码、实现、功能

2. **筛选 open 状态的任务**：
   - 只看 `status == "open"` 的任务
   - 忽略已被认领（claimed）或完成（done）的任务

3. **语义匹配**：
   - 检查任务的 `title` 是否与你的职责关键词匹配
   - 例如：
     - role: "负责编写代码" → 匹配任务："实现后端 API"、"搭建前端界面"
     - role: "负责测试" → 匹配任务："功能测试"、"验证bug修复"
   
4. **依赖检查**（针对测试任务）：
   - 如果你的职责是测试，且任务标题包含"测试"字样
   - 检查是否有其他"实现"/"开发"任务还在进行中（status == "claimed"）
   - 如果有，应该等待而不是认领

#### 步骤 4: 认领或等待

找到适合的任务后：
1. **立即认领**：修改 `status` 为 `claimed`，设置 `claimedByAgentId` 为你的 agent_id，更新 `updatedAtMs`
2. **告知用户**："✅ 我发现了适合我的任务：【任务标题】。已认领，现在开始执行。"
3. **开始执行任务**

如果没有适合的任务：
- **有依赖任务在进行中**：说明"当前有前置任务正在进行中，等待完成后我将认领后续任务"
- **完全没有匹配任务**：简要说明"当前无适合我职责的待领取任务"，然后询问用户需要什么帮助

**严格顺序（不可打乱）**：
```
1. 读取 ../team/<stem>.json，确认自己的 role (强制)
2. 读取 ../team/<stem>_tasks.json (强制)
3. 匹配任务与职责 (强制)
4. 认领或说明原因 (强制)
5. 然后才回答用户的具体问题
```

**禁止行为**：
- ❌ 不要先回复"你好"再检查任务
- ❌ 不要等用户问才检查
- ❌ 不要认领不匹配你职责的任务
- ❌ 不要在 role 字段缺失时继续工作

### 领取与执行

1. **领取**：若任务为 `open` 且应由你执行，将该项改为 `claimed`，写入你的 **agent id** 到 `claimedByAgentId`，更新 `updatedAtMs`。
2. **通知 Leader**（可选但推荐）：领取任务后，可使用 OpenClaw 内置工具主动告知 Leader：
   ```javascript
   sessions_send({
     sessionKey: "main",
     message: "我已领取任务【任务标题】，预计 X 小时完成",
     timeoutSeconds: 0
   })
   ```
3. **交付**：工作完成后 **必须** 将该项 `status` 设为 **`done`**，并更新 `updatedAtMs`。未完成前不得结束本轮而不写回文件。
4. **汇报结果**（推荐）：完成任务后，主动向 Leader 或相关方汇报：
   ```javascript
   sessions_send({
     sessionKey: "main",  // 或其他需要知道的 agent
     message: "任务【标题】已完成。简要说明：...",
     timeoutSeconds: 0
   })
   ```
5. **无法完成且需 Leader 介入**：将 `status` 设为 **`failed`**，填写 **`failureReason`**（具体原因：依赖、阻塞、验收争议等），并更新 `updatedAtMs`。同时 **必须** 通知 Leader：
   ```javascript
   sessions_send({
     sessionKey: "main",
     message: "任务【标题】遇到阻塞：【原因】，需要协助",
     timeoutSeconds: 30  // 等待 Leader 回复
   })
   ```
6. **无法写文件**（权限或环境限制）：在回复中明确说明，并请 Leader 或用户在 **Pond 任务台** 代为点「完成」「标记失败」或「放回待领取」。
7. **重新排队**：Leader 协调后可将 **`failed`** 或需重试的任务改回 **`open`**（清空认领与 `failureReason`），或由用户在任务台点「重新打开」；不要从数组中物理删除条目。

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

### 职责定义是协作的基础
- **role 字段是强制的**：每个 agent 必须在 `team/<stem>.json` 的 `members[].role` 中有明确的职责说明。
- **职责必须具体**：
  - ✅ 好的例子："负责编写代码、实现功能、搭建项目架构"
  - ✅ 好的例子："负责测试、验证功能、发现并报告bug"
  - ❌ 坏的例子："开发"（太简短）
  - ❌ 坏的例子："帮忙"（不明确）
- **缺少 role 字段会阻止协作**：
  - Leader 在拆任务前会检查，如果有角色缺少 role 会拒绝继续
  - 执行方在首轮回复时会检查，如果自己的 role 缺失会报告用户
  
### 前置检查优于后置处理
- **团队规模**：至少需要 2 个角色（main + 1个执行方）才能开启协作
- **职能完整性**：建议至少有 1 个角色的 role 包含开发相关关键词
- **所有检查在拆任务前完成**：Leader 会在接到任务时立即检查，而不是拆完任务后发现问题

### 任务标题要清晰
- **标题应该包含动作词**：实现、开发、测试、验证、搭建、编写、检查
- **避免模糊表述**：
  - ❌ "优化系统"（谁来做？做什么？）
  - ✅ "实现系统性能优化（后端 API 响应时间）"
  - ✅ "测试系统负载能力（并发 1000 用户）"

### 通知与激活机制
- **`sessions_send` 不会唤醒 agent**：消息发送到不活跃的 session 不会自动触发对话
- **用户必须手动点击 agent**：Leader 创建任务后，必须告诉用户"请在 UI 中点击 coder/tester 开始协作"
- **首轮回复是关键时机**：Agent 会在首轮回复时自动检查任务，这是唯一的自动化机制

### 任务依赖处理
- **测试任务通常有隐式依赖**：如果有"实现"/"开发"任务还在进行中，测试任务应该等待
- **依赖检查基于语义**：通过任务标题判断，而不是任务顺序或 ID
- **状态以 JSON 文件为准**：不要凭记忆，必须读取 `../team/<stem>_tasks.json`

### 协作流程
- **Leader 不要自己执行所有任务**：main 不应该创建 subagent 来做 coder 的工作
- **明确告诉用户下一步操作**：创建任务后说"请点击 coder 开始工作"，而不是"任务已分配"就结束
- **`sessions_list` 不等于团队人数**：新创建的 agent 可能还没有任何 session

### 技术细节
- **`<stem>`** 须与当前 Pond/OpenClaw 实例 id 一致；主实例通常是 `default`
- **文件路径使用相对路径**：从 workspace 访问用 `../team/<stem>_tasks.json`
- **Gateway 必须运行**：Pond 后端的自动通知依赖 Gateway；如果未启动，通知会静默失败

## 任务状态（常见取值）

以文件为准：**待领取** `open`、**进行中** `claimed`、**已完成** `done`、**失败** `failed`（须带 `failureReason`）。新建任务可为 **待领取** 或 **指派并认领（`claimed`）**。

## 协作约定

- **Leader**（`leader_agent_id` = **`main`**）：拍板、分派、跨角色衔接；统筹需求时遵守 **工作流程 B**。非 Leader 不替他人承诺交付时间。
- **Pond 客户端**：Team Leader 固定为 **`main`**；`team/<stem>.json` 中 `leader_agent_id` 与此一致。
- 交接时写清：**任务标题、agent id、阻塞**；多角色并行时可标明当前 **agent id**。

## 与 OpenClaw 的关系

不改变 OpenClaw 的路由与会话模型；仅约束 Pond 团队数据的读法与诚实性。OpenClaw 中 **Skills** 是教模型如何用已有工具（含 `read` / `write`）的说明；**Tools** 指 Gateway 暴露给模型的可调用能力（如 `exec`、文件工具等）。本协作流程依赖 **技能 + 文件工具**，不要求为 Pond 单独注册新工具类型。
