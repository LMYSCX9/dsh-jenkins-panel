# dsh-jenkins

DSH（DeepSeek Harness）的 Jenkins 插件：左侧栏入口 + 面板，用来连接 Jenkins、查询任务、触发构建、查看队列；同样的能力同时以 6 个 Agent 工具暴露给模型。支持同时配置多个 Jenkins 服务器。

零运行时依赖（只用 Node 内置模块），纯 ESM，无构建步骤。

## 能力

面板（左侧栏 → 齿轮图标，排在 Plugins / Schedules 之后）：

- **多连接**：可配置多个 Jenkins 服务器（例如「公司机房」「测试环境」），面板顶部下拉切换、可新增与删除；新建的连接自动成为当前连接。面板和所有工具默认按「当前连接」工作，也可以按名字或 id 指定某一个连接。
- **连接设置**：名称、地址、用户名、API Token、是否信任自签名证书、任务过滤；「保存并连接」会保存 → 测通 → 拉列表，失败直接回显原因。
- **任务列表**：递归展开文件夹，显示为 `folder/job`；状态点、上次构建号、结果、相对时间、耗时；支持搜索。
- **触发构建**：每行「构建」按钮，自动获取 CSRF crumb，返回 Jenkins 队列地址；提交后 4 秒自动刷新。参数化任务**按各参数的默认值构建**——先读 `parameterDefinitions`，只提交有默认值的参数，不需要填表。
- **构建历史**：每行「历史」展开最近 8 次构建。
- **构建队列**：排队项与等待原因。
- **会话页快捷选择器**：在 Hero 界面「工作区 / 模式」那一行的右侧有一个「Jenkins 任务」胶囊，点开即任务列表（带搜索），选中后需再按 ▶ 才触发构建，避免误点。

Agent 工具（与面板共用同一套 Host 代码）：

| 工具 | 作用 |
|---|---|
| `jenkins_connections` | 列出所有连接（id / 名称 / 地址 / 是否已存 Token）与当前连接 |
| `jenkins_configure` | 新增或更新一个连接并立即测通；传 `connection` 改已有的，只传 `name` 则新建 |
| `jenkins_list_jobs` | 列出任务（含文件夹内任务）与上次构建 |
| `jenkins_build` | 触发构建；参数化任务按声明默认值构建，可用 `params` 覆盖 |
| `jenkins_builds` | 查看某任务最近若干次构建 |
| `jenkins_queue` | 查看构建队列 |

除 `jenkins_connections` / `jenkins_configure` 外，其余工具都接受可选的 `connection` 参数（连接 id 或名称），省略时使用当前连接。

Host 侧通过前缀路由 `/dsh-jenkins` 提供同样的操作，面板与工具调用的是同一批函数，不存在两份实现。

## 更新

面板标题下方有 `v1.4.2 · 检查更新` 一行，插件可以自己检查并安装新版本，不依赖「插件管理」页面：

- **npm 安装**：会向已配置的 registry 查询本插件的最新版本；发现更新时出现「更新到 x.y.z」，点一下就由 DSH 插件管理器完成安装（与 `install_plugin` 同一条 pnpm 路径），并提示是否需要重启 DSH；
- **本地目录安装**：不自动更新，会直接说明原因（改源码后重新安装即可）；
- **git 安装**：把远端默认分支的尖端当作「最新版本」（先试 main，再试 master），点更新就装 git+<远端>#<分支>；代价是从「固定 commit」变成「跟随分支」。

任何安装都只在**你点击时**发生，不做静默升级。

## 安装

任选一种，目标都是交给 DSH 的 Plugin Manager（`install_bundle`）：

```text
# npm
dsh-jenkins-panel@1.4.2

# git（推荐钉 commit，不要用分支名）
git+https://github.com/LMYSCX9/dsh-jenkins-panel.git#<commit-sha>

# 本地目录
<本地路径>/dsh-plugin-jenkins
```

装完在 DSH Web 左栏出现一个齿轮图标，点开即面板。

## 配置

在面板里新增/编辑连接即可，也可以在 `cordis.patch.yml` 的 `jenkins` 行给初值（面板保存的值优先）。每个连接都有同样的字段：

| 字段 | 说明 |
|---|---|
| `name` | 连接名称，之后用它来指定连接，如「公司机房」 |
| `baseUrl` | Jenkins 根地址，如 `http://ci.example.com:8080` 或 `http://host/jenkins` |
| `username` | Jenkins 账号 |
| `token` | API Token（Jenkins → 用户设置 → API Token） |
| `insecureTls` | 是否跳过 HTTPS 证书校验，**默认 `true`**，使用正规证书时请取消勾选 |
| `jobFilter` | 只显示名称包含此文本的任务，留空为全部 |

保存位置：`~/.dsh/jenkins/settings.json`（权限 `0600`），可用环境变量 `DSH_JENKINS_SETTINGS` 覆盖路径。文件结构是 `{ version: 2, activeId, connections: [...] }`；旧版的单连接文件会在启动时自动迁移成一条连接。凭据不进 `cordis.patch.yml`。

## 安全边界

- Token **只写不读**：任何接口只返回 `hasToken: true/false`，不回显内容，也不进会话上下文。
- `/dsh-jenkins` 路由**只接受本机（loopback）请求**，非本机来源直接 403。
- 请求特性：`insecureTls` 打开时接受自签名证书，适用于内网 Jenkins；关闭时按 Node 默认策略校验证书。

## 兼容性

- 在 DSH `0.2.1-rc.5`（Windows，Web GUI）上开发与验证。
- 需要 profile 里挂载了 `webServer` 与 `tools`；面板需要 Client 侧的 `slots` 与 `locale` 服务。
- Node 18+（使用 `node:http` / `node:https` / 内置 `fetch` 之外的 API 均为长期稳定接口）。

## 开发

```
.
├─ package.json         清单：exports / dsh.bundle / dsh.client
├─ cordis.patch.yml     插入 jenkins 行
├─ index.js             Host 半：Jenkins 客户端 + /dsh-jenkins 路由 + 5 个工具
├─ client.js            Client 半：侧栏图标 + 主面板（React，无 JSX 构建）
├─ icon.svg             插件图标
└─ locale/{en,zh}.json  meta.title / meta.description
```

- 语法自检：`node --check index.js && node --check client.js`
- 打包内容自检：`npm pack --dry-run`（`files` 白名单，只应包含上表 7 个文件）

注意：包名同时是 Client 模块 id，改名必须同步改 **package.json 的 `name`**、**client.js 里 `window.__ModuleLoader__.load({ id })`**、**cordis.patch.yml 的 `name`** 三处，少一处就起不来。

## English

A Jenkins plugin for DeepSeek Harness: a left-sidebar panel plus five agent tools (`jenkins_configure`, `jenkins_list_jobs`, `jenkins_build`, `jenkins_builds`, `jenkins_queue`).

Connect a Jenkins server, browse jobs (folders flattened), inspect build history and the build queue, and trigger builds — with CSRF crumb handling and a returned queue URL. Both the panel and the tools call the same Host functions behind a loopback-only `/dsh-jenkins` route.

No runtime dependencies, no build step. Credentials live in `~/.dsh/jenkins/settings.json` (mode `0600`, override with `DSH_JENKINS_SETTINGS`) and the token is never echoed back. TLS verification is skipped by default for self-signed intranet servers; untick “trust self-signed certificates” to enable it.

Verified on DSH 0.2.1-rc.5.

## License

MIT
