import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { validate } from '../src/model.ts';

const fixture = () => ({ mode: 'encode', video: 'c:/media/input.mp4', audio: '', output: 'c:/media/output.mp4', video_codec: 'libx264', audio_codec: 'aac', video_bitrate: 4000, audio_bitrate: 192, fps: 30, width: 1920, height: 1080 });
test('accepts normal encoding and validates required paths', () => {
  assert.equal(validate(fixture()), null);
  assert.match(validate({ ...fixture(), video: '' }), /视频/);
  assert.match(validate({ ...fixture(), output: '' }), /输出/);
  assert.match(validate({ ...fixture(), output: fixture().video }), /相同/);
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
