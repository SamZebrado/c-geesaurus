# C. Geesaurus · 从灵感到下一镜
C. Geesaurus · From inspiration to the next shot.

**展示入口：在线 Demo 正在进行首次发布验证；现在可以按下方步骤本地运行。**  
**Demo: the first online deployment is being verified; you can run it locally with the steps below.**

<img src="docs/assets/c-geesaurus.png" alt="C. Geesaurus：抱着肉桂的中国大雁 / A Chinese goose holding cinnamon" width="150">

**C 代表 Cinnamon。让创作有温度，让每一步有据可依。**  
**C stands for Cinnamon. Warm creative tools, with a traceable decision at every step.**

这是一个面向 Agent 视频创作流程的开源原型：先写好故事，再讨论如何生成；建议不是命令，定稿由你取舍。  
This is an open-source prototype for agent-assisted video workflows: get the story right before generating media; suggestions are not commands, and you choose the final version.

> **当前是 v0.1 本地交互 Demo，不是可用的视频生成器。** 所有对白、图像示意与回执都是虚构 fixture，没有真实 LLM/API、网页自动化、视频生成或音频修补能力。  
> **This is a v0.1 browser-local interactive demo, not a working video generator.** All dialogue, reference illustrations, and receipts are fictional fixtures. Real LLM/API calls, browser automation, video generation, and audio repair are not implemented.

## 先试一遍，不需要 Key
Try it first—no API key required.

1. 在创作工作台采纳第一条自然化建议，拒绝第二条故意放入的错误建议；也可以尝试其他取舍。  
   In the workspace, accept the natural-dialogue suggestion and reject the deliberately incorrect one—or explore other choices.
2. 检查说话者与对白，再确认演示剧本；下方两张镜头卡会对应同一版本。  
   Review speakers and dialogue, then confirm the demo script; both shot cards follow that version.
3. 在“模型与服务”试试统一默认和模块覆盖；仅文本 Mock 会提示页面工具和视觉能力缺口。  
   Try global defaults and per-module overrides in “Models & services”; the text-only mock reports missing tool and vision capabilities.
4. 在“任务与质检”开始模拟任务，逐步观察确认、接受回执、虚构 ETA 和匹配的结果卡片；试试刷新后提交计数仍为 1。  
   In “Tasks & quality”, start the mock task and step through confirmation, acceptance, a fictional ETA, and matching results; refreshing keeps the submission count at one.
5. 下载 JSON 演示记录。它不是视频，也不代表真实供应商生成成功。  
   Download the JSON demo record. It is not a video and does not prove a real provider generated anything.

## 当前能做什么
What works today.

- **三段写作**：固定初稿 → 独立建议 → 人工取舍定稿；保留对白 ID、说话者、取舍与版本，变更取舍会使旧确认失效。  
  **Three-stage writing:** fixed draft → independent suggestions → human selection; dialogue IDs, speakers, decisions, and revisions are retained, and changed choices invalidate approval.
- **响应式镜头卡**：参考示意图、分镜动作、对白逐条对应；桌面左右排列，手机上下排列。真实首态图未生成会明确标注。  
  **Responsive shot cards:** reference illustration, action, and dialogue stay aligned; side-by-side on desktop and stacked on phones. Real first-frame images are explicitly marked as not generated.
- **角色与场景引用**：两种场景视角、角色正侧面、固定版本引用；模拟光线换版只产生元数据，不悄悄替换旧镜头参考。  
  **Character and scene references:** two scene angles, character front/side views, and pinned versions; a simulated lighting revision changes metadata without silently replacing old shot references.
- **两层独立配置**：Agent backend 与生成 provider 分离，流程图显示有效 Mock API/model；全局默认可被单个模块覆盖。  
  **Two independent configuration layers:** agent backends and media providers are separate; the flow diagram shows effective mock API/model choices, with per-module overrides of global defaults.
- **本地任务账本**：同一请求身份、确认一次、已接受不重发、刷新恢复、来源不匹配不下载；导出只有虚构 JSON。  
  **Local task ledger:** stable request identity, one confirmation, no resubmission after acceptance, refresh recovery, and rejection of unrelated results; exports contain fictional JSON only.
- **共享核心**：网页 GUI、headless CLI 和 JavaScript 函数接口使用同一份纯函数状态逻辑；不依赖 GUI 点击来运行模拟核心。  
  **Shared core:** the web GUI, headless CLI, and JavaScript function interface use the same pure state logic; the mock core does not depend on GUI clicks.

## 本地运行
Run locally.

网页无需构建或安装依赖；使用 Python 3 提供静态文件，再打开命令输出的本地地址。不要直接用 `file://` 打开模块脚本页面。  
The web app needs no build or dependency install. Serve the static files with Python 3, then open the local address. Do not open the module-script page via `file://`.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory docs
```

浏览器打开 **http://127.0.0.1:4173**。若有 Node.js，也可以运行 `npm run dev`，但此命令仍需要 Python 3。  
Open **http://127.0.0.1:4173** in your browser. With Node.js installed, `npm run dev` is equivalent but still requires Python 3.

## 给其他 AI 或终端使用者
For other agents and terminal users.

需要 Node.js 20 或更新版本；无需依赖安装，无需密钥，不会发出网络请求。  
Requires Node.js 20 or newer; no dependency install, credentials, or network requests are needed.

```sh
npm run demo
node scripts/demo.mjs --json > mock-record.json
node scripts/demo.mjs --help
npm run check
```

程序接口是 `docs/src/core.js` 的 ES module；可以直接导入 `initialState`、`decide`、`approve`、`startTask`、`advanceTask`、`recoverTask` 与 `exportBundle`。  
The programmatic interface is the ES module at `docs/src/core.js`; import `initialState`, `decide`, `approve`, `startTask`, `advanceTask`, `recoverTask`, and `exportBundle` directly.

```js
import { initialState, decide, approve, startTask, exportBundle } from './docs/src/core.js';
let state = decide(initialState(), 'S01', 'accept');
state = decide(state, 'S02', 'reject');
state = startTask(approve(state));
console.log(exportBundle(state));
```

**尚无 HTTP API 服务、真实 Agent runtime 或远端预览控制接口。** CLI 只运行模拟流程；GUI 预览由上面的本地静态服务提供。  
**There is no HTTP API server, real agent runtime, or remote preview-control API yet.** The CLI runs the mock workflow; the static server above provides the GUI preview.

## 密钥与数据边界
Credentials and data boundaries.

- 公开 Pages 不接收真实 Key。界面只有固定的 `env:GEESAURUS_DEMO_KEY` 引用示例，不读取这个环境变量，也没有 credential provider 实现。  
  Public Pages does not accept real keys. The UI only shows the fixed reference `env:GEESAURUS_DEMO_KEY`; it does not read that variable, and no credential provider is implemented.
- 将来的真实运行应在用户本地应用或可信后端，通过环境变量或密钥库解析引用；密钥不得出现在流程图、浏览器存储、日志或导出中。  
  Future real execution should resolve references through environment variables or a secret store in a local app or trusted backend; keys must never appear in diagrams, browser storage, logs, or exports.
- 演示选择保存在本机 `localStorage` 的 `c-geesaurus-demo-v1` 项。重置仅清除此 Demo 的状态，不删除已下载文件；存储不可用时会警示。  
  Demo choices are saved locally under the `c-geesaurus-demo-v1` localStorage entry. Reset affects only this demo state, not downloaded files; unavailable storage is reported.
- 没有分析 SDK、外部字体、第三方运行时或数据上传；页面 CSP 为 `connect-src 'none'`。首次访问仍会从 GitHub Pages 下载公开静态文件，主动点击 GitHub 链接会打开外站。  
  There is no analytics SDK, remote font, third-party runtime, or data upload; the page sets `connect-src 'none'`. Initial visits still load public static files from GitHub Pages, and clicking the GitHub link opens that external site.
- 不包含私人剧本、账号、聊天记录、研究资料或真实生成素材。参考图是为此 Demo 原创绘制的 SVG；品牌大雁是经项目所有者确认的 AI 生成资产。  
  No private scripts, accounts, chat history, research data, or real generated production assets are included. References are original SVG illustrations made for this demo; the branded goose is an owner-approved AI-generated asset.

## 尚未实现，不要误认
Not implemented—do not mistake previews for capabilities.

- OpenAI、Qwen、DeepSeek 等真实 Agent backend，真实图像/视频服务及其凭据、安全沙箱和费用授权。  
  Real agent backends such as OpenAI, Qwen, or DeepSeek, real image/video providers, credential handling, execution sandboxes, and billing authorization.
- 网页 skill、独立回复解释模型、真实截图、实际计时等待、下载真实视频和持久后端服务；目前是固定人工 fixture 与本地存储。  
  Browser skills, an independent page-response model, real screenshots, timed waiting, video downloads, and a durable backend service; current behavior is fixed synthetic fixtures plus local storage.
- Mock API 选项只切换路由标记并复用网页演示，不是异步供应商协议兼容性验证；切换模型标签也不会执行模型。  
  The Mock API option changes a route label and reuses the web fixture; it does not validate asynchronous provider protocols. Changing a model label does not execute a model.
- 画面识别、区域修补、声线频谱或音轨处理。页面只展示“局部修补、保留原片与原音轨、复验和听审”的计划，未执行或验证媒体质量。  
  Visual recognition, region repair, voice spectra, or audio processing. The page only previews a plan for localized repair, original-media preservation, reinspection, and listening review; media quality has not been processed or validated.
- Toonflow 插件与 ViMax 轻适配仍是待评估路线，本仓库没有复制或捆绑这些项目的代码。  
  A Toonflow plugin and a lightweight ViMax integration remain evaluation candidates; this repository does not copy or bundle their code.

## 测试与部署
Tests and deployment.

`npm run check` 执行语法检查与离线合同测试，涵盖版本确认、能力缺口、防重复提交、回执恢复、结果绑定、损坏存储和 CLI/GUI 共用核心。  
`npm run check` runs syntax checks and offline contract tests covering revision approval, capability gaps, submission deduplication, receipt recovery, result binding, damaged storage, and the shared CLI/GUI core.

GitHub Actions 运行离线检查和独立 Chromium 桌面/手机交互测试，保留合成素材截图；这些检查不意味着真实服务已验收。浏览器测试需要 Node.js 22 与已安装的 Chrome/Chromium，可手动运行 `node scripts/browser-check.mjs`。  
GitHub Actions runs offline checks plus isolated Chromium desktop/mobile interaction tests and retains synthetic screenshots. These checks do not certify real-service compatibility. Browser tests require Node.js 22 and installed Chrome/Chromium; run `node scripts/browser-check.mjs` manually.

GitHub Pages 使用仓库 `main` 分支的 `/docs` 静态目录；无需新增托管服务、构建产物或自动发布工作流。  
GitHub Pages uses the `/docs` static directory on `main`; no extra hosting service, build output, or custom deployment workflow is required.

## 许可证与资产
License and assets.

自有代码采用 [Apache-2.0](LICENSE)，保留仓库创建时的完整英文许可证。第三方代码、依赖或资产仍须遵循各自原许可，不能因进入此仓库就改标 Apache-2.0。  
Original code is licensed under [Apache-2.0](LICENSE), preserving the full English license from repository creation. Any third-party code, dependencies, or assets retain their own terms; inclusion does not automatically relicense them.

品牌 PNG 原文件保持不变，不重编码或移除来源元数据；参见 [资产说明](ASSETS.md)。第三方 AGPL 代码未被纳入。  
The original brand PNG is preserved without re-encoding or removing provenance metadata; see [asset notes](ASSETS.md). No third-party AGPL code is included.
