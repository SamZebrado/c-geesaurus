# Vocal synthesis workflow · 旋律与人声工作流

把已验证可运行的 WORLD 人声处理核心整理成独立 Python 子目录，供短剧配唱、旋律试唱和人工修订使用。它不依赖本仓库的网页 Mock，也没有把网页变成人声生成器。

**这是实现状态的快照，不是“上传任意乐谱就自动唱”的完整产品。** 当前输入是人工核对后的单声部音符时间线、已获授权的人声 WAV，以及人工音节/音素时间映射。任意曲调可以先转成这个时间线再尝试；PDF/图片乐谱识别、MIDI/MusicXML 导入、自动歌词对齐、自然歌唱模型均未实现。音域、时长和声音质量有明确边界，见下文。

这里的“子模块”是仓库内 `modules/vocal_synthesis/` 子目录，不是另建远端仓库的 Git submodule。原网页和工作流不受影响。

## 已实现与已验证

- WORLD：Harvest → StoneMask → CheapTrick + D4C → 重合成，5 ms 帧间隔。
- 单声部 JSON 音符、休止符、空白间隔；科学音高名（例如 C#4）、MIDI 音高数字，支持小数半音。
- 明确的源时间 → 目标时间片段映射。在 `auto` 片段内尽量保留非周期辅音的时长，把主要延长量分给周期性部分；这是声学启发式，不是音素识别。
- 保留源无声/有声差别；可人工指定 `unvoiced`（非周期发音）或 `silence`（闭塞/静音）。频谱包络与非周期度一起插值。
- 目标休止与未对齐的空隙在采样级静音，片段交界短淡入淡出；极端拉伸告警。
- PCM16/PCM32/浮点/无符号 PCM8 读入校验、有限值与峰值保护、WAV 写出回读检查、参数与 QA 报告。
- 无需模型下载的虚构旋律和数学合成元音测试；重新提取输出 F0 检查音高，而不只检查程序退出码。
- 一个已运行的三谐波加法合成导音器。它只是基础音高提示，不是高级电子乐器、编曲器或逼真乐器音源。

**没有聆听验收的内容不会标为已听审。** 自动测试能验证音长、音高数值、静音边界和无削波，不能证明歌词清楚、角色声线自然、情绪正确或成品可发布。此公开示例没有真实歌词、作品录音、角色音色、声纹向量或作品链接。

## 快速开始

建议 Python 3.12（已实测），Linux 或有编译工具的桌面环境。依赖版本见 `requirements.txt`。pyworld 可能从源码编译，需要 C/C++ 工具链；本模块不会自行下载模型、SoundFont，或访问任何语音服务。

```sh
cd modules/vocal_synthesis
python3.12 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python -m vocal_workflow demo outputs/demo-01
```

Windows 可用 `.venv\Scripts\activate` 激活。首次安装需要从包仓库下载依赖，之后上述合成命令离线运行。未承诺所有系统的二进制安装均可用。

演示输出：

- `synthetic_source.wav`：纯数学合成的 /a/ 类测试音，不是 TTS 或真人。
- `vocal.wav`：按虚构旋律变调、延时后的测试音。
- `guide.wav`：基础三谐波导音。
- `score.json`、`alignment.json`：可复用输入。
- `parameters.npz`、`report.json`：目标 F0、时间映射、拉伸警告和技术检查。

不覆盖已有输出目录。要重跑请选新目录。例子是把同一合成元音延长到几枚音符，证明接口和信号链可运行，不假装完成了有歌词演唱。

## 使用自己的声线与旋律

先准备有使用权的干人声 WAV，建议短句、单人、无混响、无伴奏。可来自本人录音或获授权的 TTS 输出。这里只处理 WAV，不内置 TTS、自动克隆或模型下载。**音色主要来自输入声音，并非“凭谱创造任意歌手”。**

```sh
python -m vocal_workflow validate examples/score.json
python -m vocal_workflow tone examples/score.json outputs/guide-01.wav
python -m vocal_workflow render private/voice.wav private/score.json private/alignment.json outputs/take-01
```

将私有素材和自写歌词放在忽略目录 `private/`，不要改成公开示例；生成结果在忽略目录 `outputs/`。仅 `.gitignore` 并不能阻止强制提交或已追踪文件泄露，提交前仍要检查。

### 音符时间线

参考 `examples/score.json`。所有时间单位是秒，区间为左闭右开。`duration_s` 含前后静音；没有音符覆盖的时间就是休止。`pitch: null` 也表示休止。音符必须排序、不重叠、至少 10 ms，目标音高限制为 55–1000 Hz。`C4 = MIDI 60`，`A4 = MIDI 69 = 440 Hz`。

不要把伴奏和弦塞到这一单声部输入里。变速、切分、附点、连音可以先人工换算成秒；一字多音可以让同一对齐片段覆盖多个音符。乐谱上的反复、装饰音、声部选择、节拍与歌词应先人工确认。不存在“任意 PDF 已兼容”的承诺。

### 音节/音素时间映射

参考 `examples/alignment.json`。每段有 `source_start_s`、`source_end_s`、`target_start_s`、`target_end_s`、`kind`。源/目标片段分别按时间排序且不重叠，不能越出输入或输出时长；允许有空隙，目标空隙静音。一般按音节/音素分段，而不是把整首歌均匀拉长。当前不支持源片段重排或重复引用，需先准备对应的新源短句。

- `auto`：用 WORLD 周期性掩码分配时间，尽量少拉长非周期辅音。
- `unvoiced`：强制 F0 为零，保留源非周期成分，不等于静音；适用于经人工核对的擦音等。
- `silence`：完全静音；只在确有闭塞/停顿证据时使用，不要凭拼写删掉声音。

边界必须核听或结合频谱审核。数字对齐不等于发音正确。上游强制对齐器可提供候选，但不能直接把零时长音节、标点或低置信片段当真值。输入、输出每次最多 60 秒，但建议每句 2–10 秒；48 kHz、60 秒的高分辨率频谱处理中间数据可能超过 1 GB 内存。长作品分句渲染再在 DAW 组装。极端拉伸（大于 5 倍或小于 0.35 倍）会告警；需要更自然时应换源、重新录制或使用专门的歌唱模型。

**休止符不会暂停源时间推进。** 如果同一映射片段跨越休止符，落在休止位置的源发音会被静音。真实歌词应把片段拆开，分别对齐休止前后的音节，避免把字吞掉。虚构元音示例故意不涉及歌词。

## 工作流总结与尚未打包部分

整体路线是：合法声源 → 文本/音节复核 → 人工审核时间边界 → 确认音符和节奏 → WORLD 变调/时间映射 → 技术 QA → 听审 → 与伴奏混合 → 局部改句并复验。

原型中还实践过声学周期性辅助判断、角色化频谱处理、逐句版本替换、未修改区域逐采样比对、MIDI 导出、SoundFont 渲染和混音。它们含任务专用假设，需要进一步泛化。本次没有把那些专用脚本、角色参数、私有音色或素材带入公开仓库，也不把这些能力当作本模块已经提供的命令。

电子乐器已有的路线是 FluidSynth + 自备 SoundFont，加上 MIDI 事件、混响、EQ、动态和伴奏避让。这属于音源渲染与混音，不代表已经穷尽电子合成。当前模块仅放入能独立运行的三谐波导音器；减法合成、FM、波表、物理建模、采样分层及更完整的 MIDI/DAW 集成是后续探索方向，没有假实现。

## 限制与验收清单

- 并非神经歌唱模型。大幅跨音域、长元音、气声、擦音及很短音节可能产生机械感、音色漂移或发音损失。
- WORLD 有声判定会出错；本模块没有音素分类器，不自动填补漏检有声帧，也不保证保持原始共振峰的听觉效果。
- 不自动识别参考歌的旋律、不读取 PDF/图片/MIDI/MusicXML，不自动生成或校正歌词；目标音高必须明确输入。
- 单声道 16–48 kHz WAV。立体声、混合伴奏和采样率转换需用户明确预处理；拒绝静音、超长和非有限输入。
- 淡入淡出仅在连续有声区间的外边缘执行，不在每个相邻音符处重新起音；但目标 F0 仍是阶梯变化，不是带滑音、颤音或表情控制的高质量连奏引擎。已知同音连线可合并为一个音符。
- 峰值保护是采样峰值，不是完整响度母带、真峰值或平台响度认证。
- 音高测试使用数学测试元音；不能外推为任意真人/语种的准确率。应先短句试听，再扩大处理。

每次候选至少核对：音符/时长、歌词与辅音、清浊/闭塞、尾音、角色听感、底噪/削波、与伴奏的节拍。人工通过后另存正式版本，不用“自动通过”替代听审。

## 隐私与许可

运行时无网络调用、无遥测、无第三方上传。公开代码不包含姓名、账号、邮箱、私有 URL、目录、作品标题、原歌词、真实波形、模型权重或语音 embedding。技术报告不记录输入路径、文本和输入文件散列。参数/音频/报告仍是使用者的数据，默认不应发布。

自有代码遵循仓库 [Apache-2.0](../../LICENSE)。依赖及外部模型/音源分别遵循自己的条款，见 [THIRD_PARTY.md](THIRD_PARTY.md)。代码许可不授予他人声音、歌曲或歌词的使用权。只使用已获授权的声音、旋律、歌词和伴奏，不冒充真人或暗示其参与。

## English summary

An offline Python subdirectory that extracts a working WORLD resynthesis core into a reusable, privacy-preserving interface. It takes a reviewed monophonic JSON note timeline, authorized mono voice WAV, and explicit source-to-target segment alignment. It does not implement arbitrary score recognition, MIDI/MusicXML import, automatic lyric alignment, TTS, voice cloning, or neural singing synthesis. A synthetic vowel and invented melody exercise the complete signal path; no real lyrics, recordings, identity data, or production links are included. Numerical pitch/duration/clipping checks are not perceptual approval. Advanced electronic instrument synthesis remains future work; only a basic three-harmonic guide is implemented here.
