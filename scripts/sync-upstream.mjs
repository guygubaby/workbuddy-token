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
const API = "https://api.github.com/repos/magpie-community/plugins/contents/packages/workbuddy"
const dry = process.argv.includes("--dry-run")
const repatch = process.argv.includes("--repatch")
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

// get fetches one upstream file, retrying a dropped connection: the sync
// runs unattended, and this network drops raw.githubusercontent now and then.
const headers = { "user-agent": "workbuddy-token-sync", accept: "application/vnd.github+json" }
// GitHub Actions hands over GITHUB_TOKEN; using it keeps the API listing off
// the shared runner IP's unauthenticated rate limit.
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`
async function get(url, what) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(30000),
      })
      if (res.ok) return await res.text()
      if (res.status < 500 || i >= 2) fail(`can't fetch ${what}: HTTP ${res.status}`)
    } catch (e) {
      if (i >= 2) fail(`can't fetch ${what}: ${e?.message ?? e}`)
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)))
  }
}

// every runtime file the upstream package ships, not a fixed list: a new
// entry or data file is picked up by itself. README is ours, tests aren't
// runtime files.
const listing = JSON.parse(await get(API, "the upstream package listing"))
if (!Array.isArray(listing)) fail("the upstream package listing isn't a directory")
const NAMES = listing
  .filter((x) => x.type === "file")
  .filter((x) => x.name === "package.json" || (x.name.endsWith(".mjs") && !x.name.endsWith(".test.mjs")))
  .map((x) => x.name)
  .sort()
if (!NAMES.includes("index.mjs") || !NAMES.includes("package.json")) fail("the upstream package has no index.mjs or package.json")

const up = {}
for (const n of NAMES) up[n] = await get(`${UPSTREAM}/${n}`, n)
const upVersion = JSON.parse(up["package.json"]).version
const hashes = Object.fromEntries(NAMES.map((n) => [n, sha(up[n])]))
const statePath = join(root, "upstream.json")
const was = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : null
if (!repatch && was && was.version === upVersion && NAMES.every((n) => was.files?.[n] === hashes[n])) {
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

// only the browser import stays: the whole methods array upstream ships
// (browser sign-in, desktop, API key) becomes this fork's one method.
const mstart = index.indexOf("      methods: [")
if (mstart < 0) fail("methods array: not found in upstream index.mjs")
const close = index.indexOf("\n      ],", mstart)
if (close < 0) fail("methods array: tail not found in upstream index.mjs")
index = index.slice(0, mstart) + "      methods: [\n" + method + index.slice(close + 1)

// a provider id of its own, so the official plugin can be installed beside
// this one instead of conflicting with it
const siteAnchor = '  "workbuddy-ai": {\n    id: "workbuddy-ai",\n    name: "WorkBuddy AI",'
if (index.split(siteAnchor).length - 1 !== 1) fail("workbuddy-ai site: anchor not found in upstream index.mjs")
index = index.replace(siteAnchor, '  "workbuddy-ai": {\n    id: "workbuddy-token",\n    name: "WorkBuddy Token",')

// the China build too, on an id of its own: a realm "cn" account has to go
// to copilot.tencent.com, not www.workbuddy.ai
const cnAnchor = '  workbuddy: {\n    id: "workbuddy",\n    name: "WorkBuddy",'
if (index.split(cnAnchor).length - 1 !== 1) fail("workbuddy site: anchor not found in upstream index.mjs")
index = index.replace(cnAnchor, '  workbuddy: {\n    id: "workbuddy-token-cn",\n    name: "WorkBuddy Token CN",')

// two plugins, under this fork's own names
const expAnchor = 'export const WorkBuddyAuthPlugin = makePlugin(SITES.workbuddy)\nexport const WorkBuddyAIAuthPlugin = makePlugin(SITES["workbuddy-ai"])'
if (index.split(expAnchor).length - 1 !== 1) fail("plugin exports: anchor not found in upstream index.mjs")
index = index.replace(expAnchor, 'export const WorkBuddyTokenCNPlugin = makePlugin(SITES.workbuddy)\nexport const WorkBuddyTokenPlugin = makePlugin(SITES["workbuddy-ai"])')

write("index.mjs", index)
write("opencode.mjs", '// The package\'s two plugins, as magpie\'s host loads them: their own\n// provider ids, so the official WorkBuddy plugin can be installed beside\n// them.\nexport { WorkBuddyTokenCNPlugin, WorkBuddyTokenPlugin } from "./index.mjs"\n')
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
