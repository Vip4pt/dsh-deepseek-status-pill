# dsh-deepseek-status-pill

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![dsh](https://img.shields.io/badge/dsh-%3E%3D0.2.1--rc.5-4d6bfe.svg)](#环境要求)
[![platform](https://img.shields.io/badge/platform-Windows%20Desktop-lightgrey.svg)](#环境要求)

**DeepSeek Harness Desktop 顶栏中的 DeepSeek 服务状态指示器。** 在「应用」「编辑」菜单右侧显示一个圆角胶囊，包含一盏指示灯与当前状态；悬停或键盘聚焦时展开详情面板，展示最新故障、影响组件、数据来源与读取错误。

*A DeepSeek service status pill for the DeepSeek Harness Desktop caption: one indicator light and the current state next to the Desktop menus, with a detail panel on hover or keyboard focus.*

![顶栏状态胶囊](assets/screenshot-caption.png)

![状态详情面板](assets/screenshot-panel.png)

## 目录

- [功能](#功能)
- [状态模型](#状态模型)
- [环境要求](#环境要求)
- [安装](#安装)
- [使用](#使用)
- [工作原理](#工作原理)
- [安全](#安全)
- [项目结构](#项目结构)
- [开发](#开发)
- [已知限制](#已知限制)
- [发布](#发布)
- [反馈与贡献](#反馈与贡献)
- [许可证](#许可证)

## 功能

- **状态指示**：DeepSeek 服务正常时为绿色，故障或状态读取失败时为黄色（带呼吸光晕），首次加载为灰色。
- **详情面板**：悬停胶囊或键盘 `Tab` 聚焦即展开，`Esc` 关闭；面板与胶囊之间无空隙，指针移动不会中断。
- **Atom 订阅**：数据来自 DeepSeek 状态服务的公开 Atom 源，不抓取状态页 HTML，不调用私有接口。
- **失败降级**：上游不可达时仍显示上一次成功快照，面板同时给出错误信息与上次成功时间。
- **宿主一致**：只使用 `--dsw-alias-*` 主题令牌，明暗主题跟随宿主；`prefers-reduced-motion` 下关闭光晕。
- **零依赖**：无第三方运行时依赖，不 import 任何 Harness Client 包，也不依赖 React。
- **无配置**：安装即用，无需填写 API Key、地址或轮询间隔。

## 状态模型

| 胶囊状态 | 指示灯 | 胶囊文字 | 判定条件 |
|---|---|---|---|
| 正常 | 绿色 | 服务正常 | Atom 最新条目的 `Status:` 为 `resolved`，或 feed 为空 |
| 故障 | 黄色（呼吸光晕） | 服务异常 | 最新条目仍为 `investigating` / `identified` / `monitoring` / `scheduled` 等未结束状态 |
| 读取失败 | 黄色（呼吸光晕） | 状态获取失败 | Host 拉取或解析失败，或页面无法访问 Host 路由 |
| 首次检查 | 灰色 | 检查中… | 首个快照尚未返回 |

`Status:` 字段缺失时，条目更新时间在 12 小时内按「故障」处理，否则按「正常」处理：宁可短暂偏黄，也不把未结束的故障显示为绿色。

## 环境要求

| 项目 | 要求 |
|---|---|
| 宿主版本 | DeepSeek Harness / DSH `dsh >= 0.2.1-rc.5`（见 `package.json` 的 `engines.dsh`） |
| 操作系统 | Windows Desktop（依赖 Windows 顶栏标记与 Desktop preload 提供的菜单宿主） |
| 网络 | 可访问 `https://status.deepseek.com/feed.atom` |

macOS Desktop 与普通浏览器页面不存在 Windows 顶栏，插件在这些环境下保持静默，不渲染任何元素，也不报错。

## 安装

市场与 npm 入口依赖社区目录收录；目录中尚未检索到该插件时，可使用源码安装或自建索引。

### 插件市场（Desktop）

`插件` 页 → `插件市场`（dshmarket）→ 搜索 `DeepSeek 服务状态` → 安装。

### 插件发现（Discover）

`插件` → `发现` → `索引源` 添加 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`，再搜索同一张卡片安装。

### 命令行

```sh
dsh plugin --profile <profile> add dsh-deepseek-status-pill
```

Desktop 的 profile 由应用自身管理，安装入口是应用内插件页；`dsh plugin` 写入的是目标 profile，不会影响 Desktop。

### 源码安装

```sh
git clone https://github.com/Vip4pt/dsh-deepseek-status-pill.git
```

然后在宿主中用 Plugin Manager 安装该目录：

```json
{ "action": "install_bundle", "target": "<workspace>/dsh-deepseek-status-pill" }
```

社区目录条目模板、示例索引与可选发布 CI 位于 [`distribution/`](distribution)。

## 使用

安装完成后顶栏立即出现状态胶囊，无需额外配置。日常操作：

| 操作 | 结果 |
|---|---|
| 悬停胶囊 | 展开详情面板 |
| 键盘 `Tab` 聚焦胶囊 | 展开详情面板 |
| 指针移出 / 失焦 | 收起详情面板 |
| `Esc` | 立即关闭详情面板 |

详情面板包含：整体状态、最新事件标题、事件状态、事件更新时间、影响组件、事件说明、数据来源与更新时间；读取失败时额外显示错误信息与上次成功时间。

## 工作原理

```
GET https://status.deepseek.com/feed.atom   ← Host 半拉取并解析（Atom）
        │
        ▼
GET /deepseek-status/feed                    ← 同源路由，Host 半缓存 45s
        │
        ▼
顶栏胶囊 + 悬停/聚焦详情面板
```

**Host 半**（[index.js](index.js)）：

- 只读订阅 Atom feed，解析 `<entry>` 的 `title` / `updated` / `id` / `link` / `summary`（HTML 转纯文本），从 summary 提取 `Status:` 与 `Affected components:`，其余文本作为详情。
- 只以最新一条条目判定服务状态：`resolved` 表示已恢复。
- 上游请求 10s 超时、响应体上限 512 KiB；45s 快照缓存与 single-flight 合并并发请求；失败时保留上次成功快照，响应携带 `state: "error"`、`error.message` 与 `lastSuccessAt`。
- 通过自定义头与来源校验保护同源路由，见[安全](#安全)。

**浏览器半**（[client.js](client.js)）：

- 每 60s 轮询 Host 路由，失败后 15s 重试；页面不可见时暂停，重新可见时立即刷新。
- 将胶囊定位到 Desktop preload 的 `[data-windows-menu]` 宿主右边缘右侧 10px，顶栏高度取自 `--dsh-windows-titlebar-height`；语言切换、侧栏收起与窗口缩放时重新定位，右侧空间不足时自动隐藏。
- 胶囊与面板均声明 `-webkit-app-region: no-drag`，不阻塞窗口拖动；面板 `top` 与顶栏高度对齐，保证指针从胶囊移入面板时不会触发收起。

## 安全

同源路由由 `dsh-host-webserver` 承载，该服务器本身不带来源策略，校验在插件内完成。请求必须同时满足：

1. 携带自定义头 `x-dsh-deepseek-status: 1`；该头非简单头，跨站请求会触发本服务器不回答的预检。
2. 来自本来源：存在 `Origin` 时其 host 必须等于 `Host`；同源 `GET` 不发送 `Origin`，此时校验 `Sec-Fetch-Site`（`same-origin` / `none` 放行），并由连接层已强制、`SameSite=Strict` 的 `dsh-auth-*` 会话 Cookie 兜底。

不满足条件的请求返回 403，非 `GET`/`HEAD` 返回 405；响应带 `Cache-Control: no-store`。上游请求只访问固定的 Atom 地址，服务器只绑定 `127.0.0.1`。

## 项目结构

```
dsh-deepseek-status-pill/
├─ package.json               dsh.bundle.patch + dsh.client（web / immediately / inject ui-layout）
├─ cordis.patch.yml           insert 一行：id=deepseek-status-pill
├─ index.js                   Host 半：Atom 拉取、解析、缓存与 /deepseek-status/feed 路由
├─ client.js                  浏览器半：顶栏胶囊、指示灯与详情面板
├─ icon.svg                   Plugin Manager 卡片图标
├─ assets/                    商店截图与 180px 商店图标
├─ screenshots.json           商店截图清单（读取本仓库）
├─ locale/{zh,en}.json        插件标题与描述
├─ scripts/check-publish.mjs  发布前占位符与必需文件自检（prepack）
├─ distribution/              目录条目模板、示例索引与可选发布 CI
└─ README.md · CHANGELOG.md · LICENSE · PUBLISHING.md
```

`package.json` 的 `dsh` 字段同时声明 `bundle.patch` 与 `client`：前者使插件可安装，后者把浏览器半注册进 Web 客户端。

## 开发

```sh
git clone https://github.com/Vip4pt/dsh-deepseek-status-pill.git
cd dsh-deepseek-status-pill

node --check index.js && node --check client.js   # 语法检查
npm pack --dry-run                                 # 打包内容；prepack 会校验占位符与必需文件
```

本地生效方式见[源码安装](#源码安装)。修改已安装插件的 `index.js` / `client.js` 后，需要先移除再安装（或重启应用）才能加载新的 Host/Client 模块；仅覆盖文件不会热更新。

版本变更记录见 [CHANGELOG.md](CHANGELOG.md)；发布与目录收录流程见 [PUBLISHING.md](PUBLISHING.md)。

## 已知限制

- 状态胶囊仅适用于 Windows Desktop；macOS Desktop 与浏览器页面不渲染。
- 状态判定完全依据第三方 Atom 源，源本身未签名，也不提供组件级实时可用性。
- 插件市场当前不支持原地升级：新版本会显示可更新，用户需卸载后重新安装。
- 事件时间按浏览器本地时区显示。

## 发布

插件以 DeepSeek Harness bundle 形式发布：`package.json` 声明 `dsh.bundle`，配套 `cordis.patch.yml`。公开仓库、npm 发布与社区目录收录的完整步骤见 [PUBLISHING.md](PUBLISHING.md)。

## 反馈与贡献

问题、建议与功能请求通过 [Issues](https://github.com/Vip4pt/dsh-deepseek-status-pill/issues) 提交。提交代码改动前建议先运行：

```sh
node --check index.js && node --check client.js
npm pack --dry-run
```

## 许可证

[MIT](LICENSE)
