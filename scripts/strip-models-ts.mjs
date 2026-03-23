import { readFileSync, writeFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const p = join(root, "src/constants/models.ts")
let s = readFileSync(p, "utf8")
s = s.replace(/^\s*description:\s*"(?:[^"\\]|\\.)*"\s*,?\s*\n/gm, "")
const marker = "export const PROVIDER_INFO:"
const start = s.indexOf(marker)
if (start === -1) throw new Error("PROVIDER_INFO not found")
let depth = 0
let i = s.indexOf("{", start)
for (; i < s.length; i++) {
  const c = s[i]
  if (c === "{") depth++
  else if (c === "}") {
    depth--
    if (depth === 0) {
      i++
      break
    }
  }
}
while (s[i] === " " || s[i] === "\t") i++
if (s[i] === "\n") i++
s = s.slice(0, start) + s.slice(i)
writeFileSync(p, s, "utf8")
console.log("Stripped models.ts")
