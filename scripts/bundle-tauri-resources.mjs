#!/usr/bin/env node
/**
 * Copies the OpenClaw npm package and a matching Node.js binary into resources/
 * so the packaged app can run `openclaw` without relying on PATH (macOS .app has a minimal PATH).
 */
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs"
import { createWriteStream } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const RES = join(ROOT, "resources")
const NODE_MAJOR = 22
const NODE_MINOR = 13
const NODE_PATCH = 1
const NODE_VERSION = `${NODE_MAJOR}.${NODE_MINOR}.${NODE_PATCH}`

function platformTriple() {
  const p = process.platform
  const a = process.arch
  if (p === "darwin" && a === "arm64") return "darwin-arm64"
  if (p === "darwin" && a === "x64") return "darwin-x64"
  if (p === "linux" && a === "x64") return "linux-x64"
  if (p === "linux" && a === "arm64") return "linux-arm64"
  if (p === "win32" && a === "x64") return "win-x64"
  if (p === "win32" && a === "ia32") return "win-x86"
  throw new Error(`Unsupported OS/arch for bundling Node: ${p} ${a}`)
}

function bundledNodeDir() {
  return join(RES, "node", platformTriple())
}

function bundledNodeExe() {
  const dir = bundledNodeDir()
  return process.platform === "win32" ? join(dir, "node.exe") : join(dir, "node")
}

function resolveOpenclawSource() {
  const fromEnv = process.env.OPENCLAW_PACKAGE_DIR
  if (fromEnv && existsSync(join(fromEnv, "openclaw.mjs"))) {
    return fromEnv
  }
  const mod = join(ROOT, "node_modules", "openclaw")
  if (existsSync(join(mod, "openclaw.mjs"))) return mod
  throw new Error(
    "openclaw package not found. Run pnpm install from the repo root, or set OPENCLAW_PACKAGE_DIR.",
  )
}

async function downloadToFile(url, dest) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`)
  }
  await pipeline(res.body, createWriteStream(dest))
}

function extractNodeArchive(archivePath, triple) {
  const tmp = join(tmpdir(), `pond-node-${Date.now()}`)
  mkdirSync(tmp, { recursive: true })
  try {
    if (archivePath.endsWith(".zip")) {
      if (process.platform === "win32") {
        execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-Command",
            `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force`,
          ],
          { stdio: "inherit" },
        )
      } else {
        execFileSync("unzip", ["-q", "-o", archivePath, "-d", tmp], { stdio: "inherit" })
      }
    } else if (archivePath.endsWith(".tar.xz")) {
      execFileSync("tar", ["-xJf", archivePath, "-C", tmp], { stdio: "inherit" })
    } else {
      execFileSync("tar", ["-xzf", archivePath, "-C", tmp], { stdio: "inherit" })
    }
    const base = `node-v${NODE_VERSION}-${triple}`
    const srcDir = join(tmp, base)
    const pick =
      process.platform === "win32" ? join(srcDir, "node.exe") : join(srcDir, "bin", "node")
    if (!existsSync(pick)) {
      throw new Error(`Expected Node binary at ${pick}`)
    }
    const dest = bundledNodeExe()
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(pick, dest)
    if (process.platform !== "win32") {
      chmodSync(dest, 0o755)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

async function ensureBundledNode(triple) {
  const dest = bundledNodeExe()
  if (existsSync(dest)) {
    try {
      chmodSync(dest, 0o755)
    } catch {
      // ignore
    }
    return
  }
  const base = `https://nodejs.org/dist/v${NODE_VERSION}/`
  const ext = triple.startsWith("win") ? "zip" : triple.startsWith("linux") ? "tar.xz" : "tar.gz"
  const name = `node-v${NODE_VERSION}-${triple}`
  const file = `${name}.${ext}`
  const url = base + file
  const dl = join(tmpdir(), `pond-${file}`)
  console.log(`Downloading ${url}`)
  await downloadToFile(url, dl)
  try {
    extractNodeArchive(dl, triple)
  } finally {
    rmSync(dl, { force: true })
  }
}

function copyOpenclaw(src) {
  const dst = join(RES, "openclaw")
  if (existsSync(dst)) {
    rmSync(dst, { recursive: true, force: true })
  }
  mkdirSync(RES, { recursive: true })
  cpSync(src, dst, { recursive: true })
  if (!existsSync(join(dst, "openclaw.mjs"))) {
    throw new Error(`Bundled openclaw missing openclaw.mjs under ${dst}`)
  }
  console.log(`Copied OpenClaw package to ${dst}`)
}

async function main() {
  if (process.env.SKIP_BUNDLE_TAURI_RESOURCES === "1") {
    console.log("SKIP_BUNDLE_TAURI_RESOURCES=1 — skipping resources bundle.")
    mkdirSync(RES, { recursive: true })
    return
  }
  const triple = platformTriple()
  const src = resolveOpenclawSource()
  copyOpenclaw(src)
  await ensureBundledNode(triple)
  const n = bundledNodeExe()
  if (!existsSync(n)) {
    throw new Error(`Bundled Node not found at ${n}`)
  }
  if (process.platform !== "win32") {
    try {
      chmodSync(n, 0o755)
    } catch {
      // ignore
    }
  }
  console.log(`Node runtime ready: ${n} (${statSync(n).size} bytes)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
