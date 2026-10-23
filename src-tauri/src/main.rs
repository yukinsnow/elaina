#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#![allow(non_camel_case_types)]

mod media;
mod runtime;
mod inspect;

use serde::Serialize as serialize;
use std::{io::{BufRead as buf_read, BufReader as buf_reader, Read as read}, process::{Child as child, Command as command, Stdio as stdio}, sync::Mutex as mutex, time::Duration as duration};
use tauri::{Emitter as emitter, Manager as manager};

#[derive(Default)]
struct task { child: Option<child>, cancelled: bool }
#[derive(Default)]
struct tasks(mutex<task>);
#[derive(Clone, serialize)]
struct update { status: String, message: String }

fn send(app: &tauri::AppHandle, status: &str, message: impl Into<String>) {
    let _ = app.emit("job-update", update { status: status.into(), message: message.into() });
}

#[tauri::command]
async fn choose_file(kind: String, format: String) -> Result<Option<String>, String> {
    let dialog = rfd::AsyncFileDialog::new();
    let selected = match kind.as_str() {
        "video" => dialog.add_filter("video", &["mp4", "mkv", "mov", "avi", "flv", "webm"]).pick_file().await,
        "audio" => dialog.add_filter("audio", &["wav", "mp3", "aac", "flac", "m4a", "alac", "aiff", "ogg"]).pick_file().await,
        "output" => {
            if !["mp4", "mkv", "mov", "avi", "flv", "wav"].contains(&format.as_str()) { return Err("不支持的输出格式".into()); }
            dialog.add_filter(&format, &[format.as_str()]).set_file_name(format!("elaina-output.{format}")).save_file().await
        }
        _ => return Err("无效的文件类型".into()),
    };
    Ok(selected.map(|file| file.path().to_string_lossy().into_owned()))
}

#[tauri::command]
async fn inspect_media(filename: String) -> Result<inspect::inspection, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let executable_path = std::env::current_exe().map_err(|e| e.to_string())?;
        let directory = executable_path.parent().ok_or("无法确定应用目录")?;
        let executable = runtime::ffprobe(directory, std::env::var_os("elaina_ffprobe"));
        inspect::inspect(&executable, &filename)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
fn start_job(app: tauri::AppHandle, state: tauri::State<'_, tasks>, job: media::request) -> Result<(), String> {
    let args = media::arguments(&job)?;
    let mut task = state.0.lock().map_err(|e| e.to_string())?;
    if task.child.is_some() { return Err("已有任务正在执行".into()); }
    let executable_path = std::env::current_exe().map_err(|e| e.to_string())?;
    let directory = executable_path.parent().ok_or("无法确定应用目录")?;
    let executable = runtime::ffmpeg(directory, std::env::var_os("elaina_ffmpeg"));
    let mut cmd = command::new(executable);
    cmd.args(args).stdin(stdio::null()).stdout(stdio::piped()).stderr(stdio::piped());
    #[cfg(windows)] {
        use std::os::windows::process::CommandExt as command_ext;
        cmd.creation_flags(0x08000000);
    }
    let mut process = cmd.spawn().map_err(|e| format!("无法启动 ffmpeg，请将其放到应用同目录、加入 path，或设置 elaina_ffmpeg：{e}"))?;
    let stdout = process.stdout.take().ok_or("无法读取任务进度")?;
    let stderr = process.stderr.take().ok_or("无法读取任务日志")?;
    task.cancelled = false;
    task.child = Some(process);
    drop(task);
    let progress_app = app.clone();
    let progress = std::thread::spawn(move || {
        for line in buf_reader::new(stdout).lines().map_while(Result::ok) {
            if let Some(time) = line.strip_prefix("out_time=") { send(&progress_app, "running", format!("已处理 {time}")); }
        }
    });
    let errors = std::thread::spawn(move || {
        let mut reader = stderr;
        let mut tail = Vec::new();
        let mut buffer = [0u8; 4096];
        while let Ok(count) = reader.read(&mut buffer) {
            if count == 0 { break; }
            tail.extend_from_slice(&buffer[..count]);
            if tail.len() > 16384 { tail.drain(..tail.len() - 16384); }
        }
        String::from_utf8_lossy(&tail).into_owned()
    });
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(duration::from_millis(100));
            let state = app.state::<tasks>();
            let mut task = state.0.lock().unwrap_or_else(|e| e.into_inner());
            let result = match task.child.as_mut() { Some(process) => process.try_wait(), None => return };
            match result {
                Ok(None) => continue,
                result => {
                    let cancelled = task.cancelled;
                    if result.is_err() {
                        if let Some(process) = task.child.as_mut() { let _ = process.kill(); let _ = process.wait(); }
                    }
                    // Keep the slot occupied until all progress messages are drained.
                    drop(task);
                    let _ = progress.join();
                    let details = errors.join().unwrap_or_default();
                    let mut task = state.0.lock().unwrap_or_else(|e| e.into_inner());
                    task.child = None;
                    if cancelled { send(&app, "cancelled", "任务已取消；如有部分输出，可手动删除"); }
                    else { match result {
                        Ok(Some(status)) if status.success() => send(&app, "done", format!("处理完成：{}", job.output)),
                        Ok(_) => send(&app, "error", format!("处理失败：{details}")),
                        Err(error) => send(&app, "error", error.to_string()),
                    }}
                    break;
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn cancel_job(state: tauri::State<'_, tasks>) -> Result<(), String> {
    let mut task = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(process) = task.child.as_mut() { process.kill().map_err(|e| e.to_string())?; task.cancelled = true; }
    Ok(())
}

fn main() {
    let mut context = tauri::generate_context!();
    if cfg!(windows) {
        if let Ok(executable) = std::env::current_exe() {
            if let Some(directory) = executable.parent().and_then(runtime::portable_data) {
                std::fs::create_dir_all(&directory).expect("failed to create portable data directory");
                context.config_mut().app.app_directories_override = Some(tauri::utils::config::AppDirectoriesOverride::Root(directory));
            }
        }
    }
    tauri::Builder::default().manage(tasks::default())
        .invoke_handler(tauri::generate_handler![choose_file, inspect_media, start_job, cancel_job])
        .build(context).expect("failed to build elaina")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app.state::<tasks>();
                if let Ok(mut task) = state.0.lock() {
                    if let Some(process) = task.child.as_mut() { let _ = process.kill(); let _ = process.wait(); }
                };
            }
        });
}
