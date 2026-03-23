/**
 * Second pass: replace remaining Chinese JSX / template fragments in AgentView.tsx.
 * Run: node scripts/patch-agent-view-jsx.mjs
 */
import { readFileSync, writeFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const file = join(dirname(fileURLToPath(import.meta.url)), "..", "src/components/AgentView.tsx")
let code = readFileSync(file, "utf8")

/** [from, to] — longest strings first (script sorts by length desc) */
const pairs = [
  [
    `                  确定删除「{getAgentDisplayName(selectedId, displayNames)}」？将同时删除其 OpenClaw 实例目录、绑定的渠道和聊天记录，此操作不可撤销。`,
    `{t("agentView.deleteInstance.confirm", { name: getAgentDisplayName(selectedId, displayNames) })}`,
  ],
  [
    `                        {(!skillsForInstance || skillsForInstance.all.length === 0) ? (
                          <p className="text-sm text-app-muted">
                            未能列出技能。请确认本机可运行 OpenClaw CLI；也可通过上方安装技能到工作区或托管目录（
                            <a href="https://docs.openclaw.ai/zh-CN/tools/skills#%E4%BD%8D%E7%BD%AE%E5%92%8C%E4%BC%98%E5%85%88%E7%BA%A7" target="_blank" rel="noopener noreferrer" className="text-claw-400 hover:underline">优先级</a>
                            ：工作区 &gt; 托管/本地 &gt; 内置）。
                          </p>
                        ) : (`,
    `                        {(!skillsForInstance || skillsForInstance.all.length === 0) ? (
                          <p className="text-sm text-app-muted">
                            {t("agentView.skills.listErrorLead")}
                            <a href="https://docs.openclaw.ai/zh-CN/tools/skills#%E4%BD%8D%E7%BD%AE%E5%92%8C%E4%BC%98%E5%85%88%E7%BA%A7" target="_blank" rel="noopener noreferrer" className="text-claw-400 hover:underline">{t("agentView.skills.listErrorLinkLabel")}</a>
                            {t("agentView.skills.listErrorTail")}
                          </p>
                        ) : (`,
  ],
  [
    `                          <AlertDialogTitle>删除角色「{deleteRoleId ?? ""}」？</AlertDialogTitle>
                          <AlertDialogDescription className="text-app-muted">
                            将从当前实例的 agents.list 中移除；Pond 团队展示中对应条目也会去掉。至少保留一个角色。删除后请重启
                            Gateway，并检查 bindings 是否仍引用该 agentId。若该 agent 已有数据目录，请自行备份对应{" "}
                            <code className="text-xs">~/.openclaw-*</code> 或 OpenClaw 文档中的路径。
                          </AlertDialogDescription>`,
    `                          <AlertDialogTitle>{t("agentView.deleteRole.title", { id: deleteRoleId ?? "" })}</AlertDialogTitle>
                          <AlertDialogDescription className="text-app-muted">
                            {t("agentView.deleteRole.desc")}
                          </AlertDialogDescription>`,
  ],
  [
    `                                    <p>
                                      保存时写入 OpenClaw：<span className="font-mono">session.dmScope=main</span>（多渠道私聊走同一会话键）、
                                      <span className="font-mono">session.reset.mode=off</span>（关闭空闲与定时自动换新 session）。
                                    </p>
                                    <p className="mt-2">
                                      多人同时使用同一 Agent 会共用上下文；对话过长时仍可能触发模型侧的压缩或截断。
                                    </p>`,
    `                                    <p>
                                      {t("agentView.session.saveNote")}
                                    </p>
                                    <p className="mt-2">
                                      {t("agentView.session.warning")}
                                    </p>`,
  ],
  [
    `                          <p>
                            <span className="font-medium text-app-text">pond-team</span>：开启团队空间后写入当前实例{" "}
                            <code className="rounded bg-app-elevated px-1 py-0.5 text-xs font-mono">skills/pond-team/SKILL.md</code>，供角色按协作约定使用。
                          </p>
                          <p>
                            心跳轻量上下文开启时，仅向心跳注入{" "}
                            <code className="rounded bg-app-elevated px-1 py-0.5 text-xs font-mono">HEARTBEAT.md</code>（见「心跳与定时」）。
                          </p>
                          <p>
                            OpenClaw 多 Agent 与路由见官方文档：{" "}`,
    `                          <p>
                            {t("agentView.team.dashboardHint")}
                          </p>
                          <p>
                            {t("agentView.team.heartbeatInject")}
                          </p>
                          <p>
                            {t("agentView.team.openclawDoc")}{" "}`,
  ],
  [`            <p className="text-app-muted">加载配置中…</p>`, `<p className="text-app-muted">{t("agentView.loadingConfig")}</p>`],
  [
    `            >
              重试
            </Button>`,
    `            >
              {t("agentView.retry")}
            </Button>`,
  ],
  [
    `            <p className="mt-6 text-sm font-medium text-app-text">请使用侧栏顶部实例切换器选择或添加实例</p>
            <p className="mt-1 text-xs text-app-muted">当前实例由全局切换器统一管理，此处仅编辑选中实例的配置</p>`,
    `<p className="mt-6 text-sm font-medium text-app-text">{t("agentView.empty.noInstance")}</p>
            <p className="mt-1 text-xs text-app-muted">{t("agentView.empty.instanceHint")}</p>`,
  ],
  [`              创建 claw 实例`, `{t("agentView.action.createClawInstance")}`],
  [`                <p className="text-xs font-medium text-app-muted mb-2">发现系统实例</p>`, `<p className="text-xs font-medium text-app-muted mb-2">{t("agentView.discover.systemInstance")}</p>`],
  [`                        导入`, `{t("agentView.action.import")}`],
  [`<CardTitle className="text-sm font-medium text-app-text">模型配置</CardTitle>`, `<CardTitle className="text-sm font-medium text-app-text">{t("agentView.section.modelConfig")}</CardTitle>`],
  [`                                添加模型`, `{t("agentView.action.addModel")}`],
  [`<DropdownMenuLabel className="text-xs font-medium text-app-muted">选择提供商</DropdownMenuLabel>`, `<DropdownMenuLabel className="text-xs font-medium text-app-muted">{t("agentView.selectProvider")}</DropdownMenuLabel>`],
  [`<p className="text-sm font-medium text-app-text">暂无模型</p>`, `<p className="text-sm font-medium text-app-text">{t("agentView.model.noneTitle")}</p>`],
  [`<p className="mt-1 text-xs text-app-muted">添加后填写 API Key 即可使用</p>`, `<p className="mt-1 text-xs text-app-muted">{t("agentView.model.noneHint")}</p>`],
  [`                                  添加第一个模型`, `{t("agentView.action.addFirstModel")}`],
  [`                                            默认`, `{t("agentView.model.default")}`],
  [`                                            当前使用`, `{t("agentView.model.inUse")}`],
  [`                                              获取 Key`, `{t("agentView.action.getKey")}`],
  [`<Label className="text-xs font-medium text-app-muted">模型 ID</Label>`, `<Label className="text-xs font-medium text-app-muted">{t("agentView.model.modelId")}</Label>`],
  [`                                            测试连接`, `{t("agentView.action.testConnection")}`],
  [`                                              设为默认`, `{t("agentView.action.setDefault")}`],
  [`                                                删除`, `{t("agentView.delete")}`],
  [`<AlertDialogTitle>确定删除该模型？</AlertDialogTitle>`, `<AlertDialogTitle>{t("agentView.model.deleteTitle")}</AlertDialogTitle>`],
  [`                                                  删除后，使用此模型的实例将改为使用默认模型。此操作不可撤销。`, `{t("agentView.model.deleteDesc")}`],
  [`                                                  取消`, `{t("common.cancel")}`],
  [`                                                  确定删除`, `{t("agentView.confirmDelete")}`],
  [`<CardTitle className="text-sm font-medium text-app-text">会话管理</CardTitle>`, `<CardTitle className="text-sm font-medium text-app-text">{t("agentView.section.session")}</CardTitle>`],
  [`<Label className="text-xs font-medium text-app-text">跨渠道长期续聊</Label>`, `<Label className="text-xs font-medium text-app-text">{t("agentView.session.longContinuity")}</Label>`],
  [`<Label className="text-xs text-app-muted">DM 会话作用域</Label>`, `<Label className="text-xs text-app-muted">{t("agentView.session.dmScope")}</Label>`],
  [`<SelectItem value="main">main（跨端/多渠道同一会话键）</SelectItem>`, `<SelectItem value="main">{t("agentView.session.dm.main")}</SelectItem>`],
  [`<SelectItem value="per-peer">per-peer（按发送者隔离）</SelectItem>`, `<SelectItem value="per-peer">{t("agentView.session.dm.perPeer")}</SelectItem>`],
  [`<SelectItem value="per-channel-peer">per-channel-peer（按渠道+发送者）</SelectItem>`, `<SelectItem value="per-channel-peer">{t("agentView.session.dm.perChannelPeer")}</SelectItem>`],
  [
    `<SelectItem value="per-account-channel-peer">per-account-channel-peer（完全隔离）</SelectItem>`,
    `<SelectItem value="per-account-channel-peer">{t("agentView.session.dm.full")}</SelectItem>`,
  ],
  [`<Label className="text-xs text-app-muted">自动重置模式</Label>`, `<Label className="text-xs text-app-muted">{t("agentView.session.resetMode")}</Label>`],
  [`<SelectItem value="off">默认（不写 reset，含官方空闲过期等）</SelectItem>`, `<SelectItem value="off">{t("agentView.session.reset.off")}</SelectItem>`],
  [`<SelectItem value="never">显式关闭轮换（session.reset.mode=off）</SelectItem>`, `<SelectItem value="never">{t("agentView.session.reset.never")}</SelectItem>`],
  [`<SelectItem value="daily">每日重置</SelectItem>`, `<SelectItem value="daily">{t("agentView.session.reset.daily")}</SelectItem>`],
  [`<SelectItem value="idle">空闲后重置</SelectItem>`, `<SelectItem value="idle">{t("agentView.session.reset.idle")}</SelectItem>`],
  [`<Label className="text-xs text-app-muted">重置时刻（小时）</Label>`, `<Label className="text-xs text-app-muted">{t("agentView.session.resetHour")}</Label>`],
  [`<Label className="text-xs text-app-muted">空闲超时（分钟）</Label>`, `<Label className="text-xs text-app-muted">{t("agentView.session.idleMinutes")}</Label>`],
  [`                          保存会话配置`, `{t("agentView.action.saveSession")}`],
  [`<CardTitle className="text-sm font-medium text-app-text">历史会话</CardTitle>`, `<CardTitle className="text-sm font-medium text-app-text">{t("agentView.section.historySessions")}</CardTitle>`],
  [`                            刷新`, `{t("agentView.action.refresh")}`],
  [
    `                                当前实例暂无对话记录，在「对话」中与 Agent 交流后会在此显示`,
    `{t("agentView.history.noChats")}`,
  ],
  [
    `                                        <span className="text-sm font-medium text-app-text">当前会话</span>`,
    `<span className="text-sm font-medium text-app-text">{t("agentView.history.current")}</span>`,
  ],
  [`                                          {s.messageCount} 条`, `{t("agentView.history.messages", { count: s.messageCount })}`],
  [`                                      在对话中打开`, `{t("agentView.action.openInChat")}`],
  [`                          角色列表`, `{t("agentView.section.roles")}`],
  [
    `                            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-app-muted">成员与模型</h3>`,
    `<h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-app-muted">{t("agentView.section.membersModels")}</h3>`,
  ],
  [`                              添加角色`, `{t("agentView.action.addRole")}`],
  [`<p className="text-sm font-medium text-app-text">尚未添加角色</p>`, `<p className="text-sm font-medium text-app-text">{t("agentView.roles.none")}</p>`],
  [`                                    添加首个角色`, `{t("agentView.action.addFirstRole")}`],
  [`                                              工作区`, `{t("agentView.action.workspace")}`],
  [`<Label className="text-xs font-medium text-app-text">绑定模型</Label>`, `<Label className="text-xs font-medium text-app-text">{t("agentView.addRole.bindModel")}</Label>`],
  [`<Label className="text-xs text-app-muted">角色说明</Label>`, `<Label className="text-xs text-app-muted">{t("agentView.role.roleDescLabel")}</Label>`],
  [`                            正在同步 Pond 团队信息…`, `{t("agentView.team.syncing")}`],
  [`<CardTitle className="text-base font-semibold text-app-text">团队空间</CardTitle>`, `<CardTitle className="text-base font-semibold text-app-text">{t("agentView.section.teamSpace")}</CardTitle>`],
  [`<p className="text-sm text-app-muted">正在检查团队空间…</p>`, `<p className="text-sm text-app-muted">{t("agentView.team.checking")}</p>`],
  [`<h3 className="mt-4 text-lg font-semibold text-app-text">尚未开启团队空间</h3>`, `<h3 className="mt-4 text-lg font-semibold text-app-text">{t("agentView.team.notEnabledTitle")}</h3>`],
  [`                                  团队名称（可选）`, `{t("agentView.team.nameOptional")}`],
  [`                                开启团队空间`, `{t("agentView.action.enableTeamSpace")}`],
  [`                                  请先在「团队 → 角色列表」添加至少一个角色后再开启。`, `{t("agentView.team.enableNeedRoles")}`],
  [`<Label htmlFor="team-name-pond" className="text-xs text-app-muted">团队名称</Label>`, `<Label htmlFor="team-name-pond" className="text-xs text-app-muted">{t("agentView.label.teamName")}</Label>`],
  [`                                  保存`, `{t("agentView.save")}`],
  [`<p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">角色数</p>`, `<p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">{t("agentView.team.roleCount")}</p>`],
  [`<p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">团队任务</p>`, `<p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">{t("agentView.team.tasksLabel")}</p>`],
  [`                                  打开任务台`, `{t("agentView.action.openTasks")}`],
  [`<p className="text-xs font-semibold text-app-text">近期任务</p>`, `<p className="text-xs font-semibold text-app-text">{t("agentView.team.recentTasks")}</p>`],
  [`                                  查看全部`, `{t("agentView.action.viewAll")}`],
  [`<p className="text-xs text-app-muted">暂无任务；在任务台中添加。</p>`, `<p className="text-xs text-app-muted">{t("agentView.team.noTasks")}</p>`],
  [`<h3 className="text-sm font-semibold text-app-text">团队任务台</h3>`, `<h3 className="text-sm font-semibold text-app-text">{t("agentView.task.boardTitle")}</h3>`],
  [
    `                                  成员会话活跃度与任务状态同屏；完成度随「已完成」任务更新。`,
    `{t("agentView.task.boardSubtitle")}`,
  ],
  [`                              同步`, `{t("agentView.action.sync")}`],
  [`<p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">成员动态</p>`, `<p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-app-muted">{t("agentView.activity.title")}</p>`],
  [`<p className="text-xs text-app-muted">选择实例后显示</p>`, `<p className="text-xs text-app-muted">{t("agentView.activity.selectInstance")}</p>`],
  [`<p className="text-xs text-app-muted">启动 Gateway 后可查看各角色会话活跃度</p>`, `<p className="text-xs text-app-muted">{t("agentView.activity.startGateway")}</p>`],
  [`                                任务`, `{t("agentView.task.tabTasks")}`],
  [`                                  完成度`, `{t("agentView.task.completionLabel")}`],
  [`<Label className="text-[11px] font-medium text-app-muted">任务标题</Label>`, `<Label className="text-[11px] font-medium text-app-muted">{t("agentView.task.addTitle")}</Label>`],
  [`<Label className="text-[11px] font-medium text-app-muted">添加方式</Label>`, `<Label className="text-[11px] font-medium text-app-muted">{t("agentView.task.addMode")}</Label>`],
  [`<SelectItem value="assigned">指派并认领</SelectItem>`, `<SelectItem value="assigned">{t("agentView.task.modeAssigned")}</SelectItem>`],
  [`<SelectItem value="open">待领取</SelectItem>`, `<SelectItem value="open">{t("agentView.task.modeOpen")}</SelectItem>`],
  [`<Label className="text-[11px] font-medium text-app-muted">指派人</Label>`, `<Label className="text-[11px] font-medium text-app-muted">{t("agentView.task.assignee")}</Label>`],
  [
    `                                请先在「团队 → 角色列表」中添加至少一个角色后再指派任务。`,
    `{t("agentView.task.needRolesForAssign")}`,
  ],
  [`<span className="font-medium text-app-text/80">原因：</span>`, `<span className="font-medium text-app-text/80">{t("agentView.task.reasonPrefix")}</span>`],
  [`                                              更新{" "}`, `{t("agentView.task.update")}{" "}`],
  [`                                                指派人{" "}`, `{t("agentView.task.reassign")}{" "}`],
  [`                                                标记失败`, `{t("agentView.task.markFailShort")}`],
  [
    `                            请先在「概览」中开启团队空间，再在此管理任务与成员动态。`,
    `{t("agentView.task.enableSpaceFirst")}`,
  ],
  [`<DialogTitle className="text-lg">标记任务失败</DialogTitle>`, `<DialogTitle className="text-lg">{t("agentView.task.failDialogTitle")}</DialogTitle>`],
  [
    `                            请填写原因，Leader（main）会收到提醒并协调后续处理。`,
    `{t("agentView.task.failDialogDesc")}`,
  ],
  [`<Label className="text-xs font-medium text-app-text">失败原因</Label>`, `<Label className="text-xs font-medium text-app-text">{t("agentView.task.failReason")}</Label>`],
  [`                            返回`, `{t("agentView.action.back")}`],
  [`<DialogTitle className="text-lg">添加角色</DialogTitle>`, `<DialogTitle className="text-lg">{t("agentView.addRole.title")}</DialogTitle>`],
  [
    `                            为团队新增一名角色，并为其选择要使用的模型。`,
    `{t("agentView.addRole.desc")}`,
  ],
  [`<Label className="text-xs font-medium text-app-text">角色 ID</Label>`, `<Label className="text-xs font-medium text-app-text">{t("agentView.addRole.id")}</Label>`],
  [
    `                            <p className="text-[11px] text-app-muted">字母开头，可用字母、数字、连字符与下划线，至多 63 个字符。</p>`,
    `<p className="text-[11px] text-app-muted">{t("agentView.addRole.idHint")}</p>`,
  ],
  [`                                保存中…`, `{t("agentView.saving")}`],
  [`<CardTitle className="text-base font-medium text-app-text">心跳 (Heartbeat)</CardTitle>`, `<CardTitle className="text-base font-medium text-app-text">{t("agentView.section.heartbeat")}</CardTitle>`],
  [`<Label className="text-xs font-medium text-app-muted">配置作用域</Label>`, `<Label className="text-xs font-medium text-app-muted">{t("agentView.heartbeat.scope")}</Label>`],
  [`<SelectItem value="__defaults__">全局默认（agents.defaults）</SelectItem>`, `<SelectItem value="__defaults__">{t("agentView.heartbeat.defaults")}</SelectItem>`],
  [`<span className="shrink-0 text-xs text-app-muted">至</span>`, `<span className="shrink-0 text-xs text-app-muted">{t("agentView.heartbeat.to")}</span>`],
  [`<Label className="text-xs font-medium text-app-muted">目标 target</Label>`, `<Label className="text-xs font-medium text-app-muted">{t("agentView.heartbeat.target")}</Label>`],
  [`<SelectItem value="none">none（不对外投递）</SelectItem>`, `<SelectItem value="none">{t("agentView.heartbeat.targetNone")}</SelectItem>`],
  [`<Label className="text-xs font-medium text-app-muted">私聊投递 directPolicy</Label>`, `<Label className="text-xs font-medium text-app-muted">{t("agentView.heartbeat.directPolicy")}</Label>`],
  [`<Label className="text-xs font-medium text-app-muted">收件人 to（可选）</Label>`, `<Label className="text-xs font-medium text-app-muted">{t("agentView.heartbeat.toLabel")}</Label>`],
  [`<Label className="text-xs font-medium text-app-muted">账户 accountId（可选）</Label>`, `<Label className="text-xs font-medium text-app-muted">{t("agentView.heartbeat.accountLabel")}</Label>`],
  [`<p className="text-xs text-app-muted">仅注入 HEARTBEAT.md</p>`, `<p className="text-xs text-app-muted">{t("agentView.heartbeat.lightContextHint")}</p>`],
  [`                          保存心跳配置`, `{t("agentView.action.saveHeartbeat")}`],
  [`<CardTitle className="text-sm font-medium text-app-text">定时任务</CardTitle>`, `<CardTitle className="text-sm font-medium text-app-text">{t("agentView.section.cron")}</CardTitle>`],
  [
    `                                当前实例暂无定时任务，在对话中让 Agent 创建定时任务后会在此显示`,
    `{t("agentView.cron.empty")}`,
  ],
  [
    `{job.enabled && job.nextRunAt && <p className="mt-0.5 text-[11px] text-app-muted/80 pl-4">下次运行：{job.nextRunAt}</p>}`,
    `{job.enabled && job.nextRunAt && <p className="mt-0.5 text-[11px] text-app-muted/80 pl-4">{t("agentView.cron.nextRun", { time: job.nextRunAt })}</p>}`,
  ],
  [`<CardTitle className="text-sm font-medium text-app-text">消息渠道</CardTitle>`, `<CardTitle className="text-sm font-medium text-app-text">{t("agentView.section.channels")}</CardTitle>`],
  [`<CardTitle className="text-sm font-medium text-app-text">技能</CardTitle>`, `<CardTitle className="text-sm font-medium text-app-text">{t("agentView.section.skills")}</CardTitle>`],
  [`                            安装`, `{t("agentView.skills.install")}`],
  [`<p className="text-sm font-medium text-app-text">全部技能</p>`, `<p className="text-sm font-medium text-app-text">{t("agentView.skills.allTitle")}</p>`],
  [`                                全部启用`, `{t("agentView.skills.enableAll")}`],
  [`                                全部禁用`, `{t("agentView.skills.disableAll")}`],
  [`<p className="px-3 py-8 text-center text-sm text-app-muted">无匹配技能，请调整关键词</p>`, `<p className="px-3 py-8 text-center text-sm text-app-muted">{t("agentView.skills.noMatch")}</p>`],
  [`                                          内置`, `{t("agentView.skills.builtin")}`],
  [`                                            卸载`, `{t("agentView.skills.uninstall")}`],
  [`                          保存技能配置`, `{t("agentView.action.saveSkills")}`],
  [`<CardTitle className="text-sm font-medium text-app-text">工具权限</CardTitle>`, `<CardTitle className="text-sm font-medium text-app-text">{t("agentView.section.tools")}</CardTitle>`],
  [`<Label className="text-xs text-app-muted">预设模板（Profile）</Label>`, `<Label className="text-xs text-app-muted">{t("agentView.tools.profileLabel")}</Label>`],
  [`                          保存工具权限`, `{t("agentView.action.saveTools")}`],
  [`                          工作区文件`, `{t("agentView.section.workspaceFiles")}`],
  [`<Label className="text-xs text-app-muted shrink-0">编辑目标</Label>`, `<Label className="text-xs text-app-muted shrink-0">{t("agentView.workspace.editTarget")}</Label>`],
  [`<SelectItem value="__default__">实例默认 workspace/</SelectItem>`, `<SelectItem value="__default__">{t("agentView.workspace.defaultWs")}</SelectItem>`],
  [`<p className="px-3 py-2 text-xs text-app-muted">加载失败或暂无列表</p>`, `<p className="px-3 py-2 text-xs text-app-muted">{t("agentView.workspace.loadError")}</p>`],
  [`<span className="ml-1 text-[10px] text-app-muted">（未创建）</span>`, `<span className="ml-1 text-[10px] text-app-muted">{t("agentView.workspace.notCreated")}</span>`],
  [`                                重新加载`, `{t("agentView.action.reload")}`],
  [`<CardTitle className="text-sm font-medium text-app-text">浏览器</CardTitle>`, `<CardTitle className="text-sm font-medium text-app-text">{t("agentView.section.browser")}</CardTitle>`],
  [`<span className="text-xs text-app-muted">启用</span>`, `<span className="text-xs text-app-muted">{t("agentView.browser.enabled")}</span>`],
  [`<Label htmlFor="browser-profile" className="text-app-muted">配置文件</Label>`, `<Label htmlFor="browser-profile" className="text-app-muted">{t("agentView.browser.profile")}</Label>`],
  [
    `<SelectItem value="openclaw">openclaw — 托管隔离浏览器（可固定 profile）</SelectItem>`,
    `<SelectItem value="openclaw">{t("agentView.browser.mode.openclaw")}</SelectItem>`,
  ],
  [`<SelectItem value="chrome">chrome — 系统浏览器 + 扩展中继</SelectItem>`, `<SelectItem value="chrome">{t("agentView.browser.mode.chrome")}</SelectItem>`],
  [`<Label htmlFor="browser-user-data-dir" className="text-app-muted">Profile 目录</Label>`, `<Label htmlFor="browser-user-data-dir" className="text-app-muted">{t("agentView.browser.userDataDir")}</Label>`],
  [`<Label htmlFor="browser-executable" className="text-app-muted">可执行文件</Label>`, `<Label htmlFor="browser-executable" className="text-app-muted">{t("agentView.browser.executable")}</Label>`],
  [`<Label htmlFor="browser-color" className="text-app-muted">主题色</Label>`, `<Label htmlFor="browser-color" className="text-app-muted">{t("agentView.browser.color")}</Label>`],
  [`<Label htmlFor="browser-attach-only" className="text-app-muted">仅附加</Label>`, `<Label htmlFor="browser-attach-only" className="text-app-muted">{t("agentView.browser.attachOnly")}</Label>`],
  [
    `                                        openclaw 托管浏览器窗口的主题色，用于标题栏等界面元素。`,
    `{t("agentView.browser.colorHint")}`,
  ],
  [
    `                                        无头模式，不显示浏览器窗口，在后台运行。适合服务器或不需要看到界面的场景。`,
    `{t("agentView.browser.headlessHint")}`,
  ],
  [
    `                                        关闭 Chrome 沙箱。部分环境（如 Docker、某些 Linux）需要开启才能正常启动浏览器。`,
    `{t("agentView.browser.noSandboxHint")}`,
  ],
  [
    `                                        不自动启动浏览器，仅附加到已存在且开启远程调试的 Chrome 实例（如你自启的固定 profile）。`,
    `{t("agentView.browser.attachOnlyHint")}`,
  ],
  [`                              打开浏览器`, `{t("agentView.action.openBrowser")}`],
  [`                            文档`, `{t("agentView.section.docs")}`],
  [`                            删除此 Agent`, `{t("agentView.action.deleteAgent")}`],
  [`<h3 className="mt-4 text-base font-semibold text-app-text">删除实例</h3>`, `<h3 className="mt-4 text-base font-semibold text-app-text">{t("agentView.deleteInstance.title")}</h3>`],
  [`                  取消`, `{t("common.cancel")}`],
  [
    `                                <SelectItem key={id} value={id}>
                                  角色 {id}
                                </SelectItem>`,
    `                                <SelectItem key={id} value={id}>
                                  {t("agentView.heartbeat.rolePrefix", { id })}
                                </SelectItem>`,
  ],
  [
    `                            <p className="text-xs text-app-muted">
                              下方留空并保存将移除该角色的 <code className="font-mono text-[11px]">heartbeat</code>，改继承全局默认。
                            </p>`,
    `                            <p className="text-xs text-app-muted">
                              {t("agentView.heartbeat.inheritHint")}
                            </p>`,
  ],
  [
    `                                  <SelectItem key={a.id} value={a.id}>
                                    {a.id}（独立 workspace）
                                  </SelectItem>`,
    `                                  <SelectItem key={a.id} value={a.id}>
                                    {t("agentView.workspace.roleWs", { id: a.id })}
                                  </SelectItem>`,
  ],
  [
    `                                onClick={() => void submitNewTeamTask()}
                              >
                                添加
                              </Button>`,
    `                                onClick={() => void submitNewTeamTask()}
                              >
                                {t("agentView.action.add")}
                              </Button>`,
  ],
]

pairs.sort((a, b) => b[0].length - a[0].length)

for (const [from, to] of pairs) {
  const n = code.split(from).length - 1
  if (n === 0) {
    console.warn("SKIP (not found):", from.slice(0, 90).replace(/\n/g, "\\n"))
    continue
  }
  code = code.split(from).join(to)
  console.log("OK x" + n + ":", from.slice(0, 50).replace(/\n/g, " "))
}

writeFileSync(file, code, "utf8")
console.log("Done patch-agent-view-jsx")
