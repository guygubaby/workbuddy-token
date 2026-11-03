# workbuddy-token

A fork of
[`@magpie-community/opencode-workbuddy-auth`](https://github.com/magpie-community/plugins/tree/main/packages/workbuddy)
that adds one sign-in method: **WorkBuddy AI account file**.

It imports an account export directly, instead of going through the browser
sign-in, the desktop app's sign-in, or an API key.

## Install into magpie

From a terminal:

```sh
magpie plugin add /path/to/workbuddy-token
```

Or in the app: **Plugins → Add a plugin** and pick this folder.

## Sign in from an account file

1. Open **Providers → WorkBuddy AI** (the international build).
2. Choose **Sign in**, then **WorkBuddy AI account file**.
3. Paste the JSON below, or the path to the file (a path with spaces is fine).

To import many at once, give the path of a folder: every `.json` inside it is
imported as its own account. Several paths also work, one per line or
separated by `;`, as does a JSON array of accounts. A file that can't be read
is skipped (the toast says how many), and importing the same folder again
updates its accounts instead of adding them twice.

If magpie runs in Docker, the path is the one inside the container: copy the
folder into the mounted config volume (for the Docker setup in this repo's
notes, `/root/devops/magpie/config/incoming/` on the host is
`/config/incoming/` in the container).

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
milliseconds.

The sign-in is stored as an OAuth account: the access token is used as it is,
and renewed with the refresh token like a browser sign-in's. The account is
named by `account.nickname`.

CodeBuddy global exports (`www.codebuddy.ai`, `realm: "global"`) belong to
**WorkBuddy AI**. China-build exports belong to **WorkBuddy**.

## What the upstream plugin does

Everything else is unchanged from
[the upstream package](https://github.com/magpie-community/plugins/tree/main/packages/workbuddy):
browser sign-in, desktop sign-in, API keys, model lists, usage, check-in,
routing groups, free-model filtering and the rest.

## Security

An account file holds a long-lived refresh token. Keep exports out of the
repository, chat and issue trackers; magpie keeps them in its own
`plugin-auth.json`.

## Updating from upstream

Replace `index.mjs`, `opencode.mjs` and `opencode2.mjs` with the upstream
files, then re-apply the `parseAccountFile` helper and the
`account file` entries in `auth.methods` (both live in `index.mjs`).

## 中文说明

这是上游 `opencode-workbuddy-auth` 的修改版，只加了一个登录方式：
**WorkBuddy AI account file**。

- 安装：`magpie plugin add ~/i/workbuddy-token`，或在 magpie 的
  Plugins → Add a plugin 里选择这个目录。
- 登录：Providers → WorkBuddy AI → Sign in → **WorkBuddy AI account file**，
  粘贴账号 JSON 内容或文件路径即可。
- 批量导入：填文件夹路径会导入里面所有 `.json`（每个文件一个账号）；
  也可以每行一个路径、用 `;` 分隔多个路径，或粘贴 JSON 数组。无法读取的
  文件会跳过，并在提示里显示数量；重复导入同一个文件夹不会重复添加账号。
- 如果 magpie 跑在 Docker 里，路径要用容器内的路径：把文件夹放到宿主的
  `/root/devops/magpie/config/incoming/`，在容器里就是 `/config/incoming/`。
- 文件里的 `expiresAt` 支持秒或毫秒；domain 为 `www.codebuddy.ai` 的
  global 账号请导入到 WorkBuddy AI，不要导入到国内版 WorkBuddy。
- 账号会以 `account.nickname` 命名，access token 到期后自动用
  refresh token 续期。
- 账号文件含长期 refresh token，不要提交到仓库或发给别人。

## License

MIT, as the upstream package. See `LICENSE`.
