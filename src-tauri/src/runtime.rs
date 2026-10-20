use std::{ffi::OsString as os_string, path::{Path as path, PathBuf as path_buf}};

pub fn ffmpeg(directory: &path, override_path: Option<os_string>) -> os_string {
    if let Some(value) = override_path.filter(|value| !value.is_empty()) { return value; }
    let bundled = directory.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
    if bundled.is_file() { return bundled.into_os_string(); }
    "ffmpeg".into()
}

pub fn portable_data(directory: &path) -> Option<path_buf> {
    directory.join("portable").is_file().then(|| directory.join("data"))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_ffmpeg_has_priority() {
        assert_eq!(ffmpeg(path::new("."), Some("custom-ffmpeg".into())), os_string::from("custom-ffmpeg"));
    }
    #[test]
    fn bundled_ffmpeg_and_portable_marker() {
        let directory = std::env::temp_dir().join(format!("elaina-runtime-{}", std::process::id()));
        std::fs::create_dir_all(&directory).unwrap();
        assert_eq!(ffmpeg(&directory, None), os_string::from("ffmpeg"));
        assert_eq!(portable_data(&directory), None);
        let binary = directory.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
        std::fs::write(&binary, []).unwrap();
        std::fs::write(directory.join("portable"), []).unwrap();
        assert_eq!(ffmpeg(&directory, None), binary.into_os_string());
        assert_eq!(portable_data(&directory), Some(directory.join("data")));
        std::fs::remove_dir_all(directory).unwrap();
    }
}
