---
name: commit-hygiene
description: 在本仓库执行 git add / commit / push、改写未推送的提交、准备 PR 或发布之前使用。规定提交和推送里不能有临时文件和本机个人信息，说明提交身份、自动检查（Git 钩子和 CI），以及检查拦下时怎么处理。
---

# 提交与推送：不带临时文件和个人信息

这是公开仓库。文件内容、文件名、提交说明、提交者身份一旦推送，就可能被缓存或镜像，删掉也收不回来。所以在**提交之前**就把关。

## 不能进入提交的东西

**临时文件和本机数据**
- 草稿和临时文件：仓库外临时文件夹里的东西、`tmp/`、`temp/`、`*.tmp`、`*.bak`、`*.log`、试验脚本、截图草稿。
- 安装和运行产物：`installation.json`、`install-log.txt`、`claude-desktop-mcp.json`、`state/`、`webview/`、`cache/`、`claude-niang-launcher.exe`。
- 构建产物：`dist/`、`.build-*/`、`node_modules/`，以及发布附件（`.zip`、`.sha256`、`.mcpb`，由发布工作流生成）。
- 本机配置：`.env*`、`.claude/settings.local.json`、记忆文件。`.claude/` 里只提交 `skills/`。

**个人信息**
- 真实姓名、私人邮箱（GitHub noreply 地址除外）、手机号。
- 电脑名、带用户名的路径（`C:\Users\<用户名>\…`、`/c/Users/<用户名>/…`）、仓库在本机的位置（盘符加文件夹）。
- claude.ai 的组织名、组织编号、账号邮箱、Cookie、令牌、API Key。
- 带真实账号数据的截图和日志。测试样本一律用假数据：`example.com` 邮箱、`C:\Users\example`、编造的编号。

文档里要举路径时，用 `%LOCALAPPDATA%`、`%USERPROFILE%`、`<用户名>` 这类占位写法。

## 提交身份

- 本仓库的提交邮箱必须是 GitHub noreply 地址：`<编号>+<用户名>@users.noreply.github.com`（在 GitHub 的 Settings → Emails 里能看到）。只在本仓库设置，不改全局配置：

  ```powershell
  git config user.email "<编号>+<用户名>@users.noreply.github.com"
  ```

- 未推送的提交用了私人邮箱时：先告诉用户，同意后再改写这些提交的作者，然后推送。已经推送的历史不改写。

## 提交步骤

1. `git status --short` 看清改了哪些文件。只用 `git add <具体文件>`，不用 `git add -A` 或 `git add .`。
2. `git diff --cached` 逐个看暂存的内容，确认没有上面列出的东西。
3. 提交时钩子会自动检查（见下文）。也可以先手动运行：`node tools/commit-hygiene.mjs --staged`。
4. 提交说明用中文：第一行概括改动，正文写原因和要点。不写本机路径、临时文件名和个人信息。

## 自动检查

仓库自带 Git 钩子（`.githooks/`）。每个新克隆启用一次：

```powershell
git config core.hooksPath .githooks
```

| 时机 | 命令 | 检查什么 |
|---|---|---|
| 提交前（pre-commit） | `node tools/commit-hygiene.mjs --staged` | 暂存的文件名和内容 |
| 推送前（pre-push） | `node tools/commit-hygiene.mjs --push` | 所有还没推送过的提交：作者和提交者邮箱、提交说明、每个提交里改动的文件 |
| CI 和手动 | `node tools/commit-hygiene.mjs --all` | 所有已跟踪的文件（CI 里只用通用规则） |

通用规则包括：禁止的文件类型和目录、带用户名的本机路径、不是 noreply 的邮箱地址、常见令牌和密钥格式。在本机运行时还会检查：电脑名、仓库所在的本机文件夹路径、当前设置的私人提交邮箱，以及下面的个人规则文件。

**本机个人规则**：在 `.git/info/hygiene-patterns` 里每行写一个要拦截的词，比如真实姓名、私人邮箱、组织名。`#` 开头是注释，`re:` 开头按正则表达式匹配。这个文件在 `.git` 目录里，不会被提交。不要把这些词写进仓库里的任何文件，包括本 skill 和检查脚本。

检查结果只显示被拦下内容的开头几个字符，避免在 CI 日志里再次泄露。

## 检查拦下时

- 删掉或改写对应内容（换成占位写法），重新 `git add`，再提交。
- 已经被跟踪、但不该在仓库里的文件：`git rm --cached <文件>`，再补进 `.gitignore`。
- 确认是误报时：告诉用户是哪个文件哪一行、为什么是误报。用户同意后，在 `tools/commit-hygiene.mjs` 里加一条通用的放行规则（不写个人信息），并在 `claude-niang/tests/commit-hygiene.test.mjs` 补一个例子。
- 不要用 `--no-verify` 绕过检查，除非用户明确同意这一次。

## 推送之前

- `git log --stat --not --remotes` 把所有要推送的提交再看一遍。
- 推送到公开仓库、创建 PR、发布 Release 之前，先告诉用户要推送哪些提交，得到同意后再做。
