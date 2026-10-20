import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn as unlisten_fn } from '@tauri-apps/api/event';
import { validate, type mode, type request } from './model';
import icon from '../src-tauri/icons/icon.png';
import './style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <div class="window">
    <header class="toolbar"><img src="${icon}" alt="" width="18" height="18"/><h1>elaina</h1></header>
    <form id="job-form" class="workspace">
      <div class="fields">
        <div class="file-row"><input id="video" aria-label="视频文件" placeholder="请选择视频文件"/><button type="button" data-pick="video">视频</button></div>
        <div class="file-row"><input id="audio" aria-label="替换音频" placeholder="如需替换音频请选择"/><button type="button" data-pick="audio">音频</button></div>
        <div class="file-row"><input id="output" aria-label="输出文件路径" placeholder="设置输出文件路径"/><button type="button" data-pick="output">输出</button></div>
        <div class="setting-row video-settings">
          <label for="video_codec">视频编码</label><select id="video_codec"><option value="libx264">x264</option><option value="libx265">x265</option><option value="libxvid">xvid</option><option value="libaom-av1">av1</option><option value="mpeg4">mpeg4</option><option value="copy">复制</option></select>
          <label for="video_bitrate">视频码率</label><input id="video_bitrate" type="number" min="64" max="200000" value="2000" title="视频码率（kbps）"/>
          <label for="fps">编码帧数</label><input id="fps" type="number" min="1" max="240" value="60" title="帧率（fps）"/>
        </div>
        <div class="setting-row audio-settings">
          <label for="audio_codec">音频编码</label><select id="audio_codec"><option value="libmp3lame">mp3</option><option value="aac">aac</option><option value="flac">flac</option><option value="pcm_s16le">pcm</option><option value="copy">复制</option></select>
          <label for="audio_bitrate">音频码率</label><input id="audio_bitrate" type="number" min="32" max="1536" value="320" title="音频码率（kbps）"/>
        </div>
        <div class="setting-row resolution"><span>分辨率：</span><input aria-label="视频宽度" id="width" type="number" min="2" max="16384" step="2" value="1920"/><span>×</span><input aria-label="视频高度" id="height" type="number" min="2" max="16384" step="2" value="1080"/></div>
        <div class="setting-row container-row"><label for="format">容器</label><select id="format"><option>mp4</option><option>mkv</option><option>flv</option><option>mov</option><option>avi</option></select></div>
      </div>
      <p id="status" class="status" role="status" aria-live="polite" hidden></p>
    </form>
    <footer class="toolbar toolbar-footer">
      <span class="author" id="status-title"><span class="icon-github" aria-hidden="true"></span> yukinsnow</span>
      <div class="actions">
        <button type="button" id="cancel" hidden>取消</button>
        <button type="button" class="warning" data-action="extract" title="提取为 wav 音频，输出扩展名自动改为 .wav">提取音频</button>
        <button type="button" class="positive" data-action="replace" title="保留视频并复制新音轨">替换音频</button>
        <button type="submit" form="job-form" class="primary" id="submit">视频压制</button>
      </div>
    </footer>
  </div>`;

function element<t extends HTMLElement>(id: string): t { return document.getElementById(id) as t; }
const input = (id: string) => element<HTMLInputElement>(id);
let busy = false;
let native_ready = false;
let unsubscribe: unlisten_fn | undefined;

function status(title: string, message: string, state = '') {
  element('status-title').textContent = title;
  element('status').textContent = message;
  element('status').hidden = false;
  element('status').dataset.state = state;
}

function controls() {
  root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select').forEach(control => { control.disabled = busy; });
  element<HTMLButtonElement>('cancel').disabled = false;
  element('cancel').hidden = !busy;
  if (!busy) {
    for (const id of ['video_bitrate', 'fps', 'width', 'height']) input(id).disabled = input('video_codec').value === 'copy';
    input('audio_bitrate').disabled = input('audio_codec').value === 'copy';
  }
  if (!native_ready) root.querySelectorAll<HTMLButtonElement>('[data-pick], [data-action], #submit').forEach(button => { button.disabled = true; });
}

root.querySelectorAll<HTMLButtonElement>('[data-pick]').forEach(button => button.addEventListener('click', async () => {
  try {
    const kind = button.dataset.pick!;
    const format = input('format').value;
    const path = await invoke<string | null>('choose_file', { kind, format });
    if (path) input(kind).value = path;
  } catch (error) { status('选择失败', String(error), 'error'); }
}));

for (const id of ['video_codec', 'audio_codec']) input(id).addEventListener('change', controls);
input('format').addEventListener('change', () => {
  if (input('output').value) input('output').value = output_path(input('output').value, input('format').value);
});

function output_path(path: string, extension: string): string {
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const dot = path.lastIndexOf('.');
  return `${dot > separator ? path.slice(0, dot) : path}.${extension}`;
}

async function run(current_mode: mode) {
  if (busy || !native_ready) return;
  if (input('output').value.trim()) {
    const extension = current_mode === 'extract' ? 'wav' : input('format').value;
    input('output').value = output_path(input('output').value, extension);
  }
  const job: request = {
    mode: current_mode, video: input('video').value, audio: input('audio').value, output: input('output').value,
    video_codec: input('video_codec').value, audio_codec: input('audio_codec').value,
    video_bitrate: Number(input('video_bitrate').value), audio_bitrate: Number(input('audio_bitrate').value),
    fps: Number(input('fps').value), width: Number(input('width').value), height: Number(input('height').value)
  };
  const error = validate(job);
  if (error) { status('请检查设置', error, 'error'); return; }
  busy = true; controls(); status('正在启动', '正在准备 ffmpeg…', 'running');
  try { await invoke('start_job', { job }); }
  catch (error) { busy = false; controls(); status('启动失败', String(error), 'error'); }
}

element('job-form').addEventListener('submit', event => { event.preventDefault(); void run('encode'); });
root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => { void run(button.dataset.action as mode); }));
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
    });
    native_ready = true;
    controls();
  } catch {
    element('status-title').title = '界面预览：请通过 npm start 启动桌面应用以处理文件。';
  }
}
window.addEventListener('beforeunload', () => unsubscribe?.());
controls();
void initialize();
