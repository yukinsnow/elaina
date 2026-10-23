param(
    [string]$binary = 'src-tauri/target/release/elaina.exe',
    [string]$destination = 'artifacts'
)
$ErrorActionPreference = 'Stop'
$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
$ffmpeg_version = '9.0.2'
$ffmpeg_url = "https://github.com/GyanD/codexffmpeg/releases/download/$ffmpeg_version/ffmpeg-$ffmpeg_version-essentials_build.zip"
$ffmpeg_hash = '60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba'
$binary_path = (Resolve-Path -LiteralPath $binary).Path
$build_directory = Join-Path (Get-Location).Path ('work/portable/' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $build_directory -Force
$download = Join-Path $build_directory 'ffmpeg.zip'
Invoke-WebRequest -Uri $ffmpeg_url -OutFile $download
if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant() -ne $ffmpeg_hash) {
    throw 'ffmpeg download checksum mismatch'
}
Expand-Archive -LiteralPath $download -DestinationPath (Join-Path $build_directory 'upstream')
$upstream = Join-Path $build_directory "upstream/ffmpeg-$ffmpeg_version-essentials_build"
$package = Join-Path $build_directory 'elaina'
$notices = Join-Path $package 'third-party/ffmpeg'
$null = New-Item -ItemType Directory -Path $notices -Force
$null = New-Item -ItemType Directory -Path (Join-Path $package 'data') -Force
Copy-Item -LiteralPath $binary_path -Destination (Join-Path $package 'elaina.exe')
Copy-Item -LiteralPath (Join-Path $upstream 'bin/ffmpeg.exe') -Destination (Join-Path $package 'ffmpeg.exe')
Copy-Item -LiteralPath (Join-Path $upstream 'bin/ffprobe.exe') -Destination (Join-Path $package 'ffprobe.exe')
foreach ($notice in (Get-ChildItem -LiteralPath $upstream -File | Where-Object { $_.Name -match '^(license|readme)' })) {
    Copy-Item -LiteralPath $notice.FullName -Destination (Join-Path $notices $notice.Name.ToLowerInvariant())
}
if (-not (Get-ChildItem -LiteralPath $notices -File | Where-Object { $_.Name -match '^license' })) {
    throw 'upstream ffmpeg license is missing'
}
Set-Content -LiteralPath (Join-Path $package 'portable') -Value '' -NoNewline -Encoding utf8
@"
elaina $version - windows x64 portable

解压整个 elaina 文件夹到有写入权限的位置，双击 elaina.exe。
附带 ffmpeg，无需配置 path 或管理员权限，不创建安装记录和快捷方式。
系统需要已有 microsoft webview2 runtime；本包不安装系统组件。
应用缓存保存在本目录的 data 文件夹，移动时请一并移动。
关闭程序后删除此文件夹即可移除应用及其缓存（导出的媒体文件保留在你选择的位置）。

不要删除或拆开 elaina.exe、ffmpeg.exe、ffprobe.exe 和 portable 标记文件。
如设置了 elaina_ffmpeg 环境变量，该路径会优先于随包 ffmpeg。

项目及源码：https://github.com/yukinsnow/elaina
应用许可沿用项目原有 GPL 声明；插图与图标署名见项目 readme。
ffmpeg 的许可与上游说明位于 third-party/ffmpeg/。
ffmpeg 二进制：$ffmpeg_url
ffmpeg 上游构建：https://www.gyan.dev/ffmpeg/builds/
ffmpeg 源码：https://ffmpeg.org/releases/ffmpeg-$ffmpeg_version.tar.xz
构建说明与依赖源码信息参见上游 readme 和 https://www.gyan.dev/ffmpeg/builds/ 。

此包未配置代码签名。
"@ | Set-Content -LiteralPath (Join-Path $package 'readme.txt') -Encoding utf8
$ffmpeg_output = & (Join-Path $package 'ffmpeg.exe') -version
if ($LASTEXITCODE -ne 0) { throw 'bundled ffmpeg failed to start' }
$ffmpeg_output | Select-Object -First 1
$null = New-Item -ItemType Directory -Path $destination -Force
$archive_path = Join-Path (Resolve-Path -LiteralPath $destination).Path "elaina-$version-windows-x64-portable.zip"
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($package, $archive_path)
$checksum = (Get-FileHash -LiteralPath $archive_path -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$archive_path.sha256" -Value "$checksum  $([System.IO.Path]::GetFileName($archive_path))" -Encoding ascii
Write-Output "portable archive: $archive_path"
# The following cargo smoke test uses this same binary, not a system installation.
if ($env:GITHUB_ENV) {
    Add-Content -LiteralPath $env:GITHUB_ENV -Value "elaina_test_ffmpeg=$(Join-Path $package 'ffmpeg.exe')" -Encoding utf8
}
