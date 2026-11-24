# 可复用有声漫画工作流

本仓库提供零依赖、零网络、零新增现金的**离线合同实现**，固定输入与成页顺序、角色声线、逐句表演指令、预算账本、来源回执和验收字段。示例只使用原创虚构纸船、现有 SVG 和通用成年声描述。没有生成漫画页面或声音，没有上传录音、克隆真人、下载模型、读取凭据或消费 API 赠额。

浏览器从原工作台底部进入 `audio-comic.html`；共享核心是 `docs/src/audio-comic.js`，CLI 是 `scripts/audio-comic.mjs`。原视频演示的核心、存储键与任务保持独立。页面 CSP 仍为 `connect-src 'none'`。

## 运行和恢复

需要 Node.js 20+；无需安装依赖。

```sh
npm run comic
node scripts/audio-comic.mjs --json
npm run check
# 与原工作台使用同一静态服务，打开 /audio-comic.html
npm run dev
```

生成自己的本地 manifest：

```sh
node --input-type=module -e "import {exampleManifest} from './docs/src/audio-comic.js'; console.log(JSON.stringify(exampleManifest(), null, 2))" > manifest.json
node scripts/audio-comic.mjs --manifest manifest.json --json
```

CLI 只向 stdout 输出，不自行写文件。需要保存时由调用者选择本地路径，勿把私人素材或 checkpoint 提交到公开仓库。

```sh
node scripts/audio-comic.mjs --stop-after-submit > checkpoint.json
node scripts/audio-comic.mjs --resume checkpoint.json --json
```

`--stop-after-submit` 在第一条请求持久化边界输出账本：状态已标记 submitted，但尚未调用 mock adapter。恢复只 inspect 同一请求，再取字节，不 submit。完整验收包中的 `ledger` 也可以单独保存为恢复文件；`--resume` 接受账本对象。失败或损坏数据会报错，**不会自动清空账本再发一遍**。CLI 独立进程没有共享锁，不应并发覆盖同一 checkpoint；浏览器使用 Web Locks，存储不可用或其他标签页变更时停止。

## Manifest 与冻结规则

`exampleManifest()` 是可导出的 schema 1 示例；`validateManifest()` 负责约束。修改后创建新 ledger；已经绑定的 manifest 不能原地替换。

| 字段 | 合同 |
| --- | --- |
| `inputs` | 输入 ID、类型、来源说明与许可记录；当前为原创 storyboard 元数据 |
| `pages` | 显式从 1 连续排列，绑定 inputId、时长、相对 SVG 路径、SHA-256 和许可；不猜文件名顺序 |
| `voices` | 每个 speaker 恰好一个 ID/version、语言、成年声描述、固定 voiceId/model 与来源许可；当前仅 text-design，referenceRecording 必须 null |
| `lines` | 稳定对白 ID、pageId、speaker、voiceId、原文、页内毫秒起止、情绪/强度/速率/句后停顿/自然语言指令 |
| `tts` / `vc` | 两个独立 adapter；VC 默认关闭，先完成 TTS，绑定原 TTS requestId/SHA，不覆盖原输出 |
| `budget` | USD 微单位现金上限强制为 0；按 JS 字符串 UTF-16 长度计算 mock units，上限及最多 1–3 次尝试；这不是供应商计费估算 |
| `subtitles` | 从显式页偏移和台词时间生成 SRT，标为 planned-not-aligned，保留文本许可与署名 |
| `music` | 默认 null；非空需来源/SHA、同步/改编/导出许可、署名、gainDb；只保存元数据，不包含或混入音乐 |
| `export` | 画幅、fps、合成内容披露；只支持 review-package，不能冒充 MP4/WAV 导出 |

页、输入、字幕、声线与音乐分别记录 `source/license/permission/attribution/exportAllowed`。这些记录是待核的来源凭据，不会自动证明第三方权利。当前成页是已存在的 SVG fixture：没有分页模型、OCR、绘制或排版引擎。CLI 对本地页文件实际读 bytes 并核 SHA；浏览器只展示固定示例和核账本，不宣称校验了浏览器所解码图像的字节。

## 请求、预算与适配边界

核心 API：`createLedger → reserveJob → markSubmitted → recordAcceptance → recordArtifact → exportReviewPackage`。`mockAdapter('tts' | 'vc')` 提供异步 `submit(request)`、`inspect(request)`、`fetchBytes(request)`，无网络副作用。`verifyPageBytes` 可单独验证页来源。

请求 ID 是规范化 payload 的 SHA-256，包含整个 manifest 的 SHA、adapter/stage、逐句指令、完整 voice profile 和 VC 输入 SHA；声线版本、文字、情绪、页顺序或许可变化都会产生不同身份。同一账本内重复 reserve 返回已有任务，不重复占预算。跨版本的新 ledger 是新的预算范围，不能当成整个账户的全局开支控制。

调用者须在 adapter 动作前可靠保存 reserved/submitted 状态；浏览器逐步保存，保存失败就停止。预算按每次尝试保守占用，不自动退回失败份额。`submitted/uncertain/accepted` 一律先 inspect；只有明确证据证明未接受的 `failed/not-accepted` 才能显式 `retryJob`，仍受总 units 与尝试上限约束。接受回执严格绑定 mode/requestId/adapter/stage/providerRequestId。输出验证实际 bytes、长度、SHA、来源回执和 MIME；当前只接受确定的 mock JSON 字节。

这些 SHA 是完整性和去重标识，不是供应商签名或安全认证。恢复时重建合法状态转移，核 manifest/request/预算/回执/输出；坏数据失败即止。真实供应商将来需要单独实现可信持久存储、幂等 submit、按请求 inspect、签名/来源校验、实际成本封顶和媒体字节验收，不能直接把 mode 改为 real。本次没有连接这些能力。

## 实听、字幕和成片验收

每条最终采用的音频都应记录 requestId、artifactSha256、lineId/stage、审听人、时间、是否完整听过、发音、角色一致性、情绪节奏、破音底噪、字幕同步、配乐平衡与备注。ASR、波形、声纹只能辅助，不能替代完整实听。若后续 VC 或重新合成改变字节，必须重新听审对应 SHA。

`listeningChecklist()` 当前所有字段为 `not-performed/pending`，审听人和时间为 null。mock ledger 拒绝写入听审 PASS。导出固定 `realSynthesis:false`、`listeningPass:false`、`productionReady:false`，即使 `completeMockContracts:true` 也只代表离线合同齐备。

JSON 包含 manifest、可恢复账本、mock 输出 bytes/长度/SHA/回执、SRT 文本、待听审表、导出参数和阻塞项。没有音频、配乐混音、字幕烧录或成片，不能作为真实媒体交付。真实阶段还需核定音频时长与停顿、字幕对齐、音画同步、音乐许可和混音响度、合成内容披露，再执行人工验收。

## 可选真实路线（仅文档，未启用）

以下公开官方资料核对于 2026-11-01；使用前须重核具体版本、账户权限、服务条款和费用。没有安装或调用这些模型/服务。

- [Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign 官方权重卡](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign) 标记 Apache-2.0；可作为文字声线设计候选。
- [FunAudioLLM/Fun-CosyVoice3-0.5B-2512 官方权重卡](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512) 标记 Apache-2.0；权重许可不等于参考录音权利或托管服务许可，需分别核实。
- [OpenAI Custom voices 官方指南](https://developers.openai.com/api/docs/guides/custom-voices)：prompt-to-voice 可用文字设计成年声，无需参考/同意录音；创建免费，GPT-Live 发声及 Playground 试听按正常会话计费。prompt 声仅适用于 GPT-Live，不能用于普通 TTS、Realtime 或 Chat Completions。创建结果只有 voice 元数据，不能当成音频或试听回执。必须保存 voice ID 与原始描述，避免逐句重新造声；发声时继续提供原描述和表演指令。

OpenAI 路线应作为独立 Live 会话 adapter 评估，不套用普通 TTS endpoint。DSH 普通 modelpicker 不支持 Live；可在以后通过 CLI/MCP 单独接入，当前没有实现实时网络客户端。启用前必须另核账户权限、余额、赠额有效期、会话报价与明确预算。**不能假设赠额耗尽会硬停**，还可能消耗购买余额；本仓库以不连接服务和现金零上限实现当前零现金边界。

真实声线选择与试音留待后续人工安排；本次仅运行离线合同和 mock 回归。不得提交用户私人剧情、录音、账号、私有 URL、凭据、科研资料或聊天记录。
