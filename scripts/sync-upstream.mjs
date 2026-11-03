#!/usr/bin/env node
// Re-applies the account-file sign-in on top of the newest upstream
// packages/workbuddy, runs the tests, and pushes only when they pass.
//
//   node scripts/sync-upstream.mjs [--dry-run]
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const UPSTREAM = "https://raw.githubusercontent.com/magpie-community/plugins/main/packages/workbuddy"
const NAMES = ["index.mjs", "opencode.mjs", "opencode2.mjs", "package.json"]
const dry = process.argv.includes("--dry-run")
const sha = (s) => createHash("sha256").update(s).digest("hex")
const read = (p) => readFileSync(join(root, p))
const write = (p, s) => writeFileSync(join(root, p), s)
const fail = (msg) => {
  console.error(`sync-upstream: ${msg}`)
  process.exit(1)
}
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" })
const once = (src, needle, what) => {
  const n = src.split(needle).length - 1
  if (n !== 1) fail(`${what}: anchor found ${n} times in upstream index.mjs; update scripts/patch or the anchors`)
  return src.indexOf(needle)
}

if (git("status", "--porcelain").trim()) fail("working tree isn't clean; commit or stash first")

const up = {}
for (const n of NAMES) {
  const res = await fetch(`${UPSTREAM}/${n}`, { signal: AbortSignal.timeout(30000) })
  if (!res.ok) fail(`can't fetch upstream ${n}: HTTP ${res.status}`)
  up[n] = await res.text()
}
const upVersion = JSON.parse(up["package.json"]).version
const hashes = Object.fromEntries(NAMES.map((n) => [n, sha(up[n])]))
const statePath = join(root, "upstream.json")
const was = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null
if (was && was.version === upVersion && NAMES.every((n) => was.files?.[n] === hashes[n])) {
  console.log(`up to date: ${upVersion}`)
  process.exit(0)
}

let index = up["index.mjs"]
if (index.includes("// accountOf reads one account export")) fail("upstream index.mjs already holds the account-file patch")
const importOld = 'import { closeSync, openSync, readFileSync, readSync, statSync } from "node:fs"'
if (index.includes(importOld)) {
  index = index.replace(importOld, 'import { closeSync, openSync, readdirSync, readFileSync, readSync, statSync } from "node:fs"')
} else if (!/import \{[^}]*readdirSync[^}]*\} from "node:fs"/.test(index)) {
  fail("can't find the node:fs import in upstream index.mjs")
}
const helpers = readFileSync(join(root, "scripts/patch/helpers.js.txt"), "utf8")
const method = readFileSync(join(root, "scripts/patch/method.js.txt"), "utf8")
const factory = "function makePlugin(site) {"
once(index, factory, "makePlugin")
index = index.replace(factory, helpers + factory)
const tail = "      ],\n    },\n  }\n  }\n}"
const at = once(index, tail, "methods array tail")
index = index.slice(0, at) + method + index.slice(at)

write("index.mjs", index)
write("opencode.mjs", up["opencode.mjs"])
write("opencode2.mjs", up["opencode2.mjs"])
const pkg = JSON.parse(read("package.json").toString())
pkg.version = upVersion
write("package.json", JSON.stringify(pkg, null, 2) + "\n")

try {
  execFileSync("node", ["--check", "index.mjs"], { cwd: root, stdio: "inherit" })
  execFileSync("node", ["--test", "import.test.mjs"], { cwd: root, stdio: "inherit" })
} catch (e) {
  git("restore", "--", "index.mjs", "opencode.mjs", "opencode2.mjs", "package.json")
  fail(`the synced plugin failed its tests; files restored (exit ${e.status ?? 1})`)
}

if (dry) {
  git("restore", "--", "index.mjs", "opencode.mjs", "opencode2.mjs", "package.json")
  console.log(`dry run: would sync to ${upVersion}`)
  process.exit(0)
}

writeFileSync(statePath, JSON.stringify({ version: upVersion, files: hashes, syncedAt: new Date().toISOString() }, null, 2) + "\n")
git("add", "-A")
git("commit", "-m", `chore: sync upstream workbuddy plugin to ${upVersion}`)
git("push", "origin", "main")
console.log(`synced to ${upVersion}`)
