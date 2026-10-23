<div align="center">
  <img src="src-tauri/icons/icon.png" alt="elaina" width="80" />
  <h1>elaina</h1>
  <p>简单的视频压制、音轨替换与音频提取工具。</p>
  <p>
    <a href="https://github.com/yukinsnow/elaina/actions/workflows/check.yml"><img src="https://github.com/yukinsnow/elaina/actions/workflows/check.yml/badge.svg" alt="build" /></a>
    <a href="https://github.com/yukinsnow/elaina/releases">下载安装包</a>
  </p>
</div>

使用 tauri 2、rust、typescript 与 vite 重构，保留原角色背景插图与应用图标，采用现代浅色工具界面，以任务页签切换压制、替换音频和提取音频。视频和音频通过本机 ffmpeg 处理，不会上传到服务器。

![elaina 界面预览](docs/preview.png)

## 功能

- **视频压制**：支持 x264、x265、xvid、av1、mpeg4 和流复制，可设置视频码率、音频码率、帧率和分辨率。
- **替换音频**：保留视频流，复制外部音轨，输出时长以较短输入为准。
- **提取音频**：将视频的首条音轨保存为 pcm s16le wav。
- **投稿辅助**：b站投稿预设、本地媒体参数检查、hdr 提示、体积估算与 mp4 快速起播。
- **任务控制**：显示已处理的媒体时间，支持取消任务，关闭应用时清理 ffmpeg 子进程。
- **文件保护**：拒绝覆盖已有输出文件；调整分辨率时保持比例并补边。

## b站投稿准备

选择「视频压制」里的投稿预设，一次配置分辨率、帧率、h.264 + aac、320 kbps 音频、投稿兼容处理与 mp4 快速起播。

| 预设 | 分辨率 | 帧率 | 视频目标码率 |
| --- | --- | --- | --- |
| 1080p30 | 1920 × 1080 | 30 fps | 8000 kbps |
| 1080p60 | 1920 × 1080 | 60 fps | 12000 kbps |
| 4k30 | 3840 × 2160 | 30 fps | 20000 kbps |
| 竖屏 1080p | 1080 × 1920 | 30 fps | 8000 kbps |

这些是本软件的建议参数，**不是平台实时上传阈值**。应用不保证免于平台二次转码，也不判断审核结果。账号的文件大小、时长和清晰度权限以[当前投稿页](https://member.bilibili.com/platform/upload/video/frame)为准。公开的[官方历史清晰度说明（2018）](https://www.bilibili.com/read/cv527957/)仅作参考，不将其历史限制当作现行规则。

- **投稿兼容处理**：要求 h.264 + aac，输出 8-bit yuv420p、双声道 48 khz 音频和约 2 秒关键帧间隔。自定义模式也可以手动启用。
- **投稿检查**：读取源视频或已经生成的成片，展示真实编码、分辨率、帧率、音频参数、时长与大小；提示 hdr、高位深、无视频流等情况。绿色版自带 ffprobe，其他发行包需要安装 ffprobe 或设置环境变量 `elaina_ffprobe` 指定其绝对路径。
- **体积估算**：读取源时长后，按目标视频与音频码率估算输出体积。估算不含封装开销，实际体积受变码率影响；流复制、无损音频等模式不提供该估算。
- **快速起播**：对 mp4 前置 moov 索引，便于边下载边播放；不承诺提高平台上传或转码速度。

预设会按比例缩放并补边；放大或提高帧率不会自动增加细节或补帧。本应用**不提供 hdr 转 sdr 的色调映射**，hdr 或高位深素材需自行确认色彩流程。所有检查在本机完成，不登录 b站账号，也不会上传文件。

## 下载与运行

### windows 绿色版（推荐）

下载 release 中的 `elaina-2.1.0-windows-x64-portable.zip`，完整解压到可写目录，双击 `elaina.exe` 即可运行。随包包含 ffmpeg 和 ffprobe，不需要配置 path、安装应用或管理员权限。需要系统已有 webview2；绿色包不安装系统组件。

应用缓存保存在同目录的 `data` 文件夹。移动时请保留 `elaina.exe`、`ffmpeg.exe`、`ffprobe.exe` 和 `portable` 标记文件；关闭应用后删除整个目录即可移除应用与缓存，已导出的媒体文件不受影响。系统运行组件自身可能保留操作系统管理的记录。

绿色版目录：

```text
elaina.exe             应用
ffmpeg.exe             媒体处理程序
ffprobe.exe            媒体参数检查
portable               绿色版标记
data/                  本地缓存（运行时写入）
readme.txt             使用说明
third-party/ffmpeg/    ffmpeg 许可和上游说明
```

### 安装包与其他平台

从 [releases](https://github.com/yukinsnow/elaina/releases) 下载对应系统的安装包。构建也会上传到 [actions](https://github.com/yukinsnow/elaina/actions/workflows/check.yml) 的 artifacts；下载 artifacts 需要登录 github。

| 系统 | 安装包 | 运行依赖 |
| --- | --- | --- |
| windows | `.exe` | webview2、ffmpeg |
| macos | `.dmg` | ffmpeg |
| linux | `.deb` | webkitgtk 4.1、ffmpeg |

**安装包及其他平台发行包不内嵌 ffmpeg，windows 绿色版已附带。** 安装含所需编码器的 ffmpeg，并将其加入系统的 `path`；也可以在启动应用前通过环境变量 `elaina_ffmpeg` 指定绝对路径。请先运行 `ffmpeg -version` 确认可用。编码器是否可用取决于所用 ffmpeg 构建。查找顺序为：`elaina_ffmpeg` 环境变量 → 应用同目录的 ffmpeg → 系统 path。

windows 示例：

```powershell
$env:elaina_ffmpeg = 'c:\tools\ffmpeg\bin\ffmpeg.exe'
# 在同一终端启动已安装的 elaina，或执行 npm start 开发运行。
```

macos / linux 示例：

```sh
export elaina_ffmpeg=/absolute/path/to/ffmpeg
```

目前未配置 windows 代码签名与 macos 签名、公证；发布包的系统验证情况以 release 说明为准。

## 使用方法

1. 在顶部选择「视频压制」「替换音频」或「提取音频」任务，点击源视频旁的「浏览…」选择文件。
2. 替换音频任务下，选择外部音轨。
3. 点击「保存到…」选择保存位置和新文件名。
4. 根据需要选择投稿预设或自定义参数，点击底部操作按钮。

默认参数沿用原版：x264、视频码率 2000 kbps、60 fps、mp3、音频码率 320 kbps、1920 × 1080、mp4。选择「复制」时忽略对应的转码参数。

容器选择会调整输出扩展名；点击「提取音频」时，输出扩展名自动改为 `.wav`。输入文件路径不会修改。音轨替换使用流复制，目标容器必须支持源音视频编码；不兼容时可改用 mkv 或先转码。

每次运行一个任务。取消或失败后可能留下不完整输出，请检查后手动删除或更换输出文件名。wav 导出不额外进行有损压缩，也无法恢复源文件已损失的细节。

## 从源码开发

需要 node.js 24+、npm、rust stable 和当前平台的 [tauri 编译依赖](https://v2.tauri.app/start/prerequisites/)：

- windows：visual studio build tools 的 c++ 桌面开发组件、windows sdk、webview2。
- macos：xcode command line tools。
- linux：webkitgtk 4.1 等系统开发库，具体包名参考上方文档和构建工作流。

```sh
git clone https://github.com/yukinsnow/elaina.git
cd elaina
npm ci
npm start
```

仅预览界面时运行 `npm run dev`，打开 http://127.0.0.1:1420。浏览器预览可以调整预设和切换任务，禁用本地文件选择、媒体探测和转码，处理媒体需要桌面运行时。若预览端口被占用，可使用 `npm run dev -- --port 1421`；桌面开发需保持配置端口 1420 可用。

## 检查与构建

```sh
npm test               # 前端参数测试
npm run build          # 类型检查与前端生产构建
npm run test:rust      # rust 参数校验与命令构造测试
npm run package        # 当前平台的桌面安装包
# windows 构建成功后，生成附带 ffmpeg 的绿色包
pwsh -File scripts/package-portable.ps1
```

安装包输出到 `src-tauri/target/release/bundle/`。各平台应在对应系统构建，架构取决于所选 rust target。构建所需的 node.js、rust 和编译工具不是安装包使用者的运行依赖。

[构建工作流](.github/workflows/check.yml) 在 windows、macos、linux 上运行测试、原生编译和打包，并上传安装包和 windows 绿色包。windows 还会使用随包 ffmpeg 和 ffprobe 执行压制、提取及替换测试，核对投稿输出编码、声道、采样率和 mp4 索引顺序。推送到 main 或手动运行工作流会触发构建；构建结果以对应 actions 运行记录为准。

## 项目结构

```text
src/main.ts                  界面与任务交互
src/model.ts                 请求类型与前端校验
src/style.css                原版风格的界面样式
src/g2.jpg                   原背景插图
src/fonts/                   原 photon 图标字体
src-tauri/src/media.rs        rust 参数校验与 ffmpeg 命令构造
src-tauri/src/main.rs         文件对话框、任务生命周期、状态事件
src-tauri/src/runtime.rs      同目录媒体工具查找与绿色版缓存目录
src-tauri/src/inspect.rs      ffprobe 媒体信息解析
scripts/package-portable.ps1  windows 绿色包生成
src-tauri/icons/             原应用图标
tests/                      前端参数测试
```

品牌、包名、应用标识、产物名和自定义文件名、标识符统一小写。多词标识符使用 snake_case。第三方固定名称保持原样，例如 `Cargo.toml`、`Cargo.lock`、`productName`、`AppHandle`；用户媒体路径保留原始大小写。

## 许可与署名

沿用原仓库声明的 GPL 许可；原仓库未指定版本，此处不额外指定版本。

- 原作者：[yukinsnow](https://github.com/yukinsnow)。
- 原角色插图署名：童心圆，[bilibili](https://space.bilibili.com/358219200)。
- elaina 角色来自《魔女之旅》，原仓库声明应用为开源非营利用途；角色与插图权利归各自权利人所有。
- 保留原应用图标、背景插图及 photon 图标字体；[原版截图](screenshot.png) 留作参考。
- 主要依赖：[tauri](https://tauri.app/)、[rust](https://www.rust-lang.org/)、[vite](https://vite.dev/)、[typescript](https://www.typescriptlang.org/)、[ffmpeg](https://ffmpeg.org/)、[photon](https://github.com/connors/photon)。
