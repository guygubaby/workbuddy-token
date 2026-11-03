# workbuddy-token

A WorkBuddy (CodeBuddy) account-file sign-in for magpie, on provider ids of
its own: **`workbuddy-token`** (the international build, www.workbuddy.ai) and
**`workbuddy-token-cn`** (the China build, copilot.tencent.com). It can be
installed beside the official
[`@magpie-community/opencode-workbuddy-auth`](https://github.com/magpie-community/plugins/tree/main/packages/workbuddy)
without either plugin replacing the other.

One sign-in method on each: **account file (browser)** — a page opens with the
browser's own multi-select file picker. Choose one or more account JSON files,
click 导入, and each file becomes its own account. An account is routed to the
right build by its `realm` (`cn` → WorkBuddy Token CN, `global` → WorkBuddy
Token), whichever provider's sign-in was clicked.

## Install into magpie

From a terminal:

```sh
magpie plugin add /path/to/workbuddy-token
```

Or in the app: **Plugins → Add a plugin** and pick this folder.

## Sign in

1. Open **Providers → WorkBuddy Token** (or **WorkBuddy Token CN**).
2. Choose **Sign in**, then **account file (browser)**.
3. In the page that opens, select one or more `.json` account files and click
   **导入**.
4. The page shows how many accounts were imported; close it and return to
   magpie.

The page is served by the plugin for that one sign-in only: a random token in
the URL, closed after the upload or after five minutes. Starting another
import closes the previous page and frees the port.

## Account file

```json
{
  "account": {
    "uid": "00000000-0000-0000-0000-000000000000",
    "nickname": "Example User"
  },
  "auth": {
    "accessToken": "…",
    "refreshToken": "…",
    "expiresAt": 1824998868,
    "domain": "www.codebuddy.ai",
    "realm": "global"
  }
}
```

A flat token object also works (`accessToken`/`refreshToken`/`expiresAt`, or
`access_token`/`refresh_token`/`expires_at`). `expiresAt` may be seconds or
milliseconds. A file that can't be read is skipped and counted; the rest
import. An account is named by `account.nickname`, and importing the same
account again updates it instead of adding it twice.

The sign-in is stored as an OAuth account: the access token is used as it is
and renewed with the refresh token. `realm: "cn"` files go to WorkBuddy Token
CN; `realm: "global"` files (`www.codebuddy.ai`) go to WorkBuddy Token.

## Docker

The plugin's page is served on port 3431. Publish it and name the address the
browser reaches it at:

```yaml
ports:
  - "3431:3431"
environment:
  WORKBUDDY_IMPORT_HOST: 203.0.113.10   # the host's public address
```

`WORKBUDDY_IMPORT_PORT` changes the port (3431). The page is plain HTTP, as
the rest of the browser UI is; on a public host, prefer HTTPS in front of it.

## Security

An account file holds a long-lived refresh token. Keep exports out of the
repository, chat and issue trackers; magpie keeps them in its own
`plugin-auth.json`. The import page carries a one-time token and exists only
for the sign-in that opened it.

## Updating from upstream

The plugin's request, model, usage and check-in logic is the official
package's. `scripts/sync-upstream.mjs` fetches the newest upstream files,
re-applies this fork's patch (`scripts/patch/`), renames the provider and
keeps only the account-file sign-in, then runs the tests. It commits and
pushes only when they pass.

```sh
node scripts/sync-upstream.mjs
```

## 中文说明

这是 WorkBuddy（CodeBuddy）账号文件导入插件，使用独立的 provider id：
`workbuddy-token`（国际版）和 `workbuddy-token-cn`（国内版），可以和官方
WorkBuddy 插件同时安装，不会互相冲突。

- 只保留一个登录方式：**account file (browser)**。点开后网页里直接多选
  JSON 账号文件，点击“导入”即可，不需要输入路径。
- 导入时会按文件里的 `realm` 自动分流：`cn` 进入 WorkBuddy Token CN，
  `global` 进入 WorkBuddy Token；从哪个 provider 点登录都可以。
- 每个文件导入为一个独立账号，按 `account.nickname` 命名；重复导入会更新
  原账号，不会重复添加。
- 打开过但没完成的导入页，会在下一次导入开始时自动关闭并释放 3431 端口。
- Docker 里使用：映射 `3431:3431`，并设置
  `WORKBUDDY_IMPORT_HOST` 为浏览器访问的服务器地址。
- 账号文件含长期 refresh token，不要提交到仓库或发给别人。

## License

MIT, as the upstream package. See `LICENSE`.
