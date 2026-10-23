import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validate, apply_preset, output_path, estimated_size, upload_checks } from '../src/model.ts';

const fixture = () => ({ mode: 'encode', video: 'c:/media/input.mp4', audio: '', output: 'c:/media/output.mp4', video_codec: 'libx264', audio_codec: 'aac', video_bitrate: 4000, audio_bitrate: 192, fps: 30, width: 1920, height: 1080, bilibili: false, faststart: true });
test('accepts normal encoding and validates required paths', () => {
  assert.equal(validate(fixture()), null);
  assert.match(validate({ ...fixture(), video: '' }), /视频/);
  assert.match(validate({ ...fixture(), output: '' }), /输出/);
  assert.match(validate({ ...fixture(), output: fixture().video }), /相同/);
});
test('posting presets configure codecs and preserve source paths', () => {
  const original = { ...fixture(), output: 'c:/Mixed.Folder/成片.mkv', video_codec: 'copy' };
  const job = apply_preset(original, 'portrait');
  assert.equal(job.video, original.video);
  assert.equal(job.output, 'c:/Mixed.Folder/成片.mp4');
  assert.deepEqual([job.width, job.height, job.video_codec, job.audio_codec, job.audio_bitrate, job.bilibili, job.faststart], [1080, 1920, 'libx264', 'aac', 320, true, true]);
  assert.equal(original.video_codec, 'copy');
  assert.match(validate({ ...job, video_codec: 'copy' }), /h.264/);
});
test('extension changes preserve dotted folders and empty output', () => {
  assert.equal(output_path('c:\\Mixed.Folder\\成片', 'mp4'), 'c:\\Mixed.Folder\\成片.mp4');
  assert.equal(output_path('', 'mp4'), '');
});
test('size estimate is unavailable for stream copy and lossless audio', () => {
  assert.equal(estimated_size(fixture(), 60), 31440000);
  assert.equal(estimated_size({ ...fixture(), video_codec: 'copy' }, 60), null);
  assert.equal(estimated_size({ ...fixture(), audio_codec: 'flac' }, 60), null);
});
test('preflight flags hdr and missing video without claiming upload approval', () => {
  const media = { duration: 60, size: 1024, format: 'mov,mp4', video: { codec: 'hevc', width: 3840, height: 2160, fps: 60, pixel_format: 'yuv420p10le', transfer: 'smpte2084' }, audio: null };
  assert.ok(upload_checks(media).some(check => check.level === 'warning' && check.detail.includes('hdr')));
  assert.ok(upload_checks({ ...media, video: null }).some(check => check.label === '视频流' && check.level === 'warning'));
  assert.ok(upload_checks(media).some(check => check.label === '上传额度' && check.detail.includes('账号')));
});
test('rejects invalid numeric settings', () => {
  for (const invalid of [{ fps: 0 }, { fps: 30.5 }, { video_bitrate: NaN }, { width: 1919 }, { height: 20000 }, { audio_bitrate: 0 }]) assert.ok(validate({ ...fixture(), ...invalid }));
});
test('copy skips irrelevant encoding controls', () => {
  assert.equal(validate({ ...fixture(), video_codec: 'copy', audio_codec: 'copy', fps: 0, audio_bitrate: 0, width: 1 }), null);
});
test('audio replacement requires another input', () => {
  assert.match(validate({ ...fixture(), mode: 'replace' }), /音频/);
  assert.equal(validate({ ...fixture(), mode: 'replace', audio: 'c:/media/music.flac' }), null);
});
test('extraction requires wav and ignores encoding settings', () => {
  assert.match(validate({ ...fixture(), mode: 'extract' }), /wav/);
  assert.equal(validate({ ...fixture(), mode: 'extract', output: 'c:/media/audio.wav', fps: 0 }), null);
});
