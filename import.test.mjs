import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { WorkBuddyAIAuthPlugin, WorkBuddyAuthPlugin } from "./index.mjs"

const account = {
  account: { uid: "test-uid-0001", nickname: "Test User" },
  auth: {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: 1824998868,
    domain: "www.codebuddy.ai",
    realm: "global",
  },
}

function mockClient() {
  const saved = []
  const toasts = []
  return {
    saved,
    toasts,
    client: {
      auth: { set: async (o) => saved.push(o) },
      tui: { showToast: async (o) => toasts.push(o) },
    },
  }
}

async function fileMethod(plugin, client, magpie = undefined) {
  const hooks = await plugin({ client, magpie })
  const m = hooks.auth.methods.find((x) => x.label.endsWith("account file"))
  assert.ok(m, "the account-file method is there")
  return m
}

test("imports an account file by path", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-token-"))
  const file = join(dir, "c (17).json")
  writeFileSync(file, JSON.stringify(account))
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin)).authorize({ file })
  assert.equal(r.type, "success")
  assert.equal(r.access, "test-access-token")
  assert.equal(r.refresh, "test-refresh-token")
  assert.equal(r.expires, 1824998868 * 1000)
  assert.equal(r.uid, account.account.uid)
  assert.equal(r.accountId, "Test User")
  assert.equal(r.domain, "www.codebuddy.ai")
})

test("imports pasted JSON", async () => {
  const r = await (await fileMethod(WorkBuddyAuthPlugin)).authorize({ file: JSON.stringify(account) })
  assert.equal(r.type, "success")
  assert.equal(r.access, "test-access-token")
})

test("imports a flat snake_case token object", async () => {
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin)).authorize({
    file: JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: 1893456000000, uid: "u1" }),
  })
  assert.equal(r.type, "success")
  assert.equal(r.access, "a")
  assert.equal(r.refresh, "r")
  assert.equal(r.expires, 1893456000000)
  assert.equal(r.accountId, "u1")
})

test("imports every JSON file of a folder as its own account", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-token-"))
  for (const i of [1, 2, 3]) {
    writeFileSync(join(dir, `c (${i}).json`), JSON.stringify({
      account: { uid: `uid-${i}`, nickname: `User ${i}` },
      auth: { accessToken: `access-${i}`, refreshToken: `refresh-${i}`, expiresAt: 1824998868 },
    }))
  }
  writeFileSync(join(dir, "notes.txt"), "not an account")
  const { client, saved, toasts } = mockClient()
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin, client, {})).authorize({ file: dir })
  assert.equal(r.type, "success")
  assert.equal(r.accountId, "User 1")
  assert.equal(saved.length, 3)
  assert.deepEqual(saved.map((s) => s.body.accountId), ["User 1", "User 2", "User 3"])
  assert.ok(saved.every((s) => s.path.id.startsWith("workbuddy-ai#") && s.body.type === "oauth"))
  assert.equal(new Set(saved.map((s) => s.path.id)).size, 3)
  assert.match(toasts[0].body.message, /Imported 3 accounts/)
})

test("one bad file in a folder does not stop the rest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-token-"))
  writeFileSync(join(dir, "a.json"), JSON.stringify(account))
  writeFileSync(join(dir, "b.json"), "{ broken")
  const { client, saved, toasts } = mockClient()
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin, client, {})).authorize({ file: dir })
  assert.equal(r.type, "success")
  assert.equal(saved.length, 1)
  assert.match(toasts[0].body.message, /skipped 1/)
})

test("imports a JSON array", async () => {
  const { client, saved } = mockClient()
  const input = JSON.stringify([
    { auth: { accessToken: "a1", refreshToken: "r1" } },
    { auth: { accessToken: "a2", refreshToken: "r2" } },
  ])
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin, client, {})).authorize({ file: input })
  assert.equal(r.type, "success")
  assert.equal(saved.length, 2)
})

test("fails on a missing access token", async () => {
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin)).authorize({ file: JSON.stringify({ auth: { refreshToken: "r" } }) })
  assert.equal(r.type, "failed")
  assert.match(r.error, /accessToken/)
})

test("fails when nothing imports", async () => {
  const dir = mkdtempSync(join(tmpdir(), "wb-token-"))
  writeFileSync(join(dir, "b.json"), "{ broken")
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin, mockClient().client, {})).authorize({ file: dir })
  assert.equal(r.type, "failed")
  assert.match(r.error, /No account imported/)
})

test("fails on a missing file", async () => {
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin)).authorize({ file: "/nope/absent.json" })
  assert.equal(r.type, "failed")
  assert.match(r.error, /No account imported/)
})

test("fails on text that is neither JSON nor a path", async () => {
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin)).authorize({ file: "not json" })
  assert.equal(r.type, "failed")
  assert.match(r.error, /No account imported/)
})

test("browser import serves a picker and imports what it posts", async () => {
  process.env.WORKBUDDY_IMPORT_PORT = "0"
  process.env.WORKBUDDY_IMPORT_HOST = "127.0.0.1"
  try {
    const { client, saved } = mockClient()
    const hooks = await WorkBuddyAIAuthPlugin({ client, magpie: {} })
    const m = hooks.auth.methods.find((x) => x.label.endsWith("account file (browser)"))
    assert.ok(m, "the browser account-file method is there")
    const r = await m.authorize()
    assert.equal(r.method, "auto")
    assert.match(r.url, /^http:\/\/127\.0\.0\.1:\d+\/import\?t=[0-9a-f]+$/)
    const page = await (await fetch(r.url)).text()
    assert.match(page, /type="file"/)
    assert.equal((await fetch(r.url.replace(/t=.*/, "t=nope"))).status, 404)
    const done = r.callback()
    const res = await fetch(r.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files: [{ name: "a.json", text: JSON.stringify(account) }] }),
    })
    assert.equal(res.status, 200)
    assert.match(await res.text(), /Imported 1 account/)
    const out = await done
    assert.equal(out.type, "success")
    assert.equal(out.accountId, "Test User")
    assert.equal(saved.length, 1)
  } finally {
    delete process.env.WORKBUDDY_IMPORT_PORT
    delete process.env.WORKBUDDY_IMPORT_HOST
  }
})
