function ensureAudioContext(state) {
  if (!state.audioContext) {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (state.audioContext.state === "suspended") state.audioContext.resume();
  return state.audioContext;
}

async function decodeAudioFile(file, state) {
  const audio = ensureAudioContext(state);
  const buffer = await audio.decodeAudioData(await file.arrayBuffer());
  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    source: "local",
    name: file.name.replace(/\.[^.]+$/, ""),
    fileName: file.name,
    type: file.type || "audio",
    sizeBytes: file.size,
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    buffer,
    objectUrl: URL.createObjectURL(file),
    waveform: makeWaveform(buffer, 32)
  };
}

function makeWaveform(buffer, bars = 32) {
  const channel = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(channel.length / bars));
  const wave = [];

  for (let i = 0; i < bars; i += 1) {
    let peak = 0;
    const start = i * block;
    const end = Math.min(channel.length, start + block);
    for (let j = start; j < end; j += 1) {
      peak = Math.max(peak, Math.abs(channel[j]));
    }
    wave.push(Math.max(4, Math.round(peak * 100)));
  }

  return wave;
}

function audioBufferToWavBlob(buffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  const frames = buffer.length;
  const bytes = 44 + frames * channels * 2;
  const array = new ArrayBuffer(bytes);
  const view = new DataView(array);
  const write = (offset, text) => text.split("").forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));

  write(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, frames * channels * 2, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([array], { type: "audio/wav" });
}

function safeName(value) {
  return String(value || "sample").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim();
}

function bytesToHuman(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${unit === 0 || size >= 10 ? size.toFixed(0) : size.toFixed(1)} ${units[unit]}`;
}

function seconds(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(value >= 10 ? 1 : 2)}s`;
}

window.KO2Audio = {
  ensureAudioContext,
  decodeAudioFile,
  makeWaveform,
  audioBufferToWavBlob,
  safeName,
  bytesToHuman,
  seconds
};
