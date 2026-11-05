# 发布指南 / Publishing

这份文档说明「让任何人一键装上这个插件」需要的准备。结论先说：**插件本体已经具备可安装形态（`dsh.bundle` + `cordis.patch.yml`，零运行时依赖），剩下的关键动作只有三件——公开仓库、npm 发包、收录进社区目录。**

一键安装的真实链路（已在本机 dsh 0.2.1-rc.5 + dshmarket 1.71.1 上核对过）：

```
作者仓库（GitHub，dsh.bundle）
        │  ① 提交目录条目 data/plugins/<owner>__<repo>.yml
        ▼
awesome-dsh-plugin/awesome-dsh-plugin ── 夜间构建 ──▶ dsh-plugin-catalog（npm + index.json）
        │                                               │
        │  ② 用户在 插件 → 插件市场 / 发现 里搜到卡片     │
        ▼                                               ▼
dshmarket 市场页  ── 一键安装 ──▶ plugin_manager.installBundle（npm 或 GitHub 源）
```

---

## 0. 发布前自检（本机即可全部做完）

```sh
# 语法
node --check index.js && node --check client.js

# 打包内容（prepack 会拦住未替换的 Vip4pt 占位符）
npm pack --dry-run

# 打包后再解包安装一次，确认 tarball 自包含
npm pack                      # 生成 dsh-deepseek-status-pill-1.0.0.tgz
mkdir /tmp/pkgtest && cd /tmp/pkgtest && npm init -y
npm i /path/to/dsh-deepseek-status-pill-1.0.0.tgz
node -e "import('dsh-deepseek-status-pill').then(m => console.log(Object.keys(m)))"
```

清单：

- [ ] `package.json` 的 `repository` / `homepage` / `bugs` / `author` 已替换 `Vip4pt`
- [ ] `LICENSE` 里的 `Vip4pt` 已替换（`prepack` 会检查这两处，未替换直接拒绝打包）
- [ ] `dsh.bundle.patch` 指向 `./cordis.patch.yml`，且该文件存在（市场 CI 会检查）
- [ ] `engines.dsh` 覆盖目标宿主版本（当前 `>=0.2.1-rc.5`；预发布版本必须落在某个带预发布标签的比较符上）
- [ ] `screenshots.json` + `assets/screenshot-*.png`（1–8 张，GitHub 托管的位图）
- [ ] 仓库根部的 `package.json` 与将要发布的 npm 包一致
- [ ] 没有把凭据、内部路径写进仓库或包

---

## 1. 公开仓库（前置条件）

目录收录的硬性要求（见 awesome-dsh-plugin 的 `contributing.md`）：

1. 公开 GitHub 仓库，`package.json` 声明 `dsh.bundle`（只声明 `dsh.client` 不算可安装）；
2. 仓库创建满 **1 天**（CI 自动检查）；
3. 仓库加上 `dsh-plugin` topic；
4. 真实可用的代码，描述必须与代码一致（会被逐条核对）；
5. 一个 PR 最多收录 3 条。

建议仓库结构就是本目录：

```
dsh-deepseek-status-pill/     ← 仓库根 = npm 包根
├─ package.json
├─ cordis.patch.yml
├─ index.js            Host half
├─ client.js           浏览器 half
├─ icon.svg            Plugin Manager 卡片图标
├─ assets/             市场截图 + 商店图标（icon-180.png）
├─ screenshots.json    商店截图清单
├─ locale/{zh,en}.json
├─ README.md
├─ CHANGELOG.md
├─ LICENSE
├─ PUBLISHING.md
└─ distribution/       目录条目与 CI 模板（不打进 npm 包）
```

```sh
git init -b main
git add -A
git commit -m "feat: DeepSeek service status pill for the Desktop caption"
git remote add origin https://github.com/Vip4pt/dsh-deepseek-status-pill.git
git push -u origin main
# 然后在 GitHub 仓库页 Settings/Topics 添加 dsh-plugin
```

---

## 2. 发布 npm（强烈建议，但不是收录前提）

作用：市场按 npm 版本做「已安装 / 有更新」判断、显示下载量，并跳过源码安装的 `allowBuilds` 授权步骤。

```sh
# 注意：本机默认 registry 是 npmmirror，发布必须显式指向 npmjs
npm login --registry https://registry.npmjs.org/
npm publish --access public --registry https://registry.npmjs.org/
```

- `prepack` 会先跑 `scripts/check-publish.mjs`：占位符未替换或缺文件会直接失败，避免把占位信息永久写进 registry。
- 包名 `dsh-deepseek-status-pill` 目前未被占用（2026-11-05 查询 404）；发布前再确认一次：`npm view dsh-deepseek-status-pill --registry https://registry.npmjs.org`。
- 想由 CI 发布并带 provenance，把 `distribution/workflows/npm-publish.yml` 复制到 `.github/workflows/`，配置 `NPM_TOKEN` 后打 tag 即可。
- **`repository` 字段必须指回要收录的那个仓库**，否则市场无法把 npm 包和目录条目关联。

不想发 npm 也可以：把 `npm pack` 生成的 tarball 传到一个 GitHub Release，在目录条目里写可选字段 `tarball:`（见下），商店会优先给 tarball 安装。

---

## 3. 提交目录条目（真正实现「一键装」）

向 [awesome-dsh-plugin/awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 提一个 PR，**只新增一个文件**：

```
data/plugins/Vip4pt__dsh-deepseek-status-pill.yml
```

内容以 `distribution/catalog-entry.yml` 为模板，替换 `Vip4pt`。要点：

- `url` 必须与仓库地址完全一致；`name` 是列表里显示的链接文字（`owner/repo`）；
- `description.en` 必填且必须属实（市场卡片与目录列表用它）；`zh` 可选，不写维护者会补；
- `category` 选最贴近实际功能的分类，本插件建议 `notify`（可选项：`agi ui usage theme model identity session memory tools wsl browser vision voice docs skill workflow git notify dev security remote market fun`，选不准维护者会改，不会被打回）；
- `icon` 可选，用仓库里 GitHub 托管的位图（本仓库 `assets/icon-180.png`）；
- 截图不要写进这个 yml：商店读插件仓库里的 `screenshots.json`，以后改图推自己的仓库即可，无需再提 PR。

PR 通过 CI 后由维护者合并；合并后目录站与 npm 上的 `dsh-plugin-catalog` 夜间重建。

---

## 4. 用户端「一键安装」的三条路径

| 用户环境 | 路径 | 说明 |
|---|---|---|
| Desktop（本机即如此） | **插件 → 插件市场（dshmarket）**，搜索卡片点安装 | 真·一键；安装会写入 profile 并热加载 |
| 装了官方 Discover | **插件 → 发现 → 索引源** 添加 `https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json`，再搜卡片安装 | 索引源只需加一次 |
| 命令行 / 其他 profile | `dsh plugin --profile <profile> add dsh-deepseek-status-pill` | 安装后按宿主提示重启对应 profile |

**收录前想先自测一键链路**：`distribution/index.example.json` 就是一份合法的 format 1 索引（已用宿主自带的
`@deepseek-ai/dsh-plugin-market-index` 校验器验证通过，单条版本会生成安装参数
`{"spec":"dsh-deepseek-status-pill@1.0.0"}`，与 `plugin_manager.install_bundle` 的 `target` 一致）。
把它放到仓库的 `https://raw.githubusercontent.com/Vip4pt/dsh-deepseek-status-pill/main/distribution/index.json`
（或 GitHub Pages），在 Discover 里把它加为索引源即可先跑通「索引 → 卡片 → 安装」。注意把 `main` 换成
仓库默认分支；npm 发布前该索引用 `source.type: "git"` + 40 位 commit SHA 指向仓库。

Desktop 的 profile 由应用管理：**在 Desktop 里请走应用内的插件页安装**，用 CLI 装到 `profiles/web` 不会出现在 Desktop。

---

## 5. 发布之后的维护约定

- 市场当前**不支持原地升级**：新版本会显示 `update-available`，用户需要卸载后重装（或重启宿主后的重新安装）。发版时在 CHANGELOG 写清变更，必要时在 README 提示。
- 版本号遵循 SemVer；插件依赖的宿主能力变化时同步抬 `engines.dsh`。
- 上游状态源变化（Atom 地址、字段）时优先兼容新字段，失败要让插件进入「状态获取失败」黄灯而不是抛异常——这是本插件已有的降级路径。
- 定期跑一次 `npm pack --dry-run` 与本地安装验证，防止 `files` 漏文件。
