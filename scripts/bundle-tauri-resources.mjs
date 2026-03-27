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
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { pipeline } from "node:stream/promises"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const RES = join(ROOT, "resources")
/** Separate from `resources/` so Tauri WalkDir only scans this tree (no symlink dirs, no mixed junk). */
const OPENCLAW_RUNTIME_ROOT = join(ROOT, "src-tauri", "openclaw-runtime")
const OPENCLAW_DST = join(OPENCLAW_RUNTIME_ROOT, "node_modules", "openclaw")
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
  "aarch64-pc-windows-msvc": "win-arm64",
}

function hostNodeDistTriple() {
  const p = process.platform
  const a = process.arch
  if (p === "darwin" && a === "arm64") return "darwin-arm64"
  if (p === "darwin" && a === "x64") return "darwin-x64"
  if (p === "linux" && a === "x64") return "linux-x64"
  if (p === "linux" && a === "arm64") return "linux-arm64"
  if (p === "win32" && a === "x64") return "win-x64"
  if (p === "win32" && a === "arm64") return "win-arm64"
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

/**
 * Tauri bundles resources with walkdir::WalkDir, which does not descend into symlinked
 * directories. A symlink `openclaw/dist` → pnpm store yields an .app with openclaw.mjs but no dist/.
 */
function assertNoSymlinksUnder(root, label) {
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    let names
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      const p = join(dir, name)
      let st
      try {
        st = lstatSync(p)
      } catch {
        continue
      }
      if (st.isSymbolicLink()) {
        throw new Error(
          `${label}: symlink at ${p} — Tauri skips symlinked dirs when collecting resources; rebuild with cp -RL (Unix) or cpSync dereference (Windows).`,
        )
      }
      if (st.isDirectory()) stack.push(p)
    }
  }
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

/**
 * Full flat `pnpm install` is slow; skip when the bundled tree already matches root lockfile openclaw version.
 * Set POND_FORCE_BUNDLE=1 to always rebuild (e.g. after manual edits under openclaw-runtime).
 */
function openclawFlatBundleIsCurrent(srcMod) {
  if (process.env.POND_FORCE_BUNDLE === "1" || process.env.POND_FORCE_BUNDLE === "true") {
    return false
  }
  const dst = OPENCLAW_DST
  const srcPkg = join(srcMod, "package.json")
  const dstPkg = join(dst, "package.json")
  if (!existsSync(dstPkg) || !existsSync(srcPkg)) return false
  let srcVer
  let dstVer
  try {
    srcVer = JSON.parse(readFileSync(srcPkg, "utf8")).version
    dstVer = JSON.parse(readFileSync(dstPkg, "utf8")).version
  } catch {
    return false
  }
  if (srcVer !== dstVer) return false
  if (!existsSync(join(dst, "openclaw.mjs"))) return false
  const entryJs = join(dst, "dist", "entry.js")
  const entryMjs = join(dst, "dist", "entry.mjs")
  if (!existsSync(entryJs) && !existsSync(entryMjs)) return false
  return true
}

function copyOpenclaw(src) {
  const dst = OPENCLAW_DST
  const legacy = join(RES, "openclaw")
  if (existsSync(legacy)) {
    rmSync(legacy, { recursive: true, force: true })
  }
  if (existsSync(OPENCLAW_RUNTIME_ROOT)) {
    try {
      rmSync(OPENCLAW_RUNTIME_ROOT, { recursive: true, force: true, maxRetries: 3 })
    } catch (err) {
      console.warn(`Failed to rm on first attempt, retrying...`)
      // Retry with higher maxRetries instead of using find (Windows incompatible)
      rmSync(OPENCLAW_RUNTIME_ROOT, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
    }
  }
  // Install openclaw in a clean environment with flat node_modules (no pnpm symlinks).
  console.log(`Installing openclaw with pnpm (flat mode for bundling)...`)
  const dstNodeModules = join(OPENCLAW_RUNTIME_ROOT, "node_modules")
  const tmpInstall = join(OPENCLAW_RUNTIME_ROOT, ".tmp-install")
  if (existsSync(tmpInstall)) {
    rmSync(tmpInstall, { recursive: true, force: true })
  }
  mkdirSync(tmpInstall, { recursive: true })
  // Create minimal package.json for openclaw
  const openclawPkgPath = join(ROOT, "node_modules/openclaw/package.json")
  const openclawVersion = JSON.parse(readFileSync(openclawPkgPath, "utf8")).version
  const tmpPkgJson = join(tmpInstall, "package.json")
  writeFileSync(tmpPkgJson, JSON.stringify({
    "name": "openclaw-runtime",
    "version": "1.0.0",
    "dependencies": {
      "openclaw": openclawVersion
    }
  }, null, 2))
  // Install with npm (naturally flat, no symlinks)
  // On Windows, npm might not be in PATH, so we try to locate it
  let npmCmd = "npm"
  if (process.platform === "win32") {
    try {
      // Try to find npm.cmd in the same directory as node.exe
      const nodeDir = dirname(process.execPath)
      const npmCmdPath = join(nodeDir, "npm.cmd")
      if (existsSync(npmCmdPath)) {
        npmCmd = npmCmdPath
        console.log(`  Found npm at: ${npmCmd}`)
      }
    } catch (err) {
      // Fallback to "npm" and hope it's in PATH
    }
  }
  
  console.log(`  Running npm install --omit=dev...`)
  execFileSync(npmCmd, ["install", "--omit=dev", "--legacy-peer-deps"], {
    cwd: tmpInstall,
    stdio: "inherit",
    shell: process.platform === "win32", // Use shell on Windows to handle .cmd files
  })
  
  // Remove all .bin directories (contain symlinks and are not needed at runtime)
  const tmpNodeModules = join(tmpInstall, "node_modules")
  console.log(`  Removing .bin directories...`)
  // Use Node.js fs instead of find command (Windows incompatible)
  function removeBinDirs(dir) {
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name === ".bin") {
            rmSync(fullPath, { recursive: true, force: true })
          } else {
            removeBinDirs(fullPath)
          }
        }
      }
    } catch (err) {
      // Ignore errors
    }
  }
  removeBinDirs(tmpNodeModules)
  
  // Move node_modules directly
  if (existsSync(dstNodeModules)) {
    rmSync(dstNodeModules, { recursive: true, force: true })
  }
  renameSync(tmpNodeModules, dstNodeModules)
  
  rmSync(tmpInstall, { recursive: true, force: true })
  console.log(`  Installed openclaw with flat node_modules (symlinks dereferenced).`)
  if (!existsSync(dst)) {
    throw new Error(`openclaw not found at ${dst}`)
  }
  if (!existsSync(join(dst, "openclaw.mjs"))) {
    throw new Error(`Bundled openclaw missing openclaw.mjs under ${dst}`)
  }
  const entryJs = join(dst, "dist", "entry.js")
  const entryMjs = join(dst, "dist", "entry.mjs")
  if (!existsSync(entryJs) && !existsSync(entryMjs)) {
    throw new Error(
      `Bundled openclaw missing dist/entry.js (and entry.mjs) under ${dst}. ` +
        "Reinstall openclaw (pnpm install) or fix node_modules before tauri build.",
    )
  }
  // Fix package.json exports with null values (Node.js ESM loader crash).
  console.log(`Fixing null exports in package.json files...`)
  let fixed = 0
  const fixExports = (pkgPath) => {
    try {
      const pkgJson = JSON.parse(readFileSync(pkgPath, "utf8"))
      if (pkgJson.exports && typeof pkgJson.exports === "object") {
        let changed = false
        const removeNulls = (obj) => {
          for (const key in obj) {
            if (obj[key] === null) {
              delete obj[key]
              changed = true
            } else if (typeof obj[key] === "object" && obj[key] !== null) {
              removeNulls(obj[key])
            }
          }
        }
        removeNulls(pkgJson.exports)
        if (changed) {
          writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2))
          fixed++
        }
      }
    } catch {}
  }
  const walkAndFix = (dir, depth = 0) => {
    if (depth > 10) return
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      let st
      try {
        st = lstatSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        const pkgPath = join(p, "package.json")
        if (existsSync(pkgPath)) fixExports(pkgPath)
        walkAndFix(p, depth + 1)
      }
    }
  }
  walkAndFix(dstNodeModules)
  console.log(`  Fixed ${fixed} package.json files with null exports.`)
  
  // Verify no symlinks remain (Tauri walkdir skips symlinked directories)
  try {
    assertNoSymlinksUnder(dstNodeModules, "openclaw-runtime/node_modules")
    console.log(`  ✓ Verified no symlinks in bundled node_modules.`)
  } catch (err) {
    throw new Error(`Symlink verification failed: ${err.message}`)
  }
  
  console.log(`Copied OpenClaw package to ${dst}`)
}

async function main() {
  const triple = effectiveNodeDistTriple()
  console.log(
    `Bundle Node dist triple: ${triple} (host ${process.platform}/${process.arch}; POND_NODE_DIST_TRIPLE=${process.env.POND_NODE_DIST_TRIPLE ?? ""} TARGET=${process.env.TARGET ?? ""})`,
  )
  const srcMod = resolveOpenclawSource()
  if (openclawFlatBundleIsCurrent(srcMod)) {
    console.log(
      `OpenClaw flat bundle already matches root dependency version; skipping pnpm install (set POND_FORCE_BUNDLE=1 to rebuild).`,
    )
  } else {
    copyOpenclaw(srcMod)
  }
  await ensureBundledNode(triple)
  const n = bundledNodeExePath(triple)
  if (!existsSync(n)) throw new Error(`Bundled Node not found at ${n}`)
  console.log(`Node runtime ready: ${n} (${statSync(n).size} bytes)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
