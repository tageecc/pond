/**
 * Replaces Chinese literals in AgentView.tsx with t("agentView.*") using rows from write-agent-view-locales.mjs.
 * Run after: node scripts/write-agent-view-locales.mjs
 */
import { readFileSync, writeFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { rows } from "./write-agent-view-locales.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const file = join(root, "src/components/AgentView.tsx")

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

let code = readFileSync(file, "utf8")

/** Exact substring replacements (templates and multi-line) */
const literals = [
  [
    `      : [{ value: defaultModelId || "openai", label: \`默认 (\${defaultModelId || "openai"}，可先在「模型」中配置)\` }]`,
    `      : [{ value: defaultModelId || "openai", label: t("agentView.model.defaultOptionLabel", { id: defaultModelId || "openai" }) }]`,
  ],
  ["toast.success(`已导入 Agent「${discovered.name}」`)", "toast.success(t(\"agentView.toast.importAgent\", { name: discovered.name }))"],
  [
    "toast.error(`导入失败: ${e instanceof Error ? e.message : String(e)}`)",
    "toast.error(t(\"agentView.toast.importFailed\", { msg: e instanceof Error ? e.message : String(e) }))",
  ],
  ["toast.success(`已删除实例「${deletedName}」`)", "toast.success(t(\"agentView.toast.instanceDeleted\", { name: deletedName }))"],
  ["toast.error(`删除失败: ${errorMsg}`)", "toast.error(t(\"agentView.toast.deleteInstanceFailed\", { msg: errorMsg }))"],
  [
    "window.confirm(`确定要卸载技能「${skillId}」吗？将从所有实例中删除该技能目录，且无法恢复。`)",
    "window.confirm(t(\"agentView.skills.uninstallConfirm\", { id: skillId }))",
  ],
  ["toast.success(`已卸载技能「${skillId}」`)", "toast.success(t(\"agentView.toast.skillUninstalled\", { id: skillId }))"],
  [
    "title={isLeader ? `Team Leader 固定为 id「${TEAM_LEADER_AGENT_ID}」` : undefined}",
    "title={isLeader ? t(\"agentView.leader.titleFixed\", { id: TEAM_LEADER_AGENT_ID }) : undefined}",
  ],
  [
    "title={`界面展示名称；未填写时与角色 ID「${agent.id}」相同。保存配置仍使用下方技术 ID。`}",
    "title={t(\"agentView.role.displayNameTitle\", { id: agent.id })}",
  ],
  ["aria-label={`角色显示名，默认同 ${agent.id}`}", "aria-label={t(\"agentView.role.displayNameAria\", { id: agent.id })}"],
  ["aria-label={`删除角色 ${agent.id}`}", "aria-label={t(\"agentView.role.deleteAria\", { id: agent.id })}"],
  [
    "{teamTaskStats.failed > 0 ? ` · 需协调 ${teamTaskStats.failed}` : \"\"}",
    '{teamTaskStats.failed > 0 ? t("agentView.team.tasksNeedCoord", { n: teamTaskStats.failed }) : ""}',
  ],
  [
    "                                          ? `${row.sessionCount} 个主会话 · ID ${row.agentId}`",
    '                                          ? t("agentView.activity.sessionLine", { n: row.sessionCount, id: row.agentId })',
  ],
  [
    "aria-label={`打开技能 ${row.name} 所在目录`}",
    "aria-label={t(\"agentView.skills.openSkillDirAria\", { name: row.name })}",
  ],
  ["aria-label={`打开 ${row.name} 目录`}", "aria-label={t(\"agentView.skills.openFolderAria\", { name: row.name })}"],
  [
    "toast.error(`打开目录失败: ${e instanceof Error ? e.message : String(e)}`)",
    "toast.error(t(\"agentView.toast.openDirFailed\", { msg: e instanceof Error ? e.message : String(e) }))",
  ],
  [
    "                                  已完成 {teamTaskStats.done}",
    '                                  {t("agentView.team.tasksDone", { done: teamTaskStats.done })}',
  ],
]

for (const [from, to] of literals) {
  if (!code.includes(from)) {
    console.warn("Literal not found (skipped):", from.slice(0, 100).replace(/\n/g, "\\n"))
    continue
  }
  code = code.split(from).join(to)
}

/** zh -> agentView.path (last wins) */
const zhToPath = new Map()
for (const [path, , zh] of rows) {
  if (!zh || !/[\u4e00-\u9fff]/.test(zh)) continue
  zhToPath.set(zh, path)
}

const pairs = [...zhToPath.entries()].sort((a, b) => b[0].length - a[0].length)

for (const [zh, dotPath] of pairs) {
  const key = `agentView.${dotPath}`
  const quoted = `"${zh}"`
  if (!code.includes(quoted)) continue
  const repl = `t("${key}")`
  const re = new RegExp(escapeRe(quoted), "g")
  code = code.replace(re, (match, offset, str) => {
    const before = str.slice(Math.max(0, offset - 20), offset)
    if (before.includes('t("agentView.') || before.includes("t('agentView.")) return match
    return repl
  })
}

writeFileSync(file, code, "utf8")
console.log("Patched AgentView.tsx")
