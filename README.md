# sekai-mmw-preview-web

Project SEKAI 本家风格的 SUS 预览器 Web 版本，支持 wasm 渲染、HUD、开场信息、AP 结算演出与本地文件加载。

## 页面结构

- `/`：主页（项目介绍 + 入口）
- `/upload`：上传页面（本地 SUS/BGM/曲绘与元信息）
- `/preview`：预览页面（播放器 + HUD + 控制台）
- `/about`：关于页面（开发者、引用项目、许可证）

## 主要功能

- SUS 谱面解析与 WebAssembly 渲染
- 音频与谱面时间轴同步（支持 `offset`）
- Overlay 风格 HUD（分数/血条/combo/PERFECT）
- 开场歌曲信息展示与过场
- 结尾 AP 演出层
- 无 URL 参数时可直接本地上传文件预览
- 背景亮度调节（60%~100%）
- 录屏模式下可隐藏锁屏组件及默认隐藏控制栏

## URL 预览参数

基础模式：

```text
/preview?sus=<sus-url>&bgm=<bgm-url>&offset=<ms>&cover=<cover-url>
```

可选扩展参数（可单独传，或放入 `config/cfg`）：

- `title`
- `lyricist`
- `composer`
- `arranger`
- `vocal`
- `difficulty` / `diff`

### 更优雅的 config/cfg 方式

支持把参数打包为 JSON 放进 `config` 或 `cfg`：

- 长键：`sus bgm cover offset title lyricist composer arranger vocal difficulty`
- 短键：`s b c o t ly co ar v d`

示例（短键 JSON，URL Encode 后放入 `cfg=`）：

```json
{
  "s": "https://assets.unipjsk.com/startapp/music/music_score/0127_01/append",
  "b": "https://assets.unipjsk.com/ondemand/music/long/se_0127_01/se_0127_01.mp3",
  "c": "https://assets.unipjsk.com/startapp/music/jacket/jacket_s_127/jacket_s_127.png",
  "o": 9000,
  "d": 5,
  "t": "トンデモワンダーズ",
  "ly": "sasakure.UK",
  "co": "sasakure.UK",
  "ar": "sasakure.UK(Key 岸田勇気(有形ランペイジ))",
  "v": "天馬司, KAITO, 鳳えむ, 草薙寧々, 神代類"
}
```

## 开发

要求：Node.js 20+、npm 10+、`emcc` 在 `PATH`

```bash
npm install
npm run dev
```

构建：

```bash
npm run build
npm run preview
```

## 致谢与许可证

本项目使用并改造了以下开源项目：

- [crash5band/MikuMikuWorld](https://github.com/crash5band/MikuMikuWorld)（MIT）
- MikuMikuWorld MIT License: [LICENSE](https://github.com/crash5band/MikuMikuWorld/blob/master/LICENSE)
- [TootieJin/pjsekai-overlay-APPEND](https://github.com/TootieJin/pjsekai-overlay-APPEND)（AGPL）

由于引入了 AGPL 许可代码，本项目当前按 **AGPL-3.0-only** 发布。

- 项目许可证文件：`/LICENSE`

## 开发者

- 綿菓子ウニ: [https://space.bilibili.com/622551112](https://space.bilibili.com/622551112)
- GitHub: [https://github.com/watagashi-uni/sekai-mmw-preview-web](https://github.com/watagashi-uni/sekai-mmw-preview-web)
