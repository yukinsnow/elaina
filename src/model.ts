export type mode = 'encode' | 'replace' | 'extract';
export interface request {
  mode: mode;
  video: string;
  audio: string;
  output: string;
  video_codec: string;
  audio_codec: string;
  video_bitrate: number;
  audio_bitrate: number;
  fps: number;
  width: number;
  height: number;
  bilibili: boolean;
  faststart: boolean;
}

export function validate(job: request): string | null {
  if (!job.video.trim()) return '请先选择视频文件';
  if (job.mode === 'replace' && !job.audio.trim()) return '请选择用于替换的音频文件';
  if (!job.output.trim()) return '请选择输出文件位置';
  if (job.video === job.output || job.audio === job.output) return '输出文件不能与输入文件相同';
  const extension = job.output.split('.').pop()?.toLowerCase();
  if (job.mode === 'extract' ? extension !== 'wav' : !['mp4', 'mkv', 'mov', 'avi', 'flv'].includes(extension ?? '')) {
    return job.mode === 'extract' ? '提取音频请选择 .wav 文件' : '输出格式支持 mp4、mkv、mov、avi、flv';
  }
  if (job.mode === 'encode' && job.video_codec !== 'copy') {
    if (!Number.isInteger(job.fps) || job.fps < 1 || job.fps > 240) return '帧率应为 1–240 的整数';
    if (!Number.isInteger(job.video_bitrate) || job.video_bitrate < 64 || job.video_bitrate > 200000) return '视频码率应为 64–200000 kbps';
    if ([job.width, job.height].some(value => !Number.isInteger(value) || value < 2 || value > 16384 || value % 2 !== 0)) return '分辨率宽高应为 2–16384 的偶数';
  }
  if (job.mode === 'encode' && job.bilibili && (job.video_codec !== 'libx264' || job.audio_codec !== 'aac')) return '投稿兼容处理需要 h.264 + aac，请应用投稿预设或调整编码器';
  if (job.mode === 'encode' && job.audio_codec !== 'copy' && (!Number.isInteger(job.audio_bitrate) || job.audio_bitrate < 32 || job.audio_bitrate > 1536)) return '音频码率应为 32–1536 kbps';
  return null;
}

export interface inspection {
  duration: number;
  size: number;
  format: string;
  video: { codec: string; width: number; height: number; fps: number; pixel_format: string; transfer: string } | null;
  audio: { codec: string; channels: number; sample_rate: number } | null;
}

export const presets = {
  '1080p30': { label: 'b站 · 1080p / 30 fps', width: 1920, height: 1080, fps: 30, video_bitrate: 8000 },
  '1080p60': { label: 'b站 · 1080p / 60 fps', width: 1920, height: 1080, fps: 60, video_bitrate: 12000 },
  '2160p30': { label: 'b站 · 4k / 30 fps', width: 3840, height: 2160, fps: 30, video_bitrate: 20000 },
  'portrait': { label: 'b站 · 竖屏 1080p / 30 fps', width: 1080, height: 1920, fps: 30, video_bitrate: 8000 }
};

export function apply_preset(job: request, key: string): request {
  const preset = presets[key as keyof typeof presets];
  if (!preset) return { ...job };
  return { ...job, width: preset.width, height: preset.height, fps: preset.fps, video_bitrate: preset.video_bitrate, video_codec: 'libx264', audio_codec: 'aac', audio_bitrate: 320, bilibili: true, faststart: true, output: output_path(job.output, 'mp4') };
}

export function output_path(path: string, extension: string): string {
  if (!path.trim()) return '';
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const dot = path.lastIndexOf('.');
  return `${dot > separator ? path.slice(0, dot) : path}.${extension}`;
}

export function estimated_size(job: request, duration: number): number | null {
  if (job.mode !== 'encode' || job.video_codec === 'copy' || !['aac', 'libmp3lame'].includes(job.audio_codec) || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(job.video_bitrate + job.audio_bitrate)) return null;
  return duration * (job.video_bitrate + job.audio_bitrate) * 1000 / 8;
}

export interface check { level: 'ok' | 'info' | 'warning'; label: string; detail: string }
export function upload_checks(media: inspection): check[] {
  const video = media.video;
  const audio = media.audio;
  const checks: check[] = [];
  if (!video) checks.push({ level: 'warning', label: '视频流', detail: '没有检测到视频流，请选择包含画面的视频。' });
  else {
    checks.push({ level: video.codec === 'h264' ? 'ok' : 'info', label: '视频编码', detail: video.codec === 'h264' ? 'h.264，适合通用投稿准备。' : `${video.codec || '未知'}，可使用 h.264 投稿预设统一编码。` });
    checks.push({ level: 'info', label: '画面参数', detail: `${video.width} × ${video.height} · ${video.fps > 0 ? video.fps.toFixed(2) : '未知'} fps` });
    const hdr = ['smpte2084', 'arib-std-b67'].includes(video.transfer);
    checks.push({ level: hdr || video.pixel_format !== 'yuv420p' ? 'warning' : 'ok', label: '色彩', detail: hdr ? '检测到 hdr。投稿预设不提供 hdr 转 sdr 色调映射，请先确认色彩处理。' : video.pixel_format === 'yuv420p' ? '8-bit yuv420p。' : `${video.pixel_format || '未知像素格式'}；投稿兼容处理输出 8-bit yuv420p，请注意高位深素材的色彩。` });
  }
  checks.push(audio ? { level: audio.codec === 'aac' && audio.channels <= 2 && audio.channels > 0 ? 'ok' : 'info', label: '音频', detail: `${audio.codec || '未知'} · ${audio.channels || '未知'} 声道 · ${audio.sample_rate || '未知'} hz。投稿预设输出 aac / 双声道 / 48 khz。` } : { level: 'info', label: '音频', detail: '未检测到音轨，请确认这是预期的静音视频。' });
  checks.push({ level: media.format.split(',').includes('mp4') ? 'ok' : 'info', label: '封装', detail: media.format.split(',').includes('mp4') ? 'mp4 / mov 系列封装；导出时可选择 mp4。' : `${media.format || '未知'}；可导出为 mp4 以统一工作流。` });
  checks.push({ level: 'info', label: '上传额度', detail: '文件大小与时长额度以你账号的当前投稿页为准。本检查不判断审核结果或二次压制。' });
  return checks;
}
