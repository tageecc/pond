---
name: ClawTeam
description: 仅当 ClawTeam「团队空间」已开启（存在 team/*.json 或团队任务文件）时适用；否则忽略本技能。简单请求按普通单 agent 处理；复杂多角色需求再用团队流程。遵守 OpenClaw：技能为说明，工具以 Gateway 为准，openclaw.json 为配置权威。
---

# ClawTeam 团队空间

## OpenClaw 基础原则（必须遵守）

本文件是 OpenClaw **Skill**（`skills/.../SKILL.md`），与官方机制的关系如下：

- **能力边界**：可执行能力以 **Gateway 暴露的 tools**（含 `read` / `write` / `sessions_*` 等）为准；**不得**虚构工具名或假装存在 ClawTeam 专有 API。
- **配置权威**：实例行为以 **`openclaw.json`** 为准；`agents.list`、通道、模型等与 OpenClaw 文档一致。本技能**只描述**如何用现有工具读写 `team/*.json`，**不改变** OpenClaw 的路由、会话键、多 agent 调度规则。
- **技能与实例技能目录**：ClawTeam 在开启团队空间时会将本技能同步到实例 **`skills/clawteam-collab/`**；若团队空间**未**开启，通常不应依赖本协作流程（见下节门控）。

## 何时本技能有效：团队空间门控（先判断，再选用工作流）

**在套用下方工作流程 A/B/C/D 之前**，必须先确认 **ClawTeam 团队空间已在当前实例启用**：

1. 用 **`read`**（相对 workspace：`../team/<stem>.json` 或 `../team/<stem>_tasks.json`）尝试读取。
2. **若两处均不存在或无法读取到有效团队数据**：视为 **团队空间未开启或未初始化** → **不适用本技能**的任何协作流程。此时按 **普通 OpenClaw 单 agent 会话**处理用户消息（不拆团队任务、不写 `team/*_tasks.json`、不按 Leader/执行方分工叙事）。
3. **若至少一处存在**（与 ClawTeam「团队空间已启用」一致）：才进入 **工作流程 A**，并仅在满足「简单 / 复杂」判断时进入 B/C/D。

> **`<stem>`** 见下文路径表；实例 id 与 OpenClaw 目录约定不变。

## 简单任务 vs 需要团队工作流（何时不走 B/C/D）

在 **团队空间已开启** 的前提下，也**并非**每条用户消息都要走「拆任务、改 tasks.json、多角色协同」。

| 场景 | 处理方式 |
| --- | --- |
| **简单任务** | **默认**由**当前会话中的这一名 agent** 直接完成即可：小范围单文件修改、简短问答、单步命令、明确局部的 bugfix。**不要**强行启动工作流程 B、不要为「简单一问」写入或修改 `team/*_tasks.json`。 |
| **需要团队工作流** | 用户明确提到 **分工 / 团队 / 多角色 / 立项 / 任务台 / 指派**；或需求明显需要 **多名 `agents.list` 执行方**并行；或需要 **读写 `*_tasks.json`** 做协调与状态跟踪。此时再使用 **工作流程 B（Leader 统筹）**、**C（执行方）**、**D（Leader 边界）**。 |

**设计原则**：默认偏 **简单、少步骤**；只有跨角色、多交付物或用户明确要求「团队化」时，才叠加团队流程——避免把 OpenClaw 会话变成不必要的协调开销。

---

## 数据在哪（不写死绝对路径）

所有路径均相对 **OpenClaw 当前实例根目录**（主实例一般为用户目录下的 `.openclaw`；其它 ClawTeam 实例为 `.openclaw-<实例id>`）。团队与配置**不在** workspace 目录内，与 `workspace/` 平级。

设 **`<stem>`** = ClawTeam 当前实例 id，若其中含路径分隔符则替换为 `_`（与磁盘文件名一致）。

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
- **`team/<stem>.json` 的 `members`**：在 ClawTeam 中会在保存角色列表时与 `agents.list` **对齐**（保留同 id 下已有 `role`）；读盘时若与当前配置不一致，**以 `agents.list` 为准** 理解「谁能干活」。
- **`leader_agent_id`**：ClawTeam 固定为 id **`main`**（若存在该角色）；读 `team/*.json` 时应与 `agents.list` 交叉核对。

## 何时使用本技能（摘要）

- 已通过 **「团队空间门控」**（上一节）：团队数据存在，本技能才参与决策。
- **只读/查询**（人数、分工、任务状态、对齐任务台）：**工作流程 A**。
- **新项目 / 要团队开干 / 拆任务**：在 **非简单任务** 且需多角色时，**工作流程 B**（Leader）；不要凭记忆报进度。
- **首轮回复前**（且团队空间开启、且非「明显简单一问」）：**Leader（`main`）** 见 **工作流程 D**；**非 Leader** 见 **工作流程 C**（检查分配给自己的任务）。若当前用户消息仅为简单局部请求，可先直接处理，再按需检查任务文件。

## 工作流程 A：只读查询（默认顺序）

1. 用 **read** 读取 **`../openclaw.json`**，确认 `agents.list` 中的角色 id。
2. 用 **read** 读取 **`../team/<stem>.json`**，核对 `leader_agent_id`（应为 `main` 若存在）、`members`（展示与备注）。
3. 涉及任务列表或状态时，用 **read** 读取 **`../team/<stem>_tasks.json`**。

## 工作流程 B：Leader 统筹需求（接到「要做项目 / 提需求」时）

**前提**：已通过 **团队空间门控**；且用户意图属于 **需要团队工作流**（见上文「简单任务 vs 需要团队工作流」），**不是**单句简单局部请求。

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
   请在 ClawTeam UI 的「团队 → 角色列表」中添加至少一个执行方角色。"
```

#### 2.2 角色激活状态提示（推荐）
```
读取 ../team/<stem>.json 的 members 数组

members 数组结构说明：
{
  "agent_id": "agent-abc123",    // 自动生成的唯一ID
  "name": "小红",                // 成员显示名称（从 agents.list 自动同步）
  "role": "后端开发，负责 API 实现和数据库设计"  // 职责描述
}

注意：
- agent_id 是系统自动生成的（如 agent-abc123、agent-def456）
- name 字段在保存团队信息时自动从 agents.list[].name 同步
- 直接使用 name 字段显示成员名称

显示成员名称示例：
```javascript
console.log(`任务已分配给 ${member.name}`)
// 输出：任务已分配给小红
```

建议检查哪些角色尚未激活：
💡 "角色 X, Y 尚未激活。拆分任务后，请在 ClawTeam UI 中点击对应角色开始协作。"
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
- **优先自动化、少依赖人工录入**：Leader 在拆完任务后，应使用 OpenClaw 内置 **`read` + `write`（或 `apply_patch`）** 直接更新该 JSON 根对象的 **`tasks`** 数组，使任务出现在文件中；这与本技能随团队空间同步到 `skills/clawteam-collab/` 的方式一致，**无需**再接入单独的 MCP 或自定义「ClawTeam 工具」——模型已有文件工具即可。应急时仍可在 **ClawTeam 团队任务台** 手动添加（待领取或指派并认领）。
- **不得**声称「任务已在系统里」而文件未体现。
- **从对话中无法读写实例根文件** 时：请用户在任务台录入，或输出可复制给人类的任务清单。

**Leader 完成任务创建后的通知流程**（ClawTeam 内建行为）：

1. **任务台创建或 JSON 写入成功后**，后端会：
   - 通过 **Gateway `chat.send`** 向相关角色的 **应用内会话** 注入一条 **`[ClawTeam task sync]`** 消息，内容包含 **该角色相关的任务摘要**（`open`、分配给该角色的 `claimed`、以及需 Leader 处理的 `failed`）与 **`team/<stem>_tasks.json` 路径**。
   - **`open`（待认领）**：会向 **`agents.list` 中的每一个角色** 各发一条（每人看到自己的摘要，且都能看到待认领项）。
   - **已指派（`claimed`）**：仅向 **被指派的执行方** 发送。
   - 前端会收到 **`team-tasks-updated`** 事件：任务台若打开会自动刷新；其他界面会弹出轻提示。

2. **在 ClawTeam 任务台中指派任务**（推荐）：创建时选择执行方 → 状态为 `claimed`，上述 Gateway 通知会指向该执行方。

3. **仍建议明确告知人类用户下一步**（尤其是首次协作）：
   - 哪些任务派给了谁、哪些是 `open`。
   - 若某角色 **尚无应用内会话**，用户可能需在侧边栏 **切换到该角色聊天**，以便看到注入的同步消息并触发模型回复；**有会话时**，注入消息会进入该角色当前/最近的 clawteam 通道会话，模型可在下一轮处理。

**禁止行为**：
- ❌ 不要说「任务已写好」就结束，应结合上文说明用户可如何在对应对话里跟进。
- ❌ 不要自己创建 subagent 来执行团队成员的任务。
- ❌ 不要假设「不写任务文件也能算已分派」——以 `team/*_tasks.json` 为准。

### 6. 任务 JSON 条目（与 ClawTeam 落盘一致）

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

**前提**：已通过 **团队空间门控**；若用户当前消息为 **简单任务**，可先完成该消息，再按需读取任务文件。

适用于已出现在 **`../team/<stem>_tasks.json`** 中的任务。

### 检查分配给你的任务（需要执行任务台协作时的首要步骤）

**非 Leader agent 在需要处理团队任务时的首要步骤**：

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

**建议顺序**（在需要处理团队任务时；若本轮仅为 **简单任务**，可先处理用户问题再读文件）：
```
1. 读取 ../team/<stem>_tasks.json
2. 查找 claimedByAgentId == 自己的任务
3. 如果有分配的任务，执行协作相关项
4. 若无分配任务但有 open，按上文「待领取」规则处理
5. 再处理用户的其他问题
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

**无法写文件时**：在回复中说明，请用户在 ClawTeam 任务台手动操作。

## 工作流程 D：Leader（main）——协调优先，禁止越俎代庖

**前提**：已通过 **团队空间门控**；若当前用户消息属于上文 **「简单任务」**，先直接协助用户，**不必**为满足本流程而先读任务文件。

**设计依据**（与业界多智能体编排一致）：**Coordinator / 分层委托（Delegator）**——协调者负责**分派、对齐、验收、改任务状态**；具体实现类工作由 **`agents.list` 中的执行方角色**承担。`main` 默认是 **Team Leader**，不是「包揽所有执行的万能工人」。

### 需要协调分派时（在回复用户其它内容之前）

1. 用 **read** 读取 **`../team/<stem>_tasks.json`**（强制）。
2. 将任务分为三类（按条目逐一判断）：

| 类型 | 条件 | Leader（main）该怎么做 |
| --- | --- | --- |
| **A. 指派给他人** | `status == "claimed"` 且 `claimedByAgentId` **存在且不等于** `"main"` | **禁止**代替对方写代码、改对方 workspace、替对方跑完实现类工作。✅ 可向用户说明「该项由【agent_id】负责」；✅ 可用 `sessions_send` 给该 agent 发简短同步（勿要求对方立即回复，除非阻塞）。✅ 引导用户：**在 ClawTeam 中打开该 agent 的会话**，由对方按工作流程 C 执行。 |
| **B. 指派给 Leader** | `claimedByAgentId == "main"` | 仅做 **Leader 职责内**的事：需求澄清、拆分任务、更新 `tasks.json`、汇总进度、验收标准核对、与用户对齐。**若任务标题/描述明显是「具体功能实现 / 专项执行」且团队里已有其它执行方**，优先在回复中建议 **改派**（在任务台把认领人改为对应 agent，或拆成 open 再指派），而不是自己从零实现整套交付物。 |
| **C. 待领取** | `status == "open"` | **禁止**把「待领取」默认当成「由我全部执行」。✅ 按 **工作流程 B** 拆分并写入 JSON，或引导用户在任务台**指派给合适的 agent id**；✅ 向用户说明下一步（点击对应 agent）。 |

3. **关于 ClawTeam 推送**：`open` 任务的通知往往会发到 Leader 会话——这只表示「需要协调」，**不表示**任务已分配给 `main` 执行。

### 严格禁止（Leader）

- ❌ 看到任务列表后，不区分 `claimedByAgentId`，直接开始写代码/跑命令把活干完（尤其是已指派给其他 id 的任务）。
- ❌ 用 **subagent** 或「自己代劳」的方式完成**本应**由其它 `agents.list` 角色完成的实现类工作（与工作流程 B 第 5 节一致）。
- ❌ 把「团队里只有我能看到通知」误解成「所有任务都该我做」。

### 推荐（Leader）

- ✅ 需要执行方动身时：明确写出 **目标 agent id** + 请用户 **在 UI 中点开该 agent**，与工作流程 B 第 5 节「下一步」说明一致。
- ✅ 轻量协调：`sessions_send` 到对应 `sessionKey`（一般为对方的 agent id），内容为任务编号/标题/依赖，**不要**代替对方执行。

## Agent 间通信（推荐使用）

ClawTeam 团队支持 OpenClaw 原生的 agent 间通信工具。团队空间创建时已自动配置 `tools.sessions.visibility = "all"`，允许 agent 之间发现和通信。

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

### 门控与简单任务（易错）
- **`team/*.json` 不存在**：不按本技能做团队分工；按普通单 agent 会话处理（见 **「团队空间门控」**）。
- **团队已开但用户只要改一行 / 问一句**：属 **简单任务**，不要强行写 `*_tasks.json`、不要走完整 **工作流程 B**，除非用户明确要求立项分工。

### 任务分配方式
- **推荐：在 ClawTeam 任务台手动指派**：创建任务时直接选择要分配给谁，状态自动设为 claimed
- **替代：创建 open 任务**：让 agent 自己查看任务标题并决定是否认领
- **不存在自动匹配**：Agent 不会根据 agent_id 或 role 字段自动判断任务是否适合

### role 字段的真实用途
- **role 是可选的备注字段**：用于在 ClawTeam UI 中显示，帮助人类理解 agent 的用途
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
- **Leader 边界**：main 不代替其它 agent 完成已指派给对方的工作、不用 subagent 代劳成员任务；详见 **工作流程 D**（Delegator：协调与验收在 Leader，实现类工作在执行方）
- **明确告诉用户下一步操作**：创建任务后说"请点击 coder"，而不是"任务已分配"就结束
- **任务台是主要分配方式**：通过 UI 手动指派比通过 sessions_send 通知更可靠

### 技术细节
- **`<stem>`** 须与当前实例 id 一致；默认实例是 `default`，其他实例是实例 id
- **文件路径使用相对路径**：从 workspace 访问用 `../team/<stem>_tasks.json`
- **Gateway 必须运行**：ClawTeam 后端的自动通知依赖 Gateway

## 任务状态（常见取值）

以文件为准：**待领取** `open`、**进行中** `claimed`、**已完成** `done`、**失败** `failed`（须带 `failureReason`）。新建任务可为 **待领取** 或 **指派并认领（`claimed`）**。

## 协作约定

- **Leader**（`leader_agent_id` = **`main`**）：拍板、分派、跨角色衔接；统筹需求时遵守 **工作流程 B**。非 Leader 不替他人承诺交付时间。
- **ClawTeam 客户端**：Team Leader 固定为 **`main`**；`team/<stem>.json` 中 `leader_agent_id` 与此一致。
- 交接时写清：**任务标题、agent id、阻塞**；多角色并行时可标明当前 **agent id**。

## 与 OpenClaw 的关系

与文首 **「OpenClaw 基础原则」** 一致：不改变 OpenClaw 的路由与会话模型；仅说明如何用已有工具读写 ClawTeam `team/*.json`。**Skills** 为说明文档，**Tools** 以 Gateway 为准；本协作不依赖 ClawTeam 私有工具类型。
