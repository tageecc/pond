#!/usr/bin/env node
/**
 * Copies OpenClaw from node_modules and the matching official Node binary into resources/.
 * The Node **dist triple** must match the **Rust target** of the Tauri build (e.g. Intel mac
 * DMG needs darwin-x64 even when built on an arm64 runner). CI sets POND_NODE_DIST_TRIPLE.
 */
import {
  chmodSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs"
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

/** Official Node tarball/zip name segment, aligned with gateway.rs bundled_node_platform(). */
const RUST_TRIPLE_TO_NODE_DIST = {
  "aarch64-apple-darwin": "darwin-arm64",
  "x86_64-apple-darwin": "darwin-x64",
  "x86_64-unknown-linux-gnu": "linux-x64",
  "aarch64-unknown-linux-gnu": "linux-arm64",
  "x86_64-pc-windows-msvc": "win-x64",
}

function hostNodeDistTriple() {
  const p = process.platform
  const a = process.arch
  if (p === "darwin" && a === "arm64") return "darwin-arm64"
  if (p === "darwin" && a === "x64") return "darwin-x64"
  if (p === "linux" && a === "x64") return "linux-x64"
  if (p === "linux" && a === "arm64") return "linux-arm64"
  if (p === "win32" && a === "x64") return "win-x64"
  if (p === "win32" && a === "ia32") return "win-x86"
  throw new Error(`Unsupported host OS/arch for bundling Node: ${p} ${a}`)
}

function effectiveNodeDistTriple() {
  const explicit = process.env.POND_NODE_DIST_TRIPLE?.trim()
  if (explicit) return explicit
  const rust =
    process.env.TAURI_ENV_TARGET_TRIPLE?.trim() ||
    process.env.TARGET?.trim() ||
    process.env.CARGO_BUILD_TARGET?.trim()
  if (rust && RUST_TRIPLE_TO_NODE_DIST[rust]) return RUST_TRIPLE_TO_NODE_DIST[rust]
  return hostNodeDistTriple()
}

function bundledNodeExePath(triple) {
  const dir = join(RES, "node", triple)
  return triple.startsWith("win") ? join(dir, "node.exe") : join(dir, "node")
}

function resolveOpenclawSource() {
  const mod = join(ROOT, "node_modules", "openclaw")
  if (existsSync(join(mod, "openclaw.mjs"))) return mod
  throw new Error("openclaw not found under node_modules; run pnpm install from the repo root.")
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
    const pick = triple.startsWith("win")
      ? join(srcDir, "node.exe")
      : join(srcDir, "bin", "node")
    if (!existsSync(pick)) {
      throw new Error(`Expected Node binary at ${pick}`)
    }
    const dest = bundledNodeExePath(triple)
    mkdirSync(dirname(dest), { recursive: true })
    cpSync(pick, dest)
    if (!triple.startsWith("win")) {
      chmodSync(dest, 0o755)
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

async function ensureBundledNode(triple) {
  const dest = bundledNodeExePath(triple)
  if (existsSync(dest)) return
  const ext = triple.startsWith("win") ? "zip" : triple.startsWith("linux") ? "tar.xz" : "tar.gz"
  const name = `node-v${NODE_VERSION}-${triple}`
  const file = `${name}.${ext}`
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${file}`
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
  const triple = effectiveNodeDistTriple()
  console.log(
    `Bundle Node dist triple: ${triple} (host ${process.platform}/${process.arch}; POND_NODE_DIST_TRIPLE=${process.env.POND_NODE_DIST_TRIPLE ?? ""} TARGET=${process.env.TARGET ?? ""})`,
  )
  copyOpenclaw(resolveOpenclawSource())
  await ensureBundledNode(triple)
  const n = bundledNodeExePath(triple)
  if (!existsSync(n)) throw new Error(`Bundled Node not found at ${n}`)
  console.log(`Node runtime ready: ${n} (${statSync(n).size} bytes)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
