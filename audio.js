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

async function decodePcmFile(file, state, options = {}) {
  const audio = ensureAudioContext(state);
  const sampleRate = Math.max(8000, Math.min(192000, Number(options.sampleRate) || 44100));
  const channels = Math.max(1, Math.min(2, Number(options.channels) || 1));
  const bitDepth = [8, 16, 24, 32].includes(Number(options.bitDepth)) ? Number(options.bitDepth) : 16;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bytesPerSample = bitDepth / 8;
  const frames = Math.floor(bytes.length / (bytesPerSample * channels));
  const buffer = audio.createBuffer(channels, frames, sampleRate);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sampleOffset = (frame * channels + channel) * bytesPerSample;
      buffer.getChannelData(channel)[frame] = readPcmSample(view, sampleOffset, bitDepth);
    }
  }

  const wavBlob = audioBufferToWavBlob(buffer);
  return {
    id: `pcm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    source: "local-pcm",
    name: file.name.replace(/\.[^.]+$/, ""),
    fileName: file.name,
    type: `pcm-${bitDepth}`,
    sizeBytes: file.size,
    duration: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    buffer,
    objectUrl: URL.createObjectURL(wavBlob),
    waveform: makeWaveform(buffer, 32),
    metadata: { pcmSampleRate: sampleRate, pcmChannels: channels, pcmBitDepth: bitDepth }
  };
}

function readPcmSample(view, offset, bitDepth) {
  if (bitDepth === 8) return (view.getUint8(offset) - 128) / 128;
  if (bitDepth === 16) return Math.max(-1, view.getInt16(offset, true) / 0x8000);
  if (bitDepth === 24) {
    const value = view.getUint8(offset) | (view.getUint8(offset + 1) << 8) | (view.getUint8(offset + 2) << 16);
    const signed = value & 0x800000 ? value | 0xff000000 : value;
    return Math.max(-1, signed / 0x800000);
  }
  return Math.max(-1, view.getInt32(offset, true) / 0x80000000);
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
  decodePcmFile,
  makeWaveform,
  audioBufferToWavBlob,
  safeName,
  bytesToHuman,
  seconds
};
