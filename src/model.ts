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
  if (job.mode === 'encode' && job.audio_codec !== 'copy' && (!Number.isInteger(job.audio_bitrate) || job.audio_bitrate < 32 || job.audio_bitrate > 1536)) return '音频码率应为 32–1536 kbps';
  return null;
}
