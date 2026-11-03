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

async function fileMethod(plugin) {
  const hooks = await plugin({ client: {}, magpie: {} })
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

test("fails on a missing access token", async () => {
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin)).authorize({ file: JSON.stringify({ auth: { refreshToken: "r" } }) })
  assert.equal(r.type, "failed")
  assert.match(r.error, /accessToken/)
})

test("fails on a missing file", async () => {
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin)).authorize({ file: "/nope/absent.json" })
  assert.equal(r.type, "failed")
  assert.match(r.error, /Can't read/)
})

test("fails on text that is neither JSON nor a path", async () => {
  const r = await (await fileMethod(WorkBuddyAIAuthPlugin)).authorize({ file: "not json" })
  assert.equal(r.type, "failed")
  assert.match(r.error, /Can't read/)
})
