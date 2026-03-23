/**
 * Builds src/locales/{en,zh}/modelsCatalog.json from models.ts extraction + scripts/models-catalog-en.mjs
 * Run: node scripts/write-models-catalog-json.mjs
 */
import { readFileSync, writeFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { MODEL_DESC_EN } from "./models-catalog-en.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const modelsTs = readFileSync(join(root, "src/constants/models.ts"), "utf8")

let lastId = null
const zh = {}
for (const line of modelsTs.split("\n")) {
  const im = line.match(/^\s*id:\s*"([^"]+)"/)
  if (im) lastId = im[1]
  const dm = line.match(/^\s*description:\s*"((?:[^"\\]|\\.)*)"/)
  if (dm && lastId) {
    zh[lastId] = dm[1].replace(/\\"/g, '"')
    lastId = null
  }
}

const zhKeys = Object.keys(zh)
const enKeys = Object.keys(MODEL_DESC_EN)
const missingEn = zhKeys.filter((k) => MODEL_DESC_EN[k] === undefined)
const extraEn = enKeys.filter((k) => zh[k] === undefined)
if (missingEn.length) {
  console.error("Missing EN for:", missingEn.join(", "))
  process.exit(1)
}
if (extraEn.length) {
  console.error("Extra EN keys:", extraEn.join(", "))
  process.exit(1)
}

const wrap = (descriptions) => JSON.stringify({ modelsCatalog: { descriptions } }, null, 2) + "\n"
writeFileSync(join(root, "src/locales/zh/modelsCatalog.json"), wrap(zh), "utf8")
writeFileSync(join(root, "src/locales/en/modelsCatalog.json"), wrap(MODEL_DESC_EN), "utf8")
console.log("Wrote modelsCatalog.json en/zh,", zhKeys.length, "descriptions")
