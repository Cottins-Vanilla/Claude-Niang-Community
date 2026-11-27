<div align="center">
  <img src="claude-niang/extension/icon.png" alt="Claude 娘" width="96">
  <h1>Claude 娘 · 社区版</h1>
  <p><strong>把 Claude 额度，放进桌面角色的气泡里。</strong></p>
  <p>点一下看额度与重置时间，打开用量管理看本机 Claude Code 用量；也可以换形象、写语录，让她跟着音乐跳动。</p>
  <p>
    <a href="https://github.com/Cottins-Vanilla/Claude-Niang-Community/releases/tag/v2.0.0"><img src="https://img.shields.io/badge/Release-v2.0.0-D97757" alt="当前版本 2.0.0"></a>
    <a href="https://github.com/Cottins-Vanilla/Claude-Niang-Community/actions/workflows/ci.yml"><img src="https://github.com/Cottins-Vanilla/Claude-Niang-Community/actions/workflows/ci.yml/badge.svg?branch=main" alt="自动检查状态"></a>
    <img src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078D4" alt="面向 Windows 10 / 11">
  </p>
  <p><a href="https://github.com/Cottins-Vanilla/Claude-Niang-Community/releases/download/v2.0.0/claude-niang-v2.0.0-windows.zip"><strong>下载 Windows 完整包</strong></a> · <a href="#下载与安装">安装说明</a> · <a href="https://github.com/Cottins-Vanilla/Claude-Niang-Community/releases/tag/v2.0.0">版本更新</a> · <a href="#常见问题">常见问题</a> · <a href="https://github.com/Cottins-Vanilla/Claude-Niang-Community/issues/new/choose">反馈问题</a></p>
</div>

> [!NOTE]
> **这是社区维护版。** 本仓库 fork 自 [The-Scales-of-Themis/Claude-Niang](https://github.com/The-Scales-of-Themis/Claude-Niang)（原 Gryphus-Triune/Claude-Niang）。原仓库停在 1.3.3，并已在首页注明后续版本在这里发布；社区版继续修复问题、增加功能，并保留原作者和所有贡献者的署名。版本号从 **2.0.0** 起步，和原版 1.x 区分。与原版的关系见[社区版说明](#社区版说明)。

<p align="center">
  <a href="docs/screenshot.png"><img src="docs/screenshot.png" alt="Claude 娘原生界面：角色上方的气泡显示 5 小时、每周剩余额度和重置时间；图中为示例数据" width="378"></a>
</p>
<p align="center"><sub>原生界面预览，图中为示例数据。额度来自最近一次读取；点击图片可查看原图。</sub></p>

**由你决定何时读取。** 额度只在你点击时读取，启动、恢复窗口、登录完成和自动语录都不会查询额度。唯一的例外是「重置后自动读取」：额度到重置时间后自动读一次，可以在右键「额度提醒」里关掉。读取本身不调用模型，无需 API Key；音乐只在本机分析，不保存也不上传。**非 Anthropic 官方产品。**

## 最新版本：社区维护版

| | 本仓库（原版） | 社区维护版 |
|---|---|---|
| 仓库 | The-Scales-of-Themis/Claude-Niang（原 Gryphus-Triune/Claude-Niang） | [Cottins-Vanilla/Claude-Niang-Community](https://github.com/Cottins-Vanilla/Claude-Niang-Community) |
| 最新版本 | 1.3.3（2026-10-29），不再更新 | **2.0.0**（2026-11-24），后续版本都在这里发布 |
| 下载 | 下文「下载与安装」（旧版） | [Releases 最新版](https://github.com/Cottins-Vanilla/Claude-Niang-Community/releases/latest) |
| 问题反馈 | 新问题请提交到社区维护版 | [提交反馈](https://github.com/Cottins-Vanilla/Claude-Niang-Community/issues/new/choose) |

**2.0.0 相比 1.3.3 的主要变化**

- **新增「用量管理」窗口**（右键角色 → 账户总览）：
  - 账户总览：每个组织一张额度卡片，本机 Claude Code 今日用量、会话、缓存命中和参考费用，最近 14 天走势。
  - 用量账本：按时间、模型、对话筛选；Token 活动图和全年热力图；模型和对话分布；会话明细可搜索，可导出 CSV / JSON。
  - 参考费用按 Claude API 公开价格估算，订阅不按 Token 计费，仅供参考。只读取本机 Claude Code 会话记录里的 Tokens 数字，不读取对话内容。
- **修复杀毒软件误报**：计划任务正常时不再在「启动」文件夹创建快捷方式，并移除本安装位置留下的旧快捷方式。这个快捷方式会被部分杀毒软件按外形误报为 LNK 木马下载器（如 TrojanDownloader/LNK.Agent）。
- 其余功能和 1.3.3 相同。完整更新记录见社区维护版的 [CHANGELOG](https://github.com/Cottins-Vanilla/Claude-Niang-Community/blob/main/CHANGELOG.md)。

**从 1.3.3 升级到社区维护版**

1. 运行旧安装目录里的「停用Claude娘.cmd」。
2. 从[社区维护版 Releases](https://github.com/Cottins-Vanilla/Claude-Niang-Community/releases/latest) 下载 Windows 完整包，**覆盖到原来的同一个文件夹**，保留 `claude-niang\installation.json`。
3. 运行「安装Claude娘.cmd」。设置和登录保存在 `%LOCALAPPDATA%\ClaudeNiang`，升级后继续使用。
4. 装过 Claude 桌面扩展的，再双击一次新版的 `.mcpb`。

两个版本使用同一个数据目录和同一份开机启动登记，**不要同时安装原版和社区维护版**。

## 可以做什么

| 功能 | 使用方式 |
|---|---|
| 套餐与额度 | 查看套餐、5 小时额度、每周额度、分模型每周额度、额外用量和重置时间；以接口实际提供的窗口为准。 |
| 数据时间与提醒 | 显示上次更新时间；读到新结果后判断低额度和重置提醒。额度到重置时间后自动读一次，不用再手动刷新（可关闭）。 |
| 账户总览与用量账本 | 右键 → 账户总览：各组织额度卡片、本机 Claude Code 用量走势；用量账本可筛选、看活动图和会话明细、导出 CSV / JSON，并按 API 公开价格估算参考费用。**2.0.0 新增。** |
| 形象与语录 | 拖动、缩放角色，导入自己的图片，编辑语录和点击音效。 |
| 音乐律动 | 在本机分析正在播放的声音，跟随节拍跳动；默认形象会戴上墨镜。 |
| Claude 对话扩展 | 询问本机保存的额度，明确说“刷新额度”时发起一次新读取。 |
| 检查更新 | 右键 → 关于 Claude娘：立即检查更新、自动更新开关、更新范围（正式版 / 测试版）。开启自动更新时，每次启动挂件检查一次，有新版本 Claude娘会在气泡里提醒你。 |

Free 或部分组织可能没有额度窗口；挂件无法提供接口没有返回的数据。今日观测统计是本机采样估算，不是完整账单、消息数或 token 数。

## 下载与安装

**当前程序版本：2.0.0** · [版本说明](https://github.com/Cottins-Vanilla/Claude-Niang-Community/releases/tag/v2.0.0) · [完整更新记录](CHANGELOG.md)

本版是社区版的第一个版本：新增「用量管理」窗口（账户总览和用量账本），并修复开机启动快捷方式被杀毒软件误报的问题。首次使用请选择 Windows 完整包；对话扩展为可选项。

先准备好 **Claude 桌面端、Node.js LTS 和 WebView2**。安装器会检查依赖；挂件使用自己的登录窗口，与 Claude 桌面端的登录相互独立。

| 你要做什么 | 选择哪个文件 |
|---|---|
| 首次安装或更新挂件 | **[claude-niang-v2.0.0-windows.zip](https://github.com/Cottins-Vanilla/Claude-Niang-Community/releases/download/v2.0.0/claude-niang-v2.0.0-windows.zip)**，包含挂件和可选桌面扩展。 |
| 已有挂件，只更新 Claude 对话扩展 | [claude-niang-usage.mcpb](https://github.com/Cottins-Vanilla/Claude-Niang-Community/releases/download/v2.0.0/claude-niang-usage.mcpb)，也可在完整包的“Claude桌面扩展”文件夹找到。[扩展安装说明](#在-claude-对话里问额度) |
| 核对下载文件是否完整 | [SHA-256 校验文件](https://github.com/Cottins-Vanilla/Claude-Niang-Community/releases/download/v2.0.0/claude-niang-v2.0.0-windows.zip.sha256)，普通安装无需打开。 |
| 阅读或参与开发 | 仓库源码或发布页的 `Source code`；这些归档不包含构建好的桌面扩展。 |

1. 点击上方 **Windows 完整包** 下载，或从 [2.0.0 发布页](https://github.com/Cottins-Vanilla/Claude-Niang-Community/releases/tag/v2.0.0) 的 Assets 选择同名 ZIP。
2. **完整解压**到以后不会移动的文件夹，例如 `%LOCALAPPDATA%\Programs\Claude娘额度挂件`。不要在压缩包里直接运行。
3. 双击 **安装Claude娘.cmd**，按提示检查依赖并在 Claude 娘自己的登录窗口中登录 claude.ai。安装不需要管理员权限。
4. 打开 Claude 桌面端主窗口，点右下角的角色或 **↻**。气泡出现读取时间和账号提供的额度窗口，就完成了。

已经装了原版 Claude 娘（1.3.3 或更早）时，不用卸载，按[更新](#更新搬家与卸载)的步骤覆盖到原来的文件夹即可。

安装器会登记当前用户的开机自启（计划任务）；只有计划任务不可用时，才改用“启动”文件夹里的快捷方式。安装后移动文件夹，请按下方的“搬家”步骤重新登记。

<details>
<summary>安装前需要准备什么</summary>

| 项目 | 要求与兼容性 |
|---|---|
| 系统 | 面向 Windows 10 / 11，提供 x64 和 ARM64 所需组件。macOS / Linux 不支持。 |
| Claude | 已安装 Claude 桌面端。官网安装版和微软商店版均为适配目标。 |
| Node.js | 当前程序最低接受 20；新安装建议使用 [Node.js 官网仍受支持的 LTS 版](https://nodejs.org/)。安装器会在 PATH 和常见安装位置里查找。 |
| WebView2 | Microsoft Edge WebView2 运行时。缺少时安装器会给出[微软官方下载入口](https://developer.microsoft.com/microsoft-edge/webview2/)。 |
| 账号 | 能登录 claude.ai 的账号。Free 或部分组织可能不提供额度窗口。 |

Windows 10、ARM64、微软商店版 Claude、多屏和混合 DPI 仍需更多实机反馈；上述适配目标不表示每种环境都已验证通过。

</details>

<details>
<summary>下载标记、Windows 提示和登录问题</summary>

可以在解压前右键 ZIP → **属性** → 勾选 **解除锁定** → 确定。安装器也会清除程序文件夹内的下载标记，帮助加载 WebView2 组件。

如果 Windows 显示“Windows 已保护你的电脑”，请先确认文件来自本仓库发布页并核对校验值，再决定是否运行。

用 Google 登录时如果提示浏览器不安全，可以改用 **Continue with email**，按页面提示用邮箱验证码登录。需要人机验证时，请在登录窗口里自己完成。

</details>

**挂件的登录和 Claude 桌面端是分开的。** 两边登录不同账号时，挂件显示的是自己登录的账号；有多个组织时，可以在右键菜单里切换。

## 日常使用

| 操作 | 效果 |
|---|---|
| 点角色 | 展开额度气泡并读取一次。同一组织 15 秒内的重复点击复用刚才的结果，同时发出的多个请求合并为一次读取。气泡展开后再点角色，和点气泡一样切换内容；不想这样可在右键 → 声音与点击里关闭「点角色也切换内容」（默认开启）。 |
| 点气泡 | 下一页 → 语录 → 收起。 |
| 点 ↻ 或右键“刷新额度” | 手动刷新额度。 |
| 右键 → 额度提醒 | 开关低额度提醒、额度重置提醒和「重置后自动读取」。 |
| 右键 → 账户总览 | 打开用量管理窗口，见[下文](#账户总览与用量账本)。 |
| 右键 → 关于 Claude娘 | 查看版本；检查更新（右下角弹出结果卡片，有新版本时可以一键打开发布页）；开关自动更新；选择更新范围。 |
| 右键 → Claude 账号 → 切换组织 | 读取选定组织，切换时先隐藏旧组织的额度。 |
| 鼠标停在气泡上 | 查看组织、时间、金额和完整说明。 |

气泡会标出上次更新时间。断网或接口变化时保留上次成功的数据，并显示本次失败原因；已到重置时间但还没重新读取时，旧数值会标为“上次”。开启「重置后自动读取」（默认开启）时，挂件在重置时间约 1 分钟后自动读一次；电脑睡眠或挂件没开时错过的重置，会在唤醒或下次启动时补读。读取失败只在 3 分钟后再试一次，之后等待手动刷新；限流或连续失败暂停期间不会读取。关闭后，已到重置时间的额度等待手动刷新。退出或重新登录后，前一会话的额度不会作为当前数据返回。

预付余额有独立的读取时间，成功后最多缓存 30 分钟。余额接口失败不影响额度显示：已有余额会保留并标为旧值，同时说明失败原因和下次可手动重试的时间。

连续 3 次读取失败后暂停 30 秒，状态栏会提示剩余等待时间；暂停结束不会自动重试。读取成功、重新登录或切换组织后重新计数。低额度和重置提醒只在读取到新结果后判断，不会为了提醒去后台查询。

“今日观测统计”从本机当天第一次成功读取起，累计观察到的每周额度增量，单位是百分点；统计按组织区分。

<details>
<summary>文件夹里的几个启动入口</summary>

| 文件 | 作用 |
|---|---|
| 安装Claude娘.cmd | 安装，或在原位置重新登记挂件。 |
| 打开Claude娘.cmd | 手动启动挂件；除了补读错过的额度重置，不会因此读取额度。 |
| 登录Claude账号.cmd | 打开挂件自己的登录窗口。 |
| 检测套餐.cmd | 主动读取一次，用于排查套餐和额度。 |
| 停用Claude娘.cmd | 关闭挂件并移除开机自启，保留文件、设置和登录。 |

</details>

## 账户总览与用量账本

右键角色 → **账户总览**，打开「Claude 娘 · 用量管理」窗口。左侧切换两个页面：

**账户总览**

| 区域 | 内容 |
|---|---|
| 顶部数字 | 今日本机用量（Tokens）、今日会话、缓存命中率、今日参考费用。悬停看合计（输入、输出和缓存全部 Tokens）以及各分项。 |
| 账户额度 | 每个组织一张卡片：套餐、5 小时 / 每周 / 分模型额度、重置时间、额外用量、预付余额、读取时间；当前组织的卡片可以「定位窗口」（把 Claude 切到前面）和「刷新」。其他组织显示上次选中时读到的数据。 |
| 本机 Claude Code | 今日和近 7 天的 Tokens、会话、缓存命中、参考费用，近 7 天小柱状图，最近活动时间。 |
| 本机用量走势 | 最近 14 个有记录的日子（不足 14 天时显示最近 14 天），深色为输出、浅色为输入，今天高亮。 |

**用量账本**

- 筛选：今日 / 近七天 / 近三十天 / 本月 / 全部 / 自定义日期，以及模型和对话。对话按标题列出，已归档、已删除、记录已消失的在名称后注明。
- Token 活动：每天、每周、累计和最近一年的热力图。
- 模型分布、对话分布，各带参考费用。对话分布按对话汇总：桌面端的一个对话可能跨好几个 Claude Code 会话，会合在一起，名称用对话标题。已归档、已从桌面端删除、或本机记录文件已不在的对话，分别标「已归档」「已删除」「记录已消失」，用量照常计入；会话明细里也有同样的标注。对话分布右上角可切换「进行中 / 全部」（默认进行中，会记住选择）：「全部」时旧对话按状态各合成一个分组，点开看用量最多的 5 个，「显示其余」看全部。占比都按全部用量计算。
- 会话明细：每个会话的自身用量和含子代理的用量、参考费用、最近活动；可搜索、翻页，导出 CSV 表格或 JSON 数据。
- 鼠标停在数字、图表、分布或会话上，悬停说明的第一行是「合计」（输入、输出、缓存写入和缓存读取的全部 Tokens），下面是「Tokens（输入+输出）」和各分项。

打开窗口不会访问 claude.ai。「刷新额度」和点角色一样，只读取当前组织一次。窗口开着时，本机用量每 20 秒自动更新一次（只读本机文件）。

**本机用量**来自这台电脑上 Claude Code 的会话记录（`%USERPROFILE%\.claude\projects`，设置了 `CLAUDE_CONFIG_DIR` 时用那里）：

- 只取每次回复的 Tokens 数字、模型、时间、项目文件夹名、会话编号、来源、速度和入口，以及会话标题，不读取、不保存对话内容。
- 另外读取 Claude 桌面端的对话列表（对话标题、是否归档、包含哪些会话），用来按对话汇总和标注。对话从桌面端删除后，统计里保留它最后的标题并标为「已删除」。
- Tokens = 输入 + 输出；缓存写入和缓存读取单独列出，因为 Claude Code 的缓存读取通常比输入输出大得多。
- 同一条回复在记录里会重复出现（分段写入、分支会话），按回复编号只计一次。
- 不包含 claude.ai 网页聊天、手机和其他电脑。统计保存在数据目录的 `usage-index.json`，下次只读新增的部分。

**参考费用**按 Claude API 公开价格估算（`runtime/dashboard/pricing.js`）：输入、输出、缓存读取按各模型价格，5 分钟缓存写入按输入的 1.25 倍、1 小时缓存写入按 2 倍，快速模式按 2 倍。订阅不按 Token 计费，这只是参考，不是账单；价格表里没有的模型显示「未定价」，并降低「定价覆盖」比例。

用量管理窗口是一个独立的小进程（WebView2，单独的浏览器配置，与 claude.ai 登录分开），关掉就退出。

## 在 Claude 对话里问额度

这是**可选扩展**，不影响挂件的日常使用。

先安装并打开挂件，在挂件里登录并读取一次额度。然后双击完整发布包中的 `Claude桌面扩展\claude-niang-usage.mcpb`，在 Claude 桌面端里安装扩展。最新版发布页也提供单独的 `.mcpb`；它不能代替挂件本身。

问“我还剩多少额度？”时，扩展读取本机保存的快照，并告诉你数据时间；明确说“刷新额度”时，才让正在运行的挂件重新读取。挂件未运行时，会说明刷新未成功；只有仍属于当前登录会话的数据才会作为旧快照提供。登录状态已变化时，请打开挂件并手动刷新。

扩展自身不会创建聊天或调用模型，也接触不到登录 Cookie。数据目录一般不用改；如果自定义了挂件数据位置，在扩展设置里选择对应的 `state` 文件夹。

## 换形象、语录、音效和音乐律动

- **形象**：右键 → 更换形象 → 添加形象。建议透明背景的正方形 PNG，大头半身、角色撑满画布，1024～2048 像素；上限为边长 4096、文件 20 MB。
- **语录**：右键 → 编辑我的语录，一行一句，每句最多 200 字、最多 5000 条，保存文件不超过 1 MB。超限时保留原列表；也可以恢复内置语录，或在“自动语录”里定时显示。
- **音效**：右键 → 声音与点击，可以导入最长 5 秒的 WAV，导入后会转成本地缓存。
- **音乐律动**：右键 → 音乐律动。角色跟随电脑正在播放的声音跳动，两边出现音箱，窗口上方挂一个灯球，还可以把她拎起来甩出去。声音只在本机分析，不保存也不上传。
- **墨镜**：音乐律动时默认形象会戴上墨镜；自行导入的形象默认不戴墨镜。

形象资源和墨镜标定的开发说明见 [自定义资源说明](docs/customization.md)。

## 更新、搬家与卸载

**更新**（包括从原版 1.x 更新到社区版）：先运行“停用Claude娘.cmd”，将新版本覆盖到**同一个文件夹**，保留原有 `claude-niang\installation.json`，再运行“安装Claude娘.cmd”。设置和登录保存在程序文件夹之外，会继续使用。如果装过桌面扩展，再双击一次新的 `.mcpb` 更新。

**搬家**：先运行“停用Claude娘.cmd”，再把整个文件夹移到新位置并重新安装。避免同时保留两个已安装的副本，它们会争用同一份开机启动登记。

**彻底卸载**：先运行“停用Claude娘.cmd”，再删除程序文件夹和 `%LOCALAPPDATA%\ClaudeNiang`；后者包含挂件自己的登录、设置和数据。桌面扩展请在 Claude 桌面端的设置里移除。

## 数据与隐私

- 每个 Windows 用户使用自己的登录、设置和数据。登录保存在 `%LOCALAPPDATA%\ClaudeNiang\webview`；额度快照、设置和统计保存在旁边的 `state`。
- 诊断日志保存在 `%LOCALAPPDATA%\ClaudeNiang\state\logs\claude-niang.log`，用于记录运行状态和错误；反馈前请检查并去除个人信息。超过 1 MB 时会保留一份旧日志。
- 挂件不读取常用浏览器或 Claude 桌面端里的登录，也不把 Cookie 交给 Node.js 部分或桌面扩展。
- 读取额度时访问 claude.ai 的组织、用量、必要的套餐信息和余额接口；组织和余额会缓存，减少重复请求。
- 用量管理窗口读取本机 Claude Code 会话记录里的 Tokens 数字和会话标题，以及 Claude 桌面端的对话列表（标题、是否归档），用来按对话统计（见上文）；不读取对话内容，也不上传任何东西；页面不加载任何网络资源。
- 没有遥测或第三方上传，也不会自动下载或安装任何东西。开启「自动更新」（默认开启）时，每次启动挂件会向 GitHub 读取一次本仓库公开的版本列表，请求里不含账号、Cookie 或本机信息；可以在右键「关于 Claude娘」里关闭。音乐分析也只在本机进行。

claude.ai 的网页接口不是公开 API，随时可能变化而失效。请遵守 Anthropic 的服务条款；遇到限流、验证或账号不可用时，挂件会提示原因，并等你下一次操作。

## 常见问题

| 问题 | 处理方法 |
|---|---|
| 挂件没有出现 | 打开 Claude 主窗口、取消最小化，再双击“打开Claude娘.cmd”。 |
| 没有额度数字 | 在挂件里登录，再点角色或 ↻。Free 等套餐没有额度窗口时会有说明。 |
| 显示的账号或额度与桌面端不同 | 检查挂件自己的登录账号和右键菜单中的组织。两边登录相互独立。 |
| 杀毒软件把“启动”文件夹里的 Claude Niang 快捷方式报成木马（如 TrojanDownloader/LNK.Agent） | 这是按外形的误报。2.0.0 起计划任务正常时不再创建这个快捷方式；更新后运行一次“安装Claude娘.cmd”或“打开Claude娘.cmd”，会移除本安装位置留下的旧快捷方式。 |
| 用量管理里没有本机用量 | 这台电脑需要用过 Claude Code。会话记录不在默认位置时，检查 `CLAUDE_CONFIG_DIR` 环境变量。 |
| 内置浏览器组件检查失败 | 重新运行“安装Claude娘.cmd”；仍失败时检查 WebView2 运行时。 |
| 提示“已连续失败 3 次” | 等待提示的秒数后再点 ↻，并检查网络、验证或登录状态。 |
| 已限流 | 按提示等待后手动刷新，程序不会定时重试。 |
| 额度更新了，余额仍是旧值 | 两者独立读取；查看余额自己的时间和错误提示。缓存或等待期结束后，再手动刷新。 |
| 切换登录后，对话扩展提示会话已改变 | 打开挂件，用当前账号手动读取一次；更新挂件后也要重新安装新版 `.mcpb`。 |
| 退出登录失败 | 先关闭已打开的登录窗口，或等当前查询结束后再试。 |
| 安装失败 | 查看程序文件夹 `claude-niang` 内的 `install-log.txt`。 |
| 旧版开机后出现空白 PowerShell 窗口 | 更新后双击一次“打开Claude娘.cmd”，重新登记隐藏启动。 |
| 挂件消失、读取持续失败或音乐律动停止 | 查看 `%LOCALAPPDATA%\ClaudeNiang\state\logs\claude-niang.log`。 |

仍有问题，请[提交反馈](https://github.com/Cottins-Vanilla/Claude-Niang-Community/issues/new/choose)，附上挂件版本、Windows 与 Node.js 版本、复现步骤及错误提示。发布日志前请去掉用户名、个人路径、邮箱和组织信息，勿上传 Cookie、登录文件或浏览器配置目录。

## 社区版说明

- **来源**：fork 自 [The-Scales-of-Themis/Claude-Niang](https://github.com/The-Scales-of-Themis/Claude-Niang)（原 Gryphus-Triune/Claude-Niang）的 1.3.3，保留完整的提交历史和原作者署名。原仓库停在 1.3.3，首页已注明后续版本在社区维护版发布。
- **功能**：2.0.0 包含原版 1.3.3 的全部功能，另外新增用量管理窗口，并修复启动快捷方式被误报的问题。详见 [更新记录](CHANGELOG.md)。
- **与原版共用数据**：社区版和原版使用同一个数据目录（`%LOCALAPPDATA%\ClaudeNiang`）和同一份开机启动登记，所以从原版更新后，设置和登录会继续使用。也因为这样，**不要同时安装原版和社区版**。
- **旧版本下载**：1.3.3 及更早的版本在[原仓库的发布页](https://github.com/The-Scales-of-Themis/Claude-Niang/releases)。
- **反馈**：社区版的问题请在[本仓库](https://github.com/Cottins-Vanilla/Claude-Niang-Community/issues/new/choose)反馈，不要提到原仓库。

## 版本号

格式为 `X.Y.Z`：

- **X**：正式版号，基本不变。社区版从 2 开始。
- **Y**：新增功能或较大改动时递增，Z 归零。
- **Z**：修复问题、日常维护时递增。

一个版本里同时有新功能和修复时，按新功能算（Y 递增）。每个版本只对应一个 `vX.Y.Z` 标签和一个 Release，已经公开的版本不会覆盖。

## 开发与贡献

测试、构建、提交检查和发布方法见 [CONTRIBUTING.md](CONTRIBUTING.md)。克隆后先运行一次 `git config core.hooksPath .githooks`，启用提交前检查：它会拦下临时文件、本机路径、私人邮箱和常见令牌。工作流配置在 `.github/workflows/`；实际运行结果以 [GitHub Actions](https://github.com/Cottins-Vanilla/Claude-Niang-Community/actions) 为准。

`.claude/skills/` 里是本仓库的维护规范，写给 Claude Code 用，人工维护时同样适用：

| 规范 | 内容 |
|---|---|
| [release-version](.claude/skills/release-version/SKILL.md) | 版本号怎么定 |
| [release-page](.claude/skills/release-page/SKILL.md) | 发布页（CHANGELOG 版本章节）的格式和发布步骤 |
| [commit-hygiene](.claude/skills/commit-hygiene/SKILL.md) | 提交和推送不带临时文件和个人信息 |

仓库根目录的 [CLAUDE.md](CLAUDE.md) 写给在本仓库工作的 AI 助手（Claude Code 等），会话开始时自动读取。维护者提出需求、设计或疑问时，先给 2–3 个方案再动手；意思明确的小改动直接做。界面类方案先给 HTML 效果图。改动只做本地提交，推送和发布要维护者确认。用 AI 助手参与贡献时，它也会按这份说明工作。

## 项目来源与 Claude 适配

Claude 娘基于 T7moris 与贡献者的 GPT-Niang 1.3.5 Windows 版开发，由 Gryphus-Triune 完成 Claude 适配并维护到 1.3.3；2.0.0 起由社区维护版继续开发。 [GPT-Niang 原仓库](https://github.com/T7moris/GPT-Niang)

Gryphus-Triune 的 Claude 适配包括：

- 适配 Claude 桌面窗口的挂件定位与显隐，增加独立的 claude.ai 登录窗口和组织切换。
- 改为手动读取 Claude 套餐、5 小时与每周额度、分模型额度和重置时间，并单独显示额外用量与预付余额的读取状态。
- 增加低额度与重置提醒，按组织记录本机今日观测到的用量变化。
- 提供可选的 Claude 桌面扩展，在对话里查看本机额度快照，或明确请求刷新。

## 许可与致谢

本项目基于原作者 Gryphus-Triune 的 [Claude-Niang](https://github.com/The-Scales-of-Themis/Claude-Niang)（MIT），社区版在此基础上继续维护。Claude-Niang 改写自 [GPT 娘 1.3.5](https://github.com/T7moris/GPT-Niang)（MIT），借鉴了[小鲸鱼余额挂件](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)的提醒与记账思路；账户总览的版面参考了 [Codex-DragonGirl](https://github.com/InhamiRei/Codex-DragonGirl) 的账户总览，按 Claude 的数据重新实现，没有使用它的代码。内置语录中有 7 句来自小鲸鱼余额挂件，来源与许可见 [语录许可说明](claude-niang/assets/quotes-LICENSE.txt)。

代码、配套文档、项目自写语录及点击音效采用 [MIT 许可](LICENSE)。许可文件保留 T7moris 和 GPT-Niang contributors 的原版权声明，Claude 适配及新增代码署名为 Gryphus-Triune，社区版的改动署名为 Claude-Niang contributors。

默认角色图由 Gryphus-Triune 原创，桌面扩展图标由该图制作。角色图及衍生图标不在 MIT 许可范围内，使用范围见 [角色图片使用说明](CHARACTER-NOTICE.txt)。

随包分发的 WebView2 SDK 文件遵循微软的许可并保留第三方声明，见 [WebView2 许可](claude-niang/runtime/webview2/LICENSE.txt) 与 [WebView2 第三方声明](claude-niang/runtime/webview2/NOTICE.txt)。

Claude 是 Anthropic 的商标。本项目与 Anthropic 没有关联。
