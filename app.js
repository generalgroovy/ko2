const {
  TE_FILE,
  TE_SYSEX,
  TeSysexClient,
  buildFileInitPayload,
  buildFileListPayload,
  bytesToHex,
  bytesToString,
  parseFileInitResponse,
  parseFileListResponse,
  parseTeMetadataString,
  parseUniversalIdentity,
  selfTestPacking,
  stringToBytes
} = window.KO2Sysex;

const {
  audioBufferToWavBlob,
  bytesToHuman,
  decodeAudioFile,
  safeName,
  seconds
} = window.KO2Audio;

const state = {
  midi: null,
  input: null,
  output: null,
  inputs: [],
  outputs: [],
  te: null,
  device: {
    id: null,
    sku: "",
    serial: "",
    metadata: {},
    fileChunkSize: null
  },
  samples: [],
  selected: new Set(),
  audioContext: null
};

const $ = (id) => document.getElementById(id);
const els = {
  connectionBadge: $("connectionBadge"),
  midiPortLabel: $("midiPortLabel"),
  connectBtn: $("connectBtn"),
  midiInSelect: $("midiInSelect"),
  midiOutSelect: $("midiOutSelect"),
  identityBtn: $("identityBtn"),
  teEchoBtn: $("teEchoBtn"),
  fileInitBtn: $("fileInitBtn"),
  listRootBtn: $("listRootBtn"),
  dropZone: $("dropZone"),
  fileInput: $("fileInput"),
  exportManifestBtn: $("exportManifestBtn"),
  downloadSelectedBtn: $("downloadSelectedBtn"),
  searchInput: $("searchInput"),
  selectAllBtn: $("selectAllBtn"),
  clearSelectionBtn: $("clearSelectionBtn"),
  masterCheckbox: $("masterCheckbox"),
  libraryRows: $("libraryRows"),
  clearLogBtn: $("clearLogBtn"),
  log: $("log"),
  metaInput: $("metaInput"),
  metaOutput: $("metaOutput"),
  metaDeviceId: $("metaDeviceId"),
  metaSku: $("metaSku"),
  metaSerial: $("metaSerial"),
  metaChunk: $("metaChunk")
};

state.te = new TeSysexClient({ log });

function log(message, detail) {
  const suffix = detail === undefined ? "" : `\n${typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)}`;
  els.log.textContent += `\n[${new Date().toLocaleTimeString()}] ${message}${suffix}`;
  els.log.scrollTop = els.log.scrollHeight;
}

function setBadge(kind, text) {
  const cls = kind === "ok" ? "dot ok" : kind === "err" ? "dot err" : "dot";
  els.connectionBadge.innerHTML = `<span class="${cls}"></span><span>${escapeHtml(text)}</span>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function updateMeta() {
  els.metaInput.textContent = state.input ? state.input.name || state.input.id : "-";
  els.metaOutput.textContent = state.output ? state.output.name || state.output.id : "-";
  els.metaDeviceId.textContent = state.device.id ?? "-";
  els.metaSku.textContent = state.device.sku || "-";
  els.metaSerial.textContent = state.device.serial || "-";
  els.metaChunk.textContent = state.device.fileChunkSize ? bytesToHuman(state.device.fileChunkSize) : "-";
  els.midiPortLabel.textContent = state.input && state.output ? "MIDI pair selected" : "No MIDI pair";
}

function updateButtons() {
  const hasPair = !!state.input && !!state.output;
  els.identityBtn.disabled = !state.output;
  els.teEchoBtn.disabled = !hasPair;
  els.fileInitBtn.disabled = !hasPair;
  els.listRootBtn.disabled = !hasPair || !state.device.fileChunkSize;
  els.exportManifestBtn.disabled = !state.samples.length;
  els.downloadSelectedBtn.disabled = !state.selected.size;
  els.selectAllBtn.disabled = !filteredSamples().length;
  els.clearSelectionBtn.disabled = !state.selected.size;
  const visible = filteredSamples().map((sample) => sample.id);
  const selectedVisible = visible.filter((id) => state.selected.has(id)).length;
  els.masterCheckbox.checked = visible.length > 0 && selectedVisible === visible.length;
  els.masterCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
}

async function connectMidi() {
  if (!navigator.requestMIDIAccess) {
    setBadge("err", "Web MIDI unavailable");
    log("Web MIDI is unavailable. Use a Web MIDI-compatible browser with SysEx support.");
    return;
  }

  try {
    state.midi = await navigator.requestMIDIAccess({ sysex: true });
    state.midi.onstatechange = refreshMidiPorts;
    refreshMidiPorts();
    setBadge("ok", "MIDI connected");
    log(`MIDI access granted. 7-bit packing self-test: ${selfTestPacking() ? "passed" : "failed"}`);
  } catch (error) {
    setBadge("err", "MIDI blocked");
    log(`MIDI access failed: ${error.message}`);
  }
}

function refreshMidiPorts() {
  if (!state.midi) return;
  state.inputs.forEach((input) => input.onmidimessage = null);
  state.inputs = [...state.midi.inputs.values()];
  state.outputs = [...state.midi.outputs.values()];

  renderPortSelect(els.midiInSelect, state.inputs, "No MIDI input");
  renderPortSelect(els.midiOutSelect, state.outputs, "No MIDI output");

  state.input = choosePreferredPort(state.inputs, state.input);
  state.output = choosePreferredPort(state.outputs, state.output);
  if (state.input) els.midiInSelect.value = state.input.id;
  if (state.output) els.midiOutSelect.value = state.output.id;
  state.inputs.forEach((input) => input.onmidimessage = onMidiMessage);
  configureClient();
  updateMeta();
  updateButtons();
}

function renderPortSelect(select, ports, emptyLabel) {
  select.innerHTML = "";
  if (!ports.length) {
    select.innerHTML = `<option>${emptyLabel}</option>`;
    select.disabled = true;
    return;
  }
  ports.forEach((port) => {
    select.appendChild(new Option(port.name || port.id, port.id));
  });
  select.disabled = false;
}

function choosePreferredPort(ports, current) {
  if (current && ports.some((port) => port.id === current.id)) return ports.find((port) => port.id === current.id);
  return ports.find((port) => /ep|ko|teenage|engineering|k\.?o/i.test(`${port.name || ""} ${port.manufacturer || ""}`)) || ports[0] || null;
}

function selectPorts() {
  if (!state.midi) return;
  state.input = state.midi.inputs.get(els.midiInSelect.value) || null;
  state.output = state.midi.outputs.get(els.midiOutSelect.value) || null;
  state.inputs.forEach((input) => input.onmidimessage = onMidiMessage);
  configureClient();
  updateMeta();
  updateButtons();
  log(`Selected input: ${state.input ? state.input.name : "none"}; output: ${state.output ? state.output.name : "none"}`);
}

function configureClient() {
  state.te.configure({
    output: state.output,
    deviceId: Number.isInteger(state.device.id) ? state.device.id : 0x7f
  });
}

function sendUniversalIdentity() {
  if (!state.output) return;
  state.output.send([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
  log("Sent universal identity request: f0 7e 7f 06 01 f7");
}

async function sendTeEchoProbe() {
  await runProbe("TE echo", async () => {
    const response = await state.te.sendAndReceive(TE_SYSEX.ECHO, stringToBytes("ko2-web-midi-lab"), 2500);
    return {
      status: response.statusText,
      payloadHex: bytesToHex(response.payload),
      payloadText: bytesToString(response.payload)
    };
  });
}

async function initFileProtocol() {
  await runProbe("TE file INIT", async () => {
    const response = await state.te.sendAndReceive(TE_FILE.COMMAND, buildFileInitPayload(), 3000);
    const parsed = parseFileInitResponse(response.payload);
    if (parsed) state.device.fileChunkSize = parsed.chunkSize;
    updateMeta();
    updateButtons();
    return {
      status: response.statusText,
      payloadHex: bytesToHex(response.payload),
      chunkSize: parsed ? parsed.chunkSize : null
    };
  });
}

async function listRootFolder() {
  await runProbe("TE file LIST root", async () => {
    const response = await state.te.sendAndReceive(TE_FILE.COMMAND, buildFileListPayload(0, 0), 3000);
    const parsed = parseFileListResponse(response.payload);
    return {
      status: response.statusText,
      page: parsed.page,
      entries: parsed.entries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        flags: entry.flags,
        size: entry.size,
        isDirectory: entry.isDirectory
      }))
    };
  });
}

async function runProbe(label, task) {
  try {
    log(`${label} started.`);
    const result = await task();
    log(`${label} complete.`, result);
  } catch (error) {
    log(`${label} failed: ${error.message}`);
  }
}

function onMidiMessage(event) {
  const data = new Uint8Array(event.data);
  const identity = parseUniversalIdentity(data);
  if (identity) {
    state.device.id = identity.deviceId;
    state.device.sku = identity.sku;
    configureClient();
    updateMeta();
    updateButtons();
    log("Universal identity reply parsed.", { deviceId: identity.deviceId, sku: identity.sku, raw: bytesToHex(identity.raw) });
    return;
  }

  const parsed = state.te.handleMessage(data);
  if (parsed) {
    const maybeMetadata = parsed.command === TE_SYSEX.GREET ? parseTeMetadataString(parsed.payloadText || bytesToString(parsed.payload)) : null;
    if (maybeMetadata && maybeMetadata.serial) {
      state.device.metadata = maybeMetadata;
      state.device.serial = maybeMetadata.serial;
      state.device.sku = maybeMetadata.sku || state.device.sku;
      updateMeta();
    }
    log("TE SysEx received.", {
      type: parsed.type,
      requestId: parsed.requestId,
      command: parsed.command,
      status: parsed.statusText,
      payloadHex: bytesToHex(parsed.payload)
    });
    return;
  }

  log(`MIDI in: ${bytesToHex(data)}`);
}

async function handleFiles(files) {
  const list = [...files];
  for (const file of list) {
    if (/\.json$/i.test(file.name)) {
      await importManifest(file);
    } else if (file.type.startsWith("audio/")) {
      const sample = await decodeAudioFile(file, state);
      state.samples.push(sample);
      log(`Imported audio: ${file.name}`);
    }
  }
  renderLibrary();
  updateButtons();
}

async function importManifest(file) {
  const json = JSON.parse(await file.text());
  state.samples = (json.samples || []).map((sample, index) => ({
    id: sample.id || `manifest-${index}`,
    source: sample.source || "manifest",
    name: sample.name || `Sample ${index + 1}`,
    fileName: sample.fileName || "",
    type: sample.type || "manifest",
    sizeBytes: Number(sample.sizeBytes || 0),
    duration: Number(sample.duration || 0),
    sampleRate: Number(sample.sampleRate || 0),
    channels: Number(sample.channels || 0),
    waveform: sample.waveform || [],
    buffer: null
  }));
  state.selected.clear();
  log(`Imported manifest: ${file.name}`);
}

function filteredSamples() {
  const query = els.searchInput.value.trim().toLowerCase();
  if (!query) return state.samples;
  return state.samples.filter((sample) => [sample.name, sample.fileName, sample.type, sample.source].join(" ").toLowerCase().includes(query));
}

function renderLibrary() {
  const rows = filteredSamples();
  if (!rows.length) {
    els.libraryRows.innerHTML = '<tr><td colspan="8" class="muted">No matching samples.</td></tr>';
    updateButtons();
    return;
  }

  els.libraryRows.innerHTML = rows.map((sample) => {
    const checked = state.selected.has(sample.id) ? " checked" : "";
    return `<tr>
      <td><input class="rowCheck" type="checkbox" data-id="${escapeHtml(sample.id)}"${checked}></td>
      <td><strong>${escapeHtml(sample.name)}</strong><div class="muted mono">${escapeHtml(sample.source)}</div></td>
      <td>${escapeHtml(sample.channels ? `${sample.channels}ch ${sample.type}` : sample.type)}</td>
      <td>${seconds(sample.duration)}</td>
      <td>${sample.sampleRate ? `${sample.sampleRate} Hz` : "-"}</td>
      <td>${bytesToHuman(sample.sizeBytes)}</td>
      <td>${waveHtml(sample.waveform)}</td>
      <td><button class="downloadOne" data-id="${escapeHtml(sample.id)}" type="button"${sample.buffer ? "" : " disabled"}>WAV</button></td>
    </tr>`;
  }).join("");
  updateButtons();
}

function waveHtml(waveform = []) {
  if (!waveform.length) return '<span class="muted">-</span>';
  return `<div class="wave">${waveform.map((height) => `<span style="height:${height}%"></span>`).join("")}</div>`;
}

function downloadSample(sample) {
  if (!sample.buffer) return;
  downloadBlob(audioBufferToWavBlob(sample.buffer), `${safeName(sample.name)}.wav`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportManifest() {
  const payload = {
    exportedAt: new Date().toISOString(),
    note: "Local browser sample manifest. Hardware transfers are not represented here.",
    device: state.device,
    samples: state.samples.map(({ buffer, ...sample }) => sample)
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "ko2-local-samples.json");
}

els.connectBtn.addEventListener("click", connectMidi);
els.midiInSelect.addEventListener("change", selectPorts);
els.midiOutSelect.addEventListener("change", selectPorts);
els.identityBtn.addEventListener("click", sendUniversalIdentity);
els.teEchoBtn.addEventListener("click", sendTeEchoProbe);
els.fileInitBtn.addEventListener("click", initFileProtocol);
els.listRootBtn.addEventListener("click", listRootFolder);
els.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
els.searchInput.addEventListener("input", renderLibrary);
els.clearLogBtn.addEventListener("click", () => els.log.textContent = "Log cleared.");
els.exportManifestBtn.addEventListener("click", exportManifest);
els.downloadSelectedBtn.addEventListener("click", () => state.samples.filter((sample) => state.selected.has(sample.id)).forEach(downloadSample));
els.selectAllBtn.addEventListener("click", () => {
  filteredSamples().forEach((sample) => state.selected.add(sample.id));
  renderLibrary();
});
els.clearSelectionBtn.addEventListener("click", () => {
  state.selected.clear();
  renderLibrary();
});
els.masterCheckbox.addEventListener("change", () => {
  filteredSamples().forEach((sample) => els.masterCheckbox.checked ? state.selected.add(sample.id) : state.selected.delete(sample.id));
  renderLibrary();
});
els.libraryRows.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".rowCheck");
  if (!checkbox) return;
  if (checkbox.checked) state.selected.add(checkbox.dataset.id);
  else state.selected.delete(checkbox.dataset.id);
  updateButtons();
});
els.libraryRows.addEventListener("click", (event) => {
  const button = event.target.closest(".downloadOne");
  if (!button) return;
  const sample = state.samples.find((item) => item.id === button.dataset.id);
  if (sample) downloadSample(sample);
});
els.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  els.dropZone.classList.add("drag");
});
els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("drag"));
els.dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  els.dropZone.classList.remove("drag");
  handleFiles(event.dataTransfer.files);
});

updateMeta();
updateButtons();
