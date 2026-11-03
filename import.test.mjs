import { test } from "node:test"
import assert from "node:assert/strict"
import { WorkBuddyTokenPlugin } from "./index.mjs"

const account = (n) => ({
  account: { uid: `test-uid-${n}`, nickname: `Test User ${n}` },
  auth: {
    accessToken: `test-access-${n}`,
    refreshToken: `test-refresh-${n}`,
    expiresAt: 1824998868,
    domain: "www.codebuddy.ai",
    realm: "global",
  },
})

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

async function browserMethod(client, magpie = {}) {
  const hooks = await WorkBuddyTokenPlugin({ client, magpie })
  const m = hooks.auth.methods.find((x) => x.label.endsWith("account file (browser)"))
  assert.ok(m, "the browser account-file method is there")
  return { hooks, m }
}

const upload = (url, files) =>
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files }) })

test("declares its own provider, apart from the official plugin", async () => {
  const { hooks } = await browserMethod(mockClient().client, {})
  const cfg = { provider: {} }
  await hooks.config(cfg)
  assert.ok(cfg.provider["workbuddy-token"])
  assert.equal(cfg.provider["workbuddy-token"].name, "WorkBuddy Token")
})

test("serves a picker and imports every chosen file", async () => {
  process.env.WORKBUDDY_IMPORT_PORT = "0"
  process.env.WORKBUDDY_IMPORT_HOST = "127.0.0.1"
  try {
    const { client, saved } = mockClient()
    const { m } = await browserMethod(client, {})
    const r = await m.authorize()
    assert.equal(r.method, "auto")
    assert.match(r.url, /^http:\/\/127\.0\.0\.1:\d+\/import\?t=[0-9a-f]+$/)
    const page = await (await fetch(r.url)).text()
    assert.match(page, /type="file"/)
    assert.equal((await fetch(r.url.replace(/t=.*/, "t=nope"))).status, 404)
    const done = r.callback()
    const res = await upload(r.url, [
      { name: "a.json", text: JSON.stringify(account(1)) },
      { name: "b.json", text: JSON.stringify(account(2)) },
    ])
    assert.equal(res.status, 200)
    assert.match(await res.text(), /Imported 2 accounts/)
    const out = await done
    assert.equal(out.type, "success")
    assert.equal(out.accountId, "Test User 1")
    assert.equal(out.expires, 1824998868 * 1000)
    assert.equal(out.domain, "www.codebuddy.ai")
    assert.equal(saved.length, 2)
    assert.deepEqual(saved.map((s) => s.body.accountId), ["Test User 1", "Test User 2"])
    assert.ok(saved.every((s) => s.path.id.startsWith("workbuddy-token#") && s.body.type === "oauth"))
  } finally {
    delete process.env.WORKBUDDY_IMPORT_PORT
    delete process.env.WORKBUDDY_IMPORT_HOST
  }
})

test("a bad file is skipped and the rest import", async () => {
  process.env.WORKBUDDY_IMPORT_PORT = "0"
  process.env.WORKBUDDY_IMPORT_HOST = "127.0.0.1"
  try {
    const { client, saved, toasts } = mockClient()
    const { m } = await browserMethod(client, {})
    const r = await m.authorize()
    const done = r.callback()
    const res = await upload(r.url, [
      { name: "a.json", text: JSON.stringify(account(1)) },
      { name: "b.json", text: "{ broken" },
    ])
    assert.equal(res.status, 200)
    assert.match(await res.text(), /Imported 1 account, skipped 1/)
    assert.equal((await done).type, "success")
    assert.equal(saved.length, 1)
    assert.match(toasts[0].body.message, /skipped 1/)
  } finally {
    delete process.env.WORKBUDDY_IMPORT_PORT
    delete process.env.WORKBUDDY_IMPORT_HOST
  }
})

test("a file without an access token imports nothing", async () => {
  process.env.WORKBUDDY_IMPORT_PORT = "0"
  process.env.WORKBUDDY_IMPORT_HOST = "127.0.0.1"
  try {
    const { client } = mockClient()
    const { m } = await browserMethod(client, {})
    const r = await m.authorize()
    const done = r.callback()
    const res = await upload(r.url, [{ name: "a.json", text: JSON.stringify({ auth: { refreshToken: "r" } }) }])
    assert.equal(res.status, 400)
    assert.match(await res.text(), /没有导入账号/)
    assert.equal((await done).type, "failed")
  } finally {
    delete process.env.WORKBUDDY_IMPORT_PORT
    delete process.env.WORKBUDDY_IMPORT_HOST
  }
})

test("a second import frees the port held by the first", async () => {
  const port = String(36000 + Math.floor(Math.random() * 1000))
  process.env.WORKBUDDY_IMPORT_PORT = port
  process.env.WORKBUDDY_IMPORT_HOST = "127.0.0.1"
  try {
    const { client, saved } = mockClient()
    const { m } = await browserMethod(client, {})
    const first = await m.authorize()
    assert.match(first.url, new RegExp(`:${port}/import`))
    const firstDone = first.callback()
    const second = await m.authorize()
    assert.match(second.url, new RegExp(`:${port}/import`))
    assert.equal((await fetch(first.url)).status, 404)
    assert.equal((await firstDone).type, "failed")
    const done = second.callback()
    const res = await upload(second.url, [{ name: "a.json", text: JSON.stringify(account(1)) }])
    assert.equal(res.status, 200)
    assert.equal((await done).type, "success")
    assert.equal(saved.length, 1)
  } finally {
    delete process.env.WORKBUDDY_IMPORT_PORT
    delete process.env.WORKBUDDY_IMPORT_HOST
  }
})
