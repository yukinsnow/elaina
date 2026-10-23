use serde::Serialize as serialize;
use serde_json::Value as value;
use std::{ffi::OsStr as os_str, path::Path as path, process::{Command as command, Stdio as stdio}};

#[derive(serialize)]
pub struct video_info { codec: String, width: u64, height: u64, fps: f64, pixel_format: String, transfer: String }
#[derive(serialize)]
pub struct audio_info { codec: String, channels: u64, sample_rate: u64 }
#[derive(serialize)]
pub struct inspection { duration: f64, size: u64, format: String, video: Option<video_info>, audio: Option<audio_info> }

fn text(item: &value, key: &str) -> String { item[key].as_str().unwrap_or("").into() }
fn fraction(input: &str) -> f64 {
    let mut parts = input.split('/');
    let numerator = parts.next().and_then(|part| part.parse::<f64>().ok()).unwrap_or(0.0);
    let denominator = parts.next().and_then(|part| part.parse::<f64>().ok()).unwrap_or(1.0);
    let result = numerator / denominator;
    if result.is_finite() && result > 0.0 { result } else { 0.0 }
}
fn parse(bytes: &[u8], size: u64) -> Result<inspection, String> {
    let metadata: value = serde_json::from_slice(bytes).map_err(|_| "媒体探测返回了无效数据")?;
    let streams = metadata["streams"].as_array().ok_or("未能读取媒体流")?;
    let video = streams.iter().find(|stream| stream["codec_type"] == "video").map(|stream| video_info {
        codec: text(stream, "codec_name"), width: stream["width"].as_u64().unwrap_or(0), height: stream["height"].as_u64().unwrap_or(0),
        fps: fraction(&text(stream, "avg_frame_rate")), pixel_format: text(stream, "pix_fmt"), transfer: text(stream, "color_transfer"),
    });
    let audio = streams.iter().find(|stream| stream["codec_type"] == "audio").map(|stream| audio_info {
        codec: text(stream, "codec_name"), channels: stream["channels"].as_u64().unwrap_or(0), sample_rate: text(stream, "sample_rate").parse().unwrap_or(0),
    });
    let duration = fraction(&text(&metadata["format"], "duration"));
    Ok(inspection { duration, size, format: text(&metadata["format"], "format_name"), video, audio })
}

pub fn inspect(executable: &os_str, filename: &str) -> Result<inspection, String> {
    let input = path::new(filename);
    if !input.is_absolute() || !input.is_file() { return Err("请选择有效的本地媒体文件".into()); }
    let size = std::fs::metadata(input).map_err(|e| e.to_string())?.len();
    let mut cmd = command::new(executable);
    cmd.args(["-v", "error", "-protocol_whitelist", "file,pipe", "-probesize", "10000000", "-analyzeduration", "10000000", "-show_entries", "format=duration,format_name:stream=codec_type,codec_name,width,height,avg_frame_rate,pix_fmt,color_transfer,channels,sample_rate", "-of", "json", "-i", filename]).stdin(stdio::null());
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt as command_ext;
        cmd.creation_flags(0x08000000);
    }
    let result = cmd.output().map_err(|e| format!("无法启动 ffprobe；请保留绿色包中的 ffprobe.exe，或设置 elaina_ffprobe：{e}"))?;
    if !result.status.success() { return Err(format!("无法读取媒体：{}", String::from_utf8_lossy(&result.stderr).chars().take(1500).collect::<String>())); }
    parse(&result.stdout, size)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_fractional_fps_and_missing_audio() {
        let result = parse(br#"{"format":{"duration":"12.5","format_name":"mov,mp4"},"streams":[{"codec_type":"video","codec_name":"h264","width":1920,"height":1080,"avg_frame_rate":"30000/1001","pix_fmt":"yuv420p"}]}"#, 12345).unwrap();
        assert_eq!(result.size, 12345);
        assert_eq!(result.duration, 12.5);
        assert!((result.video.unwrap().fps - 29.97003).abs() < 0.0001);
        assert!(result.audio.is_none());
    }
    #[test]
    fn unknown_duration_and_zero_denominator_are_not_nan() {
        let result = parse(br#"{"format":{"duration":"N/A"},"streams":[{"codec_type":"video","avg_frame_rate":"0/0"},{"codec_type":"audio","codec_name":"aac","sample_rate":"48000","channels":2}]}"#, 0).unwrap();
        assert_eq!(result.duration, 0.0);
        assert_eq!(result.video.unwrap().fps, 0.0);
        assert_eq!(result.audio.unwrap().sample_rate, 48000);
        assert!(parse(b"not json", 0).is_err());
    }
}
