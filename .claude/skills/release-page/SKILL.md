---
name: release-page
description: Claude 娘社区版 GitHub Release 发布页的正式格式和发布步骤。写 CHANGELOG 版本章节（它就是发布页正文）、准备发布、触发发布工作流、检查发布页时使用。版本号先按 release-version skill 定好；提交和推送按 commit-hygiene skill 做。
---

# Release 发布页：格式与步骤

一个程序版本只对应一个 `vX.Y.Z` 标签和一个 Release。发布页由 `.github/workflows/release.yml` 自动生成，不在网页上手写：

| 发布页部分 | 来源 | 规则 |
|---|---|---|
| 标题 | 工作流固定生成 | `Claude 娘社区版 vX.Y.Z · Windows`；测试版为 `Claude 娘社区版 vX.Y.Z-beta.N · Windows（测试版）` |
| 正文 | CHANGELOG 里 `## X.Y.Z — YYYY-MM-DD` 这一节的内容（不含标题行） | 按下面的格式写 |
| 附件 | 工作流构建 | 恰好 3 个：`claude-niang-vX.Y.Z-windows.zip`、`claude-niang-vX.Y.Z-windows.zip.sha256`、`claude-niang-usage.mcpb` |
| 标签 | 工作流创建 | 指向触发时 `main` 的提交，不提前手动创建 |

所以“写发布页”就是写 CHANGELOG 的版本章节。

**测试版**（`vX.Y.Z-beta.N`，规则见 `release-version` skill）走同一个工作流，区别只有：发布为“预发布”、不会成为 Latest、发布前不检查 README（README 继续描述最新正式版）。正文格式相同，概括句开头写明「测试版」，并在「已知问题」里写出还没测完的地方。只有在 Claude娘右键「关于 Claude娘」里把更新范围设成「测试版」的用户会收到提醒。

## 正文格式

```markdown
## X.Y.Z — YYYY-MM-DD

一句话概括这一版最重要的变化（用户视角，不超过 60 字）。

**下载**：在 [vX.Y.Z 发布页](https://github.com/<用户名>/Claude-Niang-Community/releases/tag/vX.Y.Z) 的 Assets 中选择 `claude-niang-vX.Y.Z-windows.zip`（Windows 完整包，含挂件和可选的 Claude 桌面扩展）。`.sha256` 用于核对下载是否完整；`claude-niang-usage.mcpb` 只用于单独更新桌面扩展。

### 新功能
- ……

### 改进
- ……

### 修复
- ……

### 其他
- 文档、测试、构建和仓库维护方面的改动。

### 更新方法
先运行旧目录的「停用Claude娘.cmd」，把新版本覆盖到同一个文件夹（保留 `claude-niang\installation.json`），再运行「安装Claude娘.cmd」。装过桌面扩展的，再双击一次新的 `.mcpb`。

### 已知问题
- ……
```

- 标题行：`## ` + 版本号 + ` — `（前后各一个空格的长破折号）+ 发布日期 `YYYY-MM-DD`。同一个版本号在 CHANGELOG 里只能出现一次。
- 概括句和「下载」段每版都要有。
- 「新功能 / 改进 / 修复 / 其他」按这个顺序，**没有内容的小节整个省略**。修复版（Z 递增）通常只有「修复」，有时加「其他」。
- 「更新方法」每版都要有。没有特殊步骤时就写上面这段常规步骤；需要重新登录、重新装扩展、旧设置失效、数据迁移等额外操作时，写在常规步骤前面并加粗。
- 「已知问题」只在确实有时才写。
- 小节标题只用三级标题 `###`。不要在正文里用二级标题 `## `，工作流靠它判断章节结束。

## 每一条怎么写

- 中文，用户视角：写用户会看到、会感觉到的变化，不写函数名和内部实现。用户需要操作某个文件时才写文件名。
- 每条只写一件事，以动词开头：新增、支持、改为、不再、修复、移除。一到两句话写完。
- 需要说明原因或对比时，用“以前……，现在……”。
- 行为变化必须写明，并在「更新方法」里写出用户要做的事。
- 只写已经验证过的事实；没在实机上验证过的环境写“适配目标”，不写“已支持”。
- 不写个人信息、本机路径、真实组织名和账号数据；截图和示例数据注明“示例”。
- 一般 3 到 10 条。条目太多时合并同类项，细节放到 README。
- 不在正文里 @ 别人（会给对方发通知），确实要致谢时先问用户。

## 发布步骤

1. **定版本号**：按 `release-version` skill。
2. **写正文**：把 CHANGELOG 的「未发布」改成 `## X.Y.Z — YYYY-MM-DD`，按上面的格式整理。
3. **同步版本号**：`claude-niang/package.json`、`claude-niang/extension/manifest.json`、README 的当前版本、徽章、“本版……”说明和所有下载链接（都换成同一个 `vX.Y.Z`，不用 `latest/download`）。
4. **本地检查**，全部通过才继续：

   ```powershell
   node tools/release.mjs --source . --check-release --tag vX.Y.Z
   node tools/commit-hygiene.mjs --all
   cd claude-niang; npm test; npm run test:windows; cd ..
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build-release.ps1
   ```

   解压 `dist` 里的 ZIP 检查：程序、默认资源、WebView2 组件和许可、桌面扩展、README 引用的文档和图片都在；`installation.json`、`install-log.txt`、日志、`state`、`webview`、缓存和个人资源都不在。
5. **提交并推送**：按 `commit-hygiene` skill 提交，合并到 `main`，推送。
6. **请用户确认**：把版本号和发布页正文全文给用户看，**得到明确同意后**才触发发布：

   ```powershell
   gh workflow run release.yml --repo <用户名>/Claude-Niang-Community --ref main -f release_tag=vX.Y.Z
   ```

7. **等待完成**：`gh run list --repo <用户名>/Claude-Niang-Community --workflow release.yml --limit 1` 找到这次运行，用 `gh run watch <运行编号> --repo <用户名>/Claude-Niang-Community` 等它结束。失败时看日志（`gh run view <运行编号> --log-failed`），按 CONTRIBUTING 的「发布正式版本」处理，通常是在原运行上 Re-run。
8. **核对发布页**：

   ```powershell
   gh release view vX.Y.Z --repo <用户名>/Claude-Niang-Community --json name,tagName,isDraft,isLatest,assets,body,url
   ```

   标题正确；正文和 CHANGELOG 一致；不是草稿；恰好 3 个附件，文件名正确；新版本比之前的都高时标为 Latest。
9. 把发布页链接告诉用户。

## 不要做

- 不在网页上手动建 Release、手动上传或替换附件、手动编辑工作流的草稿。
- 不提前创建标签，不移动、删除已公开的标签，不用同一个版本号再发一次。
- 不在 CHANGELOG 和 README 里留下与本版不一致的版本号或下载链接。
