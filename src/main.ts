import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn as unlisten_fn } from '@tauri-apps/api/event';
import { validate, apply_preset, output_path, presets, estimated_size, upload_checks, type mode, type request, type inspection } from './model';
import icon from '../src-tauri/icons/icon.png';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
<div class="window">
  <header class="app-header"><div class="brand"><img src="${icon}" alt="elaina 应用图标" width="42" height="42"/><div><h1>elaina</h1><p>视频与音频处理</p></div></div><span class="local-label">本地处理</span></header>
  <div class="workbench">
    <nav class="mode-tabs" aria-label="处理任务"><button type="button" data-mode="encode" aria-pressed="true">视频压制</button><button type="button" data-mode="replace" aria-pressed="false">替换音频</button><button type="button" data-mode="extract" aria-pressed="false">提取音频</button></nav>
    <form id="job-form" class="workspace" novalidate>
      <section class="file-section" aria-label="文件选择">
        <label for="video">源视频</label><div class="file-row"><input id="video" placeholder="选择视频，或输入完整路径"/><button type="button" data-pick="video">浏览…</button></div>
        <p id="source-info" class="field-note">支持 mp4、mkv、mov 等常见格式。</p>
        <div id="audio-field" hidden><label for="audio">替换音频</label><div class="file-row"><input id="audio" placeholder="选择要替换的音轨"/><button type="button" data-pick="audio">浏览…</button></div><p class="field-note">复制原视频与新音轨，时长以较短输入为准。</p></div>
        <div class="output-label"><label for="output">输出文件</label><label id="format-field" class="format-field">容器<select id="format"><option>mp4</option><option>mkv</option><option>flv</option><option>mov</option><option>avi</option></select></label></div><div class="file-row"><input id="output" placeholder="选择保存位置与新文件名"/><button type="button" data-pick="output">保存到…</button></div>
        <p id="output-note" class="field-note">已有文件不会被覆盖。</p>
      </section>
      <section id="encoding" class="encoding-section">
        <div class="section-title"><h2>编码设置</h2><span id="preset-note">自定义参数</span></div>
        <label class="preset-field" for="preset"><span>投稿预设</span><select id="preset"><option value="custom">自定义</option>${Object.entries(presets).map(([key, value]) => `<option value="${key}">${value.label}</option>`).join('')}</select></label>
        <div class="settings-grid">
          <label>视频编码<select id="video_codec"><option value="libx264">h.264 / x264</option><option value="libx265">h.265 / x265</option><option value="libxvid">xvid</option><option value="libaom-av1">av1</option><option value="mpeg4">mpeg4</option><option value="copy">复制视频流</option></select></label>
          <label>视频码率 <span class="unit">kbps</span><input id="video_bitrate" type="number" min="64" max="200000" value="2000"/></label>
          <label>帧率 <span class="unit">fps</span><input id="fps" type="number" min="1" max="240" value="60"/></label>
          <label>音频编码<select id="audio_codec"><option value="libmp3lame">mp3</option><option value="aac">aac</option><option value="flac">flac</option><option value="pcm_s16le">pcm</option><option value="copy">复制音频流</option></select></label>
          <label>音频码率 <span class="unit">kbps</span><input id="audio_bitrate" type="number" min="32" max="1536" value="320"/></label>
          <div class="resolution-field"><span class="field-label">分辨率 <span class="unit">px</span></span><div class="resolution"><input aria-label="视频宽度" id="width" type="number" min="2" max="16384" step="2" value="1920"/><span>×</span><input aria-label="视频高度" id="height" type="number" min="2" max="16384" step="2" value="1080"/></div></div>
        </div>
        <label class="checkbox-row"><input id="bilibili" type="checkbox"/><span>投稿兼容处理<small>h.264 · aac · 8-bit yuv420p · 双声道 / 48 khz · 2 秒关键帧</small></span></label>
        <p id="estimate" class="field-note">保持画面比例，缩放时自动补边。</p>
      </section>
      <label id="faststart-field" class="checkbox-row compact"><input id="faststart" type="checkbox" checked/><span>mp4 快速起播<small>将索引前置，便于边下载边播放。</small></span></label>
      <details class="inspection" id="inspection-panel"><summary>投稿检查<span id="inspection-summary">未检查</span></summary><div class="inspection-body"><div class="inspect-actions"><button type="button" id="inspect-source">检查源视频</button><button type="button" id="inspect-output">检查成片</button></div><p id="inspection-info" class="field-note">读取实际媒体参数，辅助检查；不代表平台审核结果。</p><ul id="inspection-results"></ul></div></details>
    </form>
    <footer class="action-bar"><div class="status-block"><strong id="status-title">准备就绪</strong><p id="status" role="status" aria-live="polite">选择视频和输出位置。</p></div><button type="button" id="cancel" hidden>取消</button><button type="submit" form="job-form" class="primary" id="submit">开始压制</button></footer>
  </div>
</div>`;

function element<t extends HTMLElement>(id: string): t { return document.getElementById(id) as t; }
const input = (id: string) => element<HTMLInputElement>(id);
let current_mode: mode = 'encode';
let busy = false;
let inspecting = false;
let native_ready = false;
let source_info: inspection | undefined;
let inspect_generation = 0;
let unsubscribe: unlisten_fn | undefined;
const actions = { encode: '开始压制', replace: '替换音频', extract: '提取音频' };

function status(title: string, message: string, state = '') {
  element('status-title').textContent = title;
  element('status').textContent = message;
  element('status').dataset.state = state;
}
function job_values(): request {
  const video_encoding = current_mode === 'encode' && input('video_codec').value !== 'copy';
  const audio_encoding = current_mode === 'encode' && input('audio_codec').value !== 'copy';
  return { mode: current_mode, video: input('video').value, audio: input('audio').value, output: input('output').value,
    video_codec: input('video_codec').value, audio_codec: input('audio_codec').value,
    video_bitrate: video_encoding ? Number(input('video_bitrate').value) : 2000, audio_bitrate: audio_encoding ? Number(input('audio_bitrate').value) : 320,
    fps: video_encoding ? Number(input('fps').value) : 60, width: video_encoding ? Number(input('width').value) : 1920, height: video_encoding ? Number(input('height').value) : 1080,
    bilibili: input('bilibili').checked, faststart: input('faststart').checked };
}
function file_size(bytes: number): string { return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} gb` : `${(bytes / 1024 ** 2).toFixed(1)} mb`; }
function media_summary(media: inspection): string {
  const seconds = Math.round(media.duration);
  const time = seconds > 0 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : '时长未知';
  return `${media.video ? `${media.video.width} × ${media.video.height} · ${media.video.fps > 0 ? media.video.fps.toFixed(2) : "未知"} fps · ` : ''}${time} · ${file_size(media.size)}`;
}
function estimate() {
  const job = job_values();
  const size = source_info ? estimated_size(job, source_info.duration) : null;
  const notes = ['保持比例缩放并补边。'];
  if (size !== null) notes.push(`预计输出约 ${file_size(size)}（按目标码率估算，不含封装开销）。`);
  const video = source_info?.video;
  if (video && (job.width > video.width || job.height > video.height)) notes.push('输出高于源分辨率，放大不会增加细节。');
  if (video && video.fps > 0 && job.fps > video.fps + 0.1) notes.push('升帧只会复制帧，不会自动补帧。');
  element('estimate').textContent = notes.join(' ');
}
function reset_inspection() {
  inspect_generation++; inspecting = false;
  element('inspection-summary').textContent = '待重新检查';
  element('inspection-info').textContent = '读取实际媒体参数，辅助检查；不代表平台审核结果。';
  element('inspection-results').replaceChildren();
}
function set_output(path: string) {
  if (input('output').value !== path) { input('output').value = path; reset_inspection(); }
}
function controls() {
  root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select').forEach(control => { control.disabled = busy; });
  element<HTMLButtonElement>('cancel').disabled = false;
  element('cancel').hidden = !busy;
  if (!busy) {
    for (const id of ['video_bitrate', 'fps', 'width', 'height']) input(id).disabled = input('video_codec').value === 'copy';
    input('audio_bitrate').disabled = input('audio_codec').value === 'copy';
    input('faststart').disabled = input('format').value !== 'mp4';
  }
  element<HTMLButtonElement>('inspect-source').disabled = busy || inspecting || !native_ready || !input('video').value.trim();
  element<HTMLButtonElement>('inspect-output').disabled = busy || inspecting || !native_ready || !input('output').value.trim();
  if (current_mode !== 'encode') element('encoding').querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach(control => { control.disabled = true; });
  if (!native_ready) root.querySelectorAll<HTMLButtonElement>('[data-pick], #submit').forEach(button => { button.disabled = true; });
}
async function inspect_file(target: 'video' | 'output', expand = true) {
  const filename = input(target).value;
  if (!filename.trim() || !native_ready) return;
  const generation = ++inspect_generation;
  inspecting = true; controls();
  element('inspection-summary').textContent = '检查中…';
  if (expand) element<HTMLDetailsElement>('inspection-panel').open = true;
  try {
    const media = await invoke<inspection>('inspect_media', { filename });
    if (generation !== inspect_generation || input(target).value !== filename) return;
    if (target === 'video') { source_info = media; element('source-info').textContent = media_summary(media); estimate(); }
    const checks = upload_checks(media);
    element('inspection-info').textContent = `${target === 'video' ? '源视频' : '成片'} · ${media_summary(media)}`;
    element('inspection-results').replaceChildren();
    for (const check of checks) {
      const row = document.createElement('li'); row.dataset.level = check.level;
      const title = document.createElement('strong'); title.textContent = check.label;
      const detail = document.createElement('span'); detail.textContent = check.detail;
      row.append(title, detail); element('inspection-results').append(row);
    }
    const count = checks.filter(check => check.level === 'warning').length;
    element('inspection-summary').textContent = count ? `${count} 项需留意` : '参数已读取';
  } catch (error) {
    if (generation !== inspect_generation) return;
    element('inspection-summary').textContent = '未能检查';
    element('inspection-info').textContent = String(error);
    element('inspection-results').replaceChildren();
  } finally {
    if (generation === inspect_generation) { inspecting = false; controls(); }
  }
}
root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => {
  current_mode = button.dataset.mode as mode;
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  element('audio-field').hidden = current_mode !== 'replace';
  element('encoding').hidden = current_mode !== 'encode';
  element('faststart-field').hidden = current_mode === 'extract';
  element('format-field').hidden = current_mode === 'extract';
  element('submit').textContent = actions[current_mode];
  element('output-note').textContent = current_mode === 'extract' ? '输出为 wav；已有文件不会被覆盖。' : '已有文件不会被覆盖。';
  if (input('output').value) set_output(output_path(input('output').value, current_mode === 'extract' ? 'wav' : input('format').value));
  controls();
}));
root.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach(button => button.addEventListener('click', async () => {
  try {
    const kind = button.dataset.pick!;
    const format = current_mode === 'extract' ? 'wav' : input('format').value;
    const path = await invoke<string | null>('choose_file', { kind, format });
    if (path) { input(kind).value = path; reset_inspection(); controls(); if (kind === 'video') { source_info = undefined; void inspect_file('video', false); } }
  } catch (error) { status('选择失败', String(error), 'error'); }
}));
input('preset').addEventListener('change', () => {
  const key = input('preset').value;
  if (key === 'custom') { element('preset-note').textContent = '自定义参数'; return; }
  const job = apply_preset(job_values(), key);
  for (const id of ['video_codec', 'audio_codec', 'video_bitrate', 'audio_bitrate', 'fps', 'width', 'height'] as const) input(id).value = String(job[id]);
  set_output(job.output);
  input('format').value = 'mp4'; input('bilibili').checked = true; input('faststart').checked = true;
  element('preset-note').textContent = '软件建议参数，可继续调整';
  controls(); estimate();
});
for (const id of ['video_codec', 'audio_codec', 'video_bitrate', 'audio_bitrate', 'fps', 'width', 'height', 'format', 'bilibili']) input(id).addEventListener('change', () => {
  input('preset').value = 'custom'; element('preset-note').textContent = '自定义参数';
  if (id === 'format' && input('output').value) set_output(output_path(input('output').value, input('format').value));
  controls(); estimate();
});
for (const id of ['video', 'output']) input(id).addEventListener('input', () => {
  if (id === 'video') { source_info = undefined; element('source-info').textContent = '源路径已更改，可重新检查视频。'; estimate(); }
  reset_inspection();
  controls();
});
element('inspect-source').addEventListener('click', () => { void inspect_file('video'); });
element('inspect-output').addEventListener('click', () => { void inspect_file('output'); });
element('job-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !native_ready) return;
  const extension = current_mode === 'extract' ? 'wav' : input('format').value;
  set_output(output_path(input('output').value, extension));
  const job = job_values();
  const error = validate(job);
  if (error) { status('请检查设置', error, 'error'); return; }
  busy = true; controls(); status('正在启动', '正在准备 ffmpeg…', 'running');
  try { await invoke('start_job', { job }); }
  catch (error) { busy = false; controls(); status('启动失败', String(error), 'error'); }
});
element('cancel').addEventListener('click', async () => {
  try { await invoke('cancel_job'); status('正在取消', '等待任务退出…', 'running'); }
  catch (error) { status('取消失败', String(error), 'error'); }
});
async function initialize() {
  try {
    unsubscribe = await listen<{ status: string; message: string }>('job-update', event => {
      const { status: state, message } = event.payload;
      if (state !== 'running') { busy = false; controls(); }
      status(({ running: '正在处理', done: '处理完成', cancelled: '已取消', error: '处理失败' } as Record<string, string>)[state] ?? state, message, state);
      if (state === 'done' && current_mode !== 'extract') void inspect_file('output', false);
    });
    native_ready = true; controls();
  } catch { status('界面预览', '桌面版支持本地媒体处理与投稿检查。'); }
}
window.addEventListener('beforeunload', () => unsubscribe?.());
controls(); void initialize();
