use serde::Deserialize as deserialize;
use std::path::Path;

#[derive(Debug, deserialize)]
#[serde(deny_unknown_fields)]
pub struct request {
    pub mode: String,
    pub video: String,
    pub audio: String,
    pub output: String,
    pub video_codec: String,
    pub audio_codec: String,
    pub video_bitrate: u32,
    pub audio_bitrate: u32,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub bilibili: bool,
    #[serde(default)]
    pub faststart: bool,
}

pub fn arguments(job: &request) -> Result<Vec<String>, String> {
    let input = Path::new(&job.video);
    let output = Path::new(&job.output);
    if !input.is_absolute() || !input.is_file() {
        return Err("请选择有效的视频文件".into());
    }
    if !output.is_absolute() || !output.parent().is_some_and(Path::is_dir) {
        return Err("请选择有效的输出位置".into());
    }
    if output.exists() {
        return Err("输出文件已存在，请使用新文件名".into());
    }
    let extension = output.extension().and_then(|v| v.to_str()).unwrap_or("").to_ascii_lowercase();
    let allowed = if job.mode == "extract" { vec!["wav"] } else { vec!["mp4", "mkv", "mov", "avi", "flv"] };
    if !allowed.contains(&extension.as_str()) {
        return Err("输出扩展名与任务不匹配".into());
    }
    let mut args: Vec<String> = ["-hide_banner", "-nostdin", "-n", "-progress", "pipe:1", "-nostats", "-i"]
        .iter().map(|s| s.to_string()).collect();
    args.push(job.video.clone());
    match job.mode.as_str() {
        "encode" => {
            if job.bilibili && (job.video_codec != "libx264" || job.audio_codec != "aac") {
                return Err("投稿兼容处理需要 h.264 + aac".into());
            }
            if !["copy", "libx264", "libx265", "libxvid", "libaom-av1", "mpeg4"].contains(&job.video_codec.as_str())
                || !["copy", "aac", "flac", "libmp3lame", "pcm_s16le"].contains(&job.audio_codec.as_str()) {
                return Err("不支持的编码器".into());
            }
            args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "0:a:0?".into(), "-c:v".into(), job.video_codec.clone(), "-c:a".into(), job.audio_codec.clone()]);
            if job.video_codec != "copy" {
                if !(1..=240).contains(&job.fps) || !(64..=200000).contains(&job.video_bitrate)
                    || !(2..=16384).contains(&job.width) || !(2..=16384).contains(&job.height)
                    || job.width % 2 != 0 || job.height % 2 != 0 {
                    return Err("请检查帧率、码率与分辨率；宽高必须为偶数".into());
                }
                args.extend(["-b:v".into(), format!("{}k", job.video_bitrate), "-r".into(), job.fps.to_string(), "-vf".into(), format!("scale={}:{}:force_original_aspect_ratio=decrease,pad={}:{}:(ow-iw)/2:(oh-ih)/2,setsar=1", job.width, job.height, job.width, job.height)]);
            }
            if job.audio_codec != "copy" {
                if !(32..=1536).contains(&job.audio_bitrate) { return Err("音频码率应为 32–1536 kbps".into()); }
                args.extend(["-b:a".into(), format!("{}k", job.audio_bitrate)]);
            }
            if job.bilibili {
                args.extend(["-pix_fmt".into(), "yuv420p".into(), "-profile:v".into(), "high".into(), "-g".into(), (job.fps * 2).to_string(), "-ac".into(), "2".into(), "-ar".into(), "48000".into()]);
            }
        }
        "replace" => {
            if !Path::new(&job.audio).is_absolute() || !Path::new(&job.audio).is_file() {
                return Err("请选择有效的替换音频".into());
            }
            args.extend(["-i".into(), job.audio.clone(), "-map".into(), "0:v:0".into(), "-map".into(), "1:a:0".into(), "-c".into(), "copy".into(), "-shortest".into()]);
        }
        "extract" => args.extend(["-map".into(), "0:a:0".into(), "-vn".into(), "-c:a".into(), "pcm_s16le".into()]),
        _ => return Err("未知任务类型".into()),
    }
    if extension == "mp4" { args.extend(["-strict".into(), "-2".into()]); }
    if extension == "mp4" && job.faststart { args.extend(["-movflags".into(), "+faststart".into()]); }
    args.push(job.output.clone());
    Ok(args)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires elaina_test_ffmpeg pointing to the portable ffmpeg binary"]
    fn ffmpeg_roundtrip() {
        let executable = std::env::var_os("elaina_test_ffmpeg").expect("set elaina_test_ffmpeg");
        let directory = std::env::temp_dir().join(format!("elaina-media-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&directory).unwrap();
        let source = directory.join("source video.mp4");
        let generated = std::process::Command::new(&executable).args(["-hide_banner", "-loglevel", "error", "-nostdin", "-f", "lavfi", "-i", "testsrc2=size=64x64:rate=10:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-c:a", "aac", "-shortest"]).arg(&source).output().unwrap();
        assert!(generated.status.success(), "{}", String::from_utf8_lossy(&generated.stderr));
        let probe = std::path::Path::new(&executable).parent().unwrap().join(if cfg!(windows) { "ffprobe.exe" } else { "ffprobe" });
        let mut job = fixture();
        job.video = source.to_string_lossy().into();
        job.width = 64; job.height = 64; job.fps = 10; job.bilibili = true; job.faststart = true;
        for (mode, filename) in [("encode", "encoded video.mp4"), ("extract", "audio.wav"), ("replace", "replaced video.mkv")] {
            job.mode = mode.into();
            job.audio = directory.join("audio.wav").to_string_lossy().into();
            job.output = directory.join(filename).to_string_lossy().into();
            let result = std::process::Command::new(&executable).args(arguments(&job).unwrap()).output().unwrap();
            assert!(result.status.success(), "{mode}: {}", String::from_utf8_lossy(&result.stderr));
            assert!(std::fs::metadata(&job.output).unwrap().len() > 44);
            let metadata = crate::inspect::inspect(probe.as_os_str(), &job.output).unwrap();
            let metadata = serde_json::to_value(metadata).unwrap();
            if mode == "encode" {
                assert_eq!(metadata["video"]["codec"], "h264");
                assert_eq!(metadata["video"]["pixel_format"], "yuv420p");
                assert_eq!(metadata["audio"]["codec"], "aac");
                assert_eq!(metadata["audio"]["channels"], 2);
                assert_eq!(metadata["audio"]["sample_rate"], 48000);
                let bytes = std::fs::read(&job.output).unwrap();
                let mut offset = 0;
                let mut atoms = Vec::new();
                while offset + 8 <= bytes.len() {
                    let size = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
                    if size < 8 || offset + size > bytes.len() { break; }
                    atoms.push(String::from_utf8_lossy(&bytes[offset + 4..offset + 8]).into_owned());
                    offset += size;
                }
                assert!(atoms.iter().position(|atom| atom == "moov").unwrap() < atoms.iter().position(|atom| atom == "mdat").unwrap());
            }
        }
        std::fs::remove_dir_all(directory).unwrap();
    }
    fn fixture() -> request {
        request { mode: "encode".into(), video: std::env::current_exe().unwrap().to_string_lossy().into(), audio: String::new(), output: std::env::temp_dir().join(format!("elaina-test-{}.mp4", std::process::id())).to_string_lossy().into(), video_codec: "libx264".into(), audio_codec: "aac".into(), video_bitrate: 4000, audio_bitrate: 192, fps: 30, width: 1920, height: 1080, bilibili: false, faststart: false }
    }
    #[test]
    fn encode_preserves_argument_boundaries() {
        let job = fixture();
        let args = arguments(&job).unwrap();
        assert!(args.contains(&"-n".into()));
        assert_eq!(args.last(), Some(&job.output));
        assert!(args.contains(&job.video));
        assert!(args.contains(&"0:a:0?".into()));
    }
    #[test]
    fn copy_ignores_encoding_settings() {
        let mut job = fixture(); job.video_codec = "copy".into(); job.fps = 0;
        assert!(!arguments(&job).unwrap().contains(&"-vf".into()));
    }
    #[test]
    fn posting_options_require_compatible_codecs_and_faststart_only_for_mp4() {
        let mut job = fixture(); job.bilibili = true; job.faststart = true;
        let args = arguments(&job).unwrap();
        assert!(args.contains(&"yuv420p".into()));
        assert!(args.contains(&"48000".into()));
        assert!(args.contains(&"+faststart".into()));
        job.video_codec = "copy".into(); assert!(arguments(&job).is_err());
        job.bilibili = false;
        job.output = std::env::temp_dir().join(format!("elaina-test-{}.mkv", std::process::id())).to_string_lossy().into();
        assert!(!arguments(&job).unwrap().contains(&"+faststart".into()));
    }
    #[test]
    fn rejects_invalid_dimensions_and_codec() {
        let mut job = fixture(); job.width = 1919; assert!(arguments(&job).is_err());
        job.width = 1920; job.video_codec = "-evil".into(); assert!(arguments(&job).is_err());
    }
    #[test]
    fn extraction_requires_wav_and_existing_files_are_protected() {
        let mut job = fixture(); job.mode = "extract".into(); assert!(arguments(&job).is_err());
        job.output = std::env::current_exe().unwrap().to_string_lossy().into();
        assert!(arguments(&job).unwrap_err().contains("已存在"));
        job.output = std::env::temp_dir().join(format!("elaina-test-{}.wav", std::process::id())).to_string_lossy().into();
        assert!(arguments(&job).unwrap().contains(&"pcm_s16le".into()));
    }
}
