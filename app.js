(() => {
const {
  TE_FILE,
  TE_SYSEX,
  TeSysexClient,
  buildFileInitPayload,
  buildFileInfoPayload,
  buildFileListPayload,
  buildFileMetadataGetPayload,
  bytesToHex,
  bytesToString,
  parseFileInitResponse,
  parseFileListResponse,
  parseJsonMetadataPayload,
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

const defaultSettings = {
  requestSysex: true,
  autoSysexRetry: true,
  autoSelectKo: true,
  listenInput: true,
  allowReadProbes: true,
  unlockWriteActions: false,
  logRawMidi: true,
  deviceId: 0x7f,
  probeTimeout: 3000,
  portPollAttempts: 5,
  portPollInterval: 300
};

const state = {
  midi: null,
  sysex: false,
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
  tracks: [],
  scenes: [],
  deviceNodesByPath: new Map(),
  deviceTree: [],
  selected: new Set(),
  audioContext: null,
  settings: { ...defaultSettings }
};

const $ = (id) => document.getElementById(id);
const els = {
  connectionBadge: $("connectionBadge"),
  midiPortLabel: $("midiPortLabel"),
  connectBtn: $("connectBtn"),
  refreshPortsBtn: $("refreshPortsBtn"),
  diagnoseMidiBtn: $("diagnoseMidiBtn"),
  settingRequestSysex: $("settingRequestSysex"),
  settingAutoSysexRetry: $("settingAutoSysexRetry"),
  settingAutoSelectKo: $("settingAutoSelectKo"),
  settingListenInput: $("settingListenInput"),
  settingAllowReadProbes: $("settingAllowReadProbes"),
  settingUnlockWriteActions: $("settingUnlockWriteActions"),
  settingLogRawMidi: $("settingLogRawMidi"),
  settingDeviceId: $("settingDeviceId"),
  settingProbeTimeout: $("settingProbeTimeout"),
  settingPollAttempts: $("settingPollAttempts"),
  settingPollInterval: $("settingPollInterval"),
  exportSettingsBtn: $("exportSettingsBtn"),
  resetSettingsBtn: $("resetSettingsBtn"),
  midiInSelect: $("midiInSelect"),
  midiOutSelect: $("midiOutSelect"),
  identityBtn: $("identityBtn"),
  teEchoBtn: $("teEchoBtn"),
  fileInitBtn: $("fileInitBtn"),
  rootInfoBtn: $("rootInfoBtn"),
  listRootBtn: $("listRootBtn"),
  listSoundsBtn: $("listSoundsBtn"),
  listProjectsBtn: $("listProjectsBtn"),
  readSoundsMetaBtn: $("readSoundsMetaBtn"),
  readProjectsMetaBtn: $("readProjectsMetaBtn"),
  uploadSampleBtn: $("uploadSampleBtn"),
  deleteSampleBtn: $("deleteSampleBtn"),
  moveFileBtn: $("moveFileBtn"),
  writeMetadataBtn: $("writeMetadataBtn"),
  devicePlaybackBtn: $("devicePlaybackBtn"),
  backupRestoreBtn: $("backupRestoreBtn"),
  dropZone: $("dropZone"),
  fileInput: $("fileInput"),
  exportManifestBtn: $("exportManifestBtn"),
  downloadAllBtn: $("downloadAllBtn"),
  downloadSelectedBtn: $("downloadSelectedBtn"),
  searchInput: $("searchInput"),
  selectAllBtn: $("selectAllBtn"),
  clearSelectionBtn: $("clearSelectionBtn"),
  masterCheckbox: $("masterCheckbox"),
  libraryRows: $("libraryRows"),
  clearLogBtn: $("clearLogBtn"),
  clearTreeBtn: $("clearTreeBtn"),
  sceneList: $("sceneList"),
  trackList: $("trackList"),
  deviceTree: $("deviceTree"),
  proposalList: $("proposalList"),
  log: $("log"),
  metaInput: $("metaInput"),
  metaOutput: $("metaOutput"),
  metaPorts: $("metaPorts"),
  metaDeviceId: $("metaDeviceId"),
  metaSku: $("metaSku"),
  metaSerial: $("metaSerial"),
  metaChunk: $("metaChunk"),
  metaSysex: $("metaSysex"),
  metaPrivileges: $("metaPrivileges")
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
  els.metaPorts.textContent = `${state.inputs.length} in / ${state.outputs.length} out`;
  els.metaDeviceId.textContent = state.device.id ?? "-";
  els.metaSku.textContent = state.device.sku || "-";
  els.metaSerial.textContent = state.device.serial || "-";
  els.metaChunk.textContent = state.device.fileChunkSize ? bytesToHuman(state.device.fileChunkSize) : "-";
  els.metaSysex.textContent = state.sysex ? "granted" : "not granted";
  els.metaPrivileges.textContent = privilegeSummary();
  els.midiPortLabel.textContent = state.input && state.output ? "MIDI pair selected" : "No MIDI pair";
}

function updateButtons() {
  const hasPair = !!state.input && !!state.output;
  const hasSysexPair = hasPair && state.sysex;
  const canRead = hasSysexPair && state.settings.allowReadProbes;
  els.refreshPortsBtn.disabled = !state.midi;
  els.identityBtn.disabled = !state.output || !state.sysex || !state.settings.allowReadProbes;
  els.teEchoBtn.disabled = !canRead;
  els.fileInitBtn.disabled = !canRead;
  els.rootInfoBtn.disabled = !canRead || !state.device.fileChunkSize;
  els.listRootBtn.disabled = !canRead || !state.device.fileChunkSize;
  els.listSoundsBtn.disabled = !canRead || !state.deviceNodesByPath.has("/sounds");
  els.listProjectsBtn.disabled = !canRead || !state.deviceNodesByPath.has("/projects");
  els.readSoundsMetaBtn.disabled = !canRead || !state.deviceNodesByPath.has("/sounds");
  els.readProjectsMetaBtn.disabled = !canRead || !state.deviceNodesByPath.has("/projects");
  [
    els.uploadSampleBtn,
    els.deleteSampleBtn,
    els.moveFileBtn,
    els.writeMetadataBtn,
    els.devicePlaybackBtn,
    els.backupRestoreBtn
  ].forEach((button) => button.disabled = !state.settings.unlockWriteActions);
  els.exportManifestBtn.disabled = !state.samples.length;
  els.downloadAllBtn.disabled = !state.samples.some((sample) => sample.buffer);
  els.downloadSelectedBtn.disabled = !selectedBufferedSamples().length;
  els.selectAllBtn.disabled = !filteredSamples().length;
  els.clearSelectionBtn.disabled = !state.selected.size;
  const visible = filteredSamples().map((sample) => sample.id);
  const selectedVisible = visible.filter((id) => state.selected.has(id)).length;
  els.masterCheckbox.checked = visible.length > 0 && selectedVisible === visible.length;
  els.masterCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
}

function privilegeSummary() {
  const items = ["midi"];
  items.push(state.settings.requestSysex ? (state.sysex ? "sysex" : "sysex requested") : "sysex off");
  items.push(state.settings.allowReadProbes ? "read probes" : "read locked");
  items.push(state.settings.unlockWriteActions ? "write visible" : "write locked");
  return items.join(" / ");
}

function selectedBufferedSamples() {
  return state.samples.filter((sample) => state.selected.has(sample.id) && sample.buffer);
}

async function connectMidi() {
  if (!navigator.requestMIDIAccess) {
    setBadge("err", "Web MIDI unavailable");
    log("Web MIDI is unavailable. Use a Web MIDI-compatible browser with SysEx support.");
    return;
  }

  if (state.midi) {
    refreshMidiPorts();
    logPortSummary("MIDI ports refreshed.");
    if (state.settings.requestSysex && state.settings.autoSysexRetry && !state.sysex) {
      await requestSysexUpgrade();
    }
    return;
  }

  try {
    state.midi = await navigator.requestMIDIAccess();
    state.sysex = false;
    state.midi.onstatechange = refreshMidiPorts;
    refreshMidiPorts();
    setBadge(state.inputs.length || state.outputs.length ? "ok" : "err", state.inputs.length || state.outputs.length ? "MIDI registered" : "No MIDI ports");
    logPortSummary(`Plain MIDI registered. 7-bit packing self-test: ${selfTestPacking() ? "passed" : "failed"}`);
    await pollPortsBriefly();
  } catch (error) {
    state.sysex = false;
    setBadge("err", "MIDI permission blocked");
    log(`MIDI access failed: ${error.message}`);
    log("Browser did not grant MIDI. Open this app in Chrome/Edge on localhost and allow MIDI access.");
    return;
  }

  if (state.settings.requestSysex && state.settings.autoSysexRetry) {
    await requestSysexUpgrade();
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
  state.inputs.forEach((input) => input.onmidimessage = state.settings.listenInput ? onMidiMessage : null);
  configureClient();
  updateMeta();
  updateButtons();
}

async function requestSysexUpgrade() {
  if (!navigator.requestMIDIAccess || state.sysex || !state.settings.requestSysex) return;
  try {
    const sysexAccess = await navigator.requestMIDIAccess({ sysex: true });
    state.midi = sysexAccess;
    state.sysex = true;
    state.midi.onstatechange = refreshMidiPorts;
    refreshMidiPorts();
    setBadge("ok", "MIDI + SysEx");
    logPortSummary("SysEx access granted.");
  } catch (error) {
    state.sysex = false;
    updateMeta();
    updateButtons();
    log(`SysEx access not granted: ${error.message}`);
    log("Device registration can still be verified. TE file probes need SysEx permission.");
  }
}

async function pollPortsBriefly() {
  for (let attempt = 0; attempt < state.settings.portPollAttempts; attempt += 1) {
    if (state.inputs.length || state.outputs.length) return;
    await new Promise((resolve) => setTimeout(resolve, state.settings.portPollInterval));
    refreshMidiPorts();
  }
}

function logPortSummary(prefix = "MIDI ports") {
  const inputs = state.inputs.map(portSummary);
  const outputs = state.outputs.map(portSummary);
  const matched = [...inputs, ...outputs].filter((line) => /ep-?133|teenage|engineering|k\.?o|ko/i.test(line));
  log(prefix, {
    sysex: state.sysex,
    inputCount: state.inputs.length,
    outputCount: state.outputs.length,
    selectedInput: state.input ? portSummary(state.input) : null,
    selectedOutput: state.output ? portSummary(state.output) : null,
    matchedEpPorts: matched,
    inputs,
    outputs
  });
}

function portSummary(port) {
  return `${port.name || "(unnamed)"} | ${port.manufacturer || "unknown"} | ${port.state || "unknown"} | ${port.connection || "unknown"} | ${port.id}`;
}

function diagnoseMidi() {
  log("MIDI diagnostics", {
    url: location.href,
    protocol: location.protocol,
    secureContext: window.isSecureContext,
    requestMIDIAccess: typeof navigator.requestMIDIAccess === "function",
    sysexGranted: state.sysex,
    midiAccessCreated: !!state.midi,
    inputCount: state.inputs.length,
    outputCount: state.outputs.length,
    userAgent: navigator.userAgent
  });
  if (state.midi) logPortSummary("Current browser MIDI ports.");
  else log("Click Connect MIDI to request browser MIDI permission and enumerate EP-133 ports.");
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
  if (!state.settings.autoSelectKo) return ports[0] || null;
  return ports.find((port) => /ep|ko|teenage|engineering|k\.?o/i.test(`${port.name || ""} ${port.manufacturer || ""}`)) || ports[0] || null;
}

function selectPorts() {
  if (!state.midi) return;
  state.input = state.midi.inputs.get(els.midiInSelect.value) || null;
  state.output = state.midi.outputs.get(els.midiOutSelect.value) || null;
  state.inputs.forEach((input) => input.onmidimessage = state.settings.listenInput ? onMidiMessage : null);
  configureClient();
  updateMeta();
  updateButtons();
  log(`Selected input: ${state.input ? state.input.name : "none"}; output: ${state.output ? state.output.name : "none"}`);
}

function configureClient() {
  state.te.configure({
    output: state.output,
    deviceId: Number.isInteger(state.device.id) ? state.device.id : state.settings.deviceId
  });
}

function sendUniversalIdentity() {
  if (!state.output) return;
  state.output.send([0xf0, 0x7e, 0x7f, 0x06, 0x01, 0xf7]);
  log("Sent universal identity request: f0 7e 7f 06 01 f7");
}

async function sendTeEchoProbe() {
  await runProbe("TE echo", async () => {
    const response = await state.te.sendAndReceive(TE_SYSEX.ECHO, stringToBytes("ko2-web-midi-lab"), state.settings.probeTimeout);
    return {
      status: response.statusText,
      payloadHex: bytesToHex(response.payload),
      payloadText: bytesToString(response.payload)
    };
  });
}

async function initFileProtocol() {
  await runProbe("TE file INIT", async () => {
    const response = await state.te.sendAndReceive(TE_FILE.COMMAND, buildFileInitPayload(), state.settings.probeTimeout);
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
    const parsed = await listFolderByNode(0, "/");
    renderDeviceTree();
    updateButtons();
    return {
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

async function readRootInfo() {
  await runProbe("TE file INFO root", async () => {
    const response = await state.te.sendAndReceive(TE_FILE.COMMAND, buildFileInfoPayload(0), state.settings.probeTimeout);
    return { status: response.statusText, payloadHex: bytesToHex(response.payload) };
  });
}

async function listKnownFolder(path) {
  const node = state.deviceNodesByPath.get(path);
  if (!node) {
    log(`No cached node for ${path}. List root first.`);
    return;
  }
  await runProbe(`TE file LIST ${path}`, async () => {
    const parsed = await listFolderByNode(node.id, path);
    renderDeviceTree();
    updateButtons();
    return {
      page: parsed.page,
      entries: parsed.entries.map((entry) => ({ id: entry.id, name: entry.name, size: entry.size, flags: entry.flags }))
    };
  });
}

async function listFolderByNode(nodeId, path) {
  const response = await state.te.sendAndReceive(TE_FILE.COMMAND, buildFileListPayload(nodeId, 0), state.settings.probeTimeout);
  const parsed = parseFileListResponse(response.payload);
  const normalizedPath = path === "/" ? "" : path;
  parsed.entries.forEach((entry) => {
    const childPath = `${normalizedPath}/${entry.name}` || "/";
    entry.path = childPath;
    entry.parentPath = path;
    state.deviceNodesByPath.set(childPath, entry);
  });
  state.deviceTree = [...state.deviceNodesByPath.values()];
  return parsed;
}

async function readKnownMetadata(path) {
  const node = state.deviceNodesByPath.get(path);
  if (!node) {
    log(`No cached node for ${path}. List root first.`);
    return;
  }
  await runProbe(`TE metadata ${path}`, async () => {
    const response = await state.te.sendAndReceive(TE_FILE.COMMAND, buildFileMetadataGetPayload(node.id), state.settings.probeTimeout);
    const parsed = parseJsonMetadataPayload(response.payload);
    return { page: parsed.page, done: parsed.done, metadata: parsed.metadata };
  });
}

async function runProbe(label, task) {
  if (!state.settings.allowReadProbes) {
    log(`${label} blocked: read-only probe privilege is disabled.`);
    return;
  }
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

  if (state.settings.logRawMidi) {
    log(`MIDI in: ${bytesToHex(data)}`);
  }
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
  renderProject();
  renderProposals();
  updateButtons();
}

async function importManifest(file) {
  const json = JSON.parse(await file.text());
  const sourceSamples = json.samples || json.sounds || [];
  const sourceSongs = json.songs || [];
  state.samples = sourceSamples.map(normalizeManifestSample);
  state.scenes = (json.scenes || sourceSongs.flatMap((song, songIndex) => (song.scenes || []).map((scene, sceneIndex) => ({
    id: scene.id || `${song.id || `song-${songIndex}`}-scene-${sceneIndex}`,
    song: song.name || `Song ${songIndex + 1}`,
    name: scene.name || `Scene ${sceneIndex + 1}`,
    bars: scene.bars || 0,
    groups: scene.groups || [],
    patterns: scene.patterns || []
  })))).map((scene, sceneIndex) => ({
    id: scene.id || `scene-${sceneIndex}`,
    song: scene.song || "Project",
    name: scene.name || `Scene ${sceneIndex + 1}`,
    bars: scene.bars || 0,
    groups: scene.groups || [],
    patterns: scene.patterns || []
  }));
  state.tracks = (json.tracks || sourceSongs.flatMap((song, songIndex) => (song.arrangement || song.tracks || []).map((track, trackIndex) => ({
    id: track.id || `${song.id || `song-${songIndex}`}-track-${trackIndex}`,
    song: song.name || `Song ${songIndex + 1}`,
    name: track.name || `Track ${trackIndex + 1}`,
    group: track.group || "",
    type: track.type || "samples",
    clips: (track.clips || []).map((clip, clipIndex) => ({
      id: clip.id || `${track.id || `track-${trackIndex}`}-clip-${clipIndex}`,
      soundId: clip.soundId,
      barStart: clip.barStart || 0,
      bars: clip.bars || 0,
      soundName: sampleName(clip.soundId)
    }))
  })))).map((track, trackIndex) => ({
    id: track.id || `track-${trackIndex}`,
    song: track.song || "Project",
    name: track.name || `Track ${trackIndex + 1}`,
    group: track.group || "",
    type: track.type || "samples",
    clips: (track.clips || []).map((clip, clipIndex) => ({
      id: clip.id || `${track.id || `track-${trackIndex}`}-clip-${clipIndex}`,
      soundId: clip.soundId,
      barStart: clip.barStart || 0,
      bars: clip.bars || 0,
      soundName: clip.soundName || sampleName(clip.soundId)
    }))
  }));
  state.selected.clear();
  log(`Imported manifest: ${file.name}`);
}

function normalizeManifestSample(sample, index) {
  return {
    id: sample.id || `manifest-${index}`,
    source: sample.source || "manifest",
    name: sample.name || `Sample ${index + 1}`,
    fileName: sample.fileName || sample.path || "",
    type: sample.type || sample.playMode || "manifest",
    sizeBytes: Number(sample.sizeBytes || sample.size || 0),
    duration: Number(sample.duration || 0),
    sampleRate: Number(sample.sampleRate || sample.samplerate || 0),
    channels: Number(sample.channels || 0),
    waveform: sample.waveform || [],
    metadata: sample.meta || sample.metadata || {},
    buffer: null,
    objectUrl: ""
  };
}

function sampleName(soundId) {
  const sample = state.samples.find((item) => item.id === soundId);
  return sample ? sample.name : soundId || "-";
}

function filteredSamples() {
  const query = els.searchInput.value.trim().toLowerCase();
  if (!query) return state.samples;
  return state.samples.filter((sample) => [sample.name, sample.fileName, sample.type, sample.source].join(" ").toLowerCase().includes(query));
}

function renderLibrary() {
  const rows = filteredSamples();
  if (!rows.length) {
    els.libraryRows.innerHTML = '<tr><td colspan="9" class="muted">No matching samples.</td></tr>';
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
      <td>${sample.objectUrl ? `<audio controls preload="none" src="${sample.objectUrl}"></audio>` : '<span class="muted">no buffer</span>'}</td>
      <td><button class="downloadOne" data-id="${escapeHtml(sample.id)}" type="button" title="Download this local audio buffer as WAV."${sample.buffer ? "" : " disabled"}>WAV</button></td>
    </tr>`;
  }).join("");
  updateButtons();
}

function renderProject() {
  els.sceneList.classList.toggle("muted", !state.scenes.length);
  els.trackList.classList.toggle("muted", !state.tracks.length);
  els.sceneList.innerHTML = state.scenes.length ? state.scenes.map((scene) => `<div class="item">
    <strong>${escapeHtml(scene.name)}</strong>
    <div class="sub">${escapeHtml(scene.song)} · ${scene.bars || 0} bars · groups ${escapeHtml((scene.groups || []).join(", ") || "-")} · patterns ${escapeHtml((scene.patterns || []).join(", ") || "-")}</div>
  </div>`).join("") : "No scenes loaded.";
  els.trackList.innerHTML = state.tracks.length ? state.tracks.map((track) => `<div class="item">
    <strong>${escapeHtml(track.name)}</strong>
    <div class="sub">${escapeHtml(track.song)} · ${escapeHtml(track.group || "-")} · ${track.clips.length} clips</div>
    <div class="sub">${track.clips.map((clip) => `${escapeHtml(clip.soundName)} @ ${clip.barStart || 0}/${clip.bars || 0}`).join("<br>") || "No clips"}</div>
  </div>`).join("") : "No tracks loaded.";
}

function renderDeviceTree() {
  const nodes = [...state.deviceNodesByPath.entries()].sort(([a], [b]) => a.localeCompare(b));
  els.deviceTree.classList.toggle("muted", !nodes.length);
  els.deviceTree.innerHTML = nodes.length ? nodes.map(([path, node]) => `<div class="item">
    <strong>${escapeHtml(path)}</strong>
    <div class="sub">id ${node.id} · ${node.isDirectory ? "folder" : "file"} · ${bytesToHuman(node.size)}</div>
  </div>`).join("") : "No device folders read.";
}

function renderProposals() {
  const proposals = [
    ["Read-only browser", "Add recursive folder scan and metadata cache once root listing is verified."],
    ["Sample backup", "Download device samples as WAV after /sounds paths and metadata are confirmed."],
    ["Pad assignment", "Show active project/group/pad and map sample IDs to pads."],
    ["Project view", "Render scenes, tracks, pads, and clips from real project metadata."],
    ["Safe write mode", "Add an explicit hardware-tested unlock flow for upload/delete/metadata writes."],
    ["Compare mode", "Compare local WAV CRCs against KO II sample metadata before restore."],
    ["Session capture", "Export raw SysEx request/response logs for protocol validation."]
  ];
  els.proposalList.innerHTML = proposals.map(([title, body]) => `<div class="item">
    <strong>${escapeHtml(title)}</strong>
    <div class="sub">${escapeHtml(body)}</div>
  </div>`).join("");
}

function waveHtml(waveform = []) {
  if (!waveform.length) return '<span class="muted">-</span>';
  return `<div class="wave">${waveform.map((height) => `<span style="height:${height}%"></span>`).join("")}</div>`;
}

function downloadSample(sample) {
  if (!sample.buffer) return;
  downloadBlob(audioBufferToWavBlob(sample.buffer), `${safeName(sample.name)}.wav`);
}

function downloadSamples(samples, label) {
  const buffered = samples.filter((sample) => sample.buffer);
  const skipped = samples.length - buffered.length;
  if (!buffered.length) {
    log(`${label}: no local audio buffers available; nothing downloaded.`);
    return;
  }
  buffered.forEach(downloadSample);
  if (skipped) log(`${label}: downloaded ${buffered.length}, skipped ${skipped} without local audio buffers.`);
  else log(`${label}: downloaded ${buffered.length}.`);
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
    samples: state.samples.map(({ buffer, objectUrl, ...sample }) => sample),
    tracks: state.tracks,
    scenes: state.scenes,
    deviceTree: [...state.deviceNodesByPath.entries()].map(([path, node]) => ({ path, id: node.id, flags: node.flags, size: node.size, name: node.name }))
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "ko2-local-samples.json");
}

function syncSettingsForm() {
  els.settingRequestSysex.checked = state.settings.requestSysex;
  els.settingAutoSysexRetry.checked = state.settings.autoSysexRetry;
  els.settingAutoSelectKo.checked = state.settings.autoSelectKo;
  els.settingListenInput.checked = state.settings.listenInput;
  els.settingAllowReadProbes.checked = state.settings.allowReadProbes;
  els.settingUnlockWriteActions.checked = state.settings.unlockWriteActions;
  els.settingLogRawMidi.checked = state.settings.logRawMidi;
  els.settingDeviceId.value = state.settings.deviceId;
  els.settingProbeTimeout.value = state.settings.probeTimeout;
  els.settingPollAttempts.value = state.settings.portPollAttempts;
  els.settingPollInterval.value = state.settings.portPollInterval;
}

function readSettingsForm() {
  state.settings = {
    requestSysex: els.settingRequestSysex.checked,
    autoSysexRetry: els.settingAutoSysexRetry.checked,
    autoSelectKo: els.settingAutoSelectKo.checked,
    listenInput: els.settingListenInput.checked,
    allowReadProbes: els.settingAllowReadProbes.checked,
    unlockWriteActions: els.settingUnlockWriteActions.checked,
    logRawMidi: els.settingLogRawMidi.checked,
    deviceId: clampNumber(els.settingDeviceId.value, 0, 127, defaultSettings.deviceId),
    probeTimeout: clampNumber(els.settingProbeTimeout.value, 250, 30000, defaultSettings.probeTimeout),
    portPollAttempts: clampNumber(els.settingPollAttempts.value, 0, 30, defaultSettings.portPollAttempts),
    portPollInterval: clampNumber(els.settingPollInterval.value, 50, 5000, defaultSettings.portPollInterval)
  };
  syncSettingsForm();
  configureClient();
  refreshMidiPorts();
  updateMeta();
  updateButtons();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function exportSettings() {
  downloadBlob(new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(),
    browserPrivileges: {
      midiAccessCreated: !!state.midi,
      sysexGranted: state.sysex,
      note: "Browser MIDI and SysEx permissions are granted by the browser prompt, not by this JSON."
    },
    settings: state.settings
  }, null, 2)], { type: "application/json" }), "ko2-runtime-settings.json");
}

function resetSettings() {
  state.settings = { ...defaultSettings };
  syncSettingsForm();
  readSettingsForm();
  log("Runtime settings reset.", state.settings);
}

function lockedAction(label) {
  log(`${label}: write privilege surface is visible, but no verified KO II write-transfer implementation is enabled.`);
}

els.connectBtn.addEventListener("click", connectMidi);
els.refreshPortsBtn.addEventListener("click", () => {
  refreshMidiPorts();
  logPortSummary("Manual port refresh.");
});
els.diagnoseMidiBtn.addEventListener("click", diagnoseMidi);
[
  els.settingRequestSysex,
  els.settingAutoSysexRetry,
  els.settingAutoSelectKo,
  els.settingListenInput,
  els.settingAllowReadProbes,
  els.settingUnlockWriteActions,
  els.settingLogRawMidi,
  els.settingDeviceId,
  els.settingProbeTimeout,
  els.settingPollAttempts,
  els.settingPollInterval
].forEach((control) => control.addEventListener("change", readSettingsForm));
els.exportSettingsBtn.addEventListener("click", exportSettings);
els.resetSettingsBtn.addEventListener("click", resetSettings);
els.midiInSelect.addEventListener("change", selectPorts);
els.midiOutSelect.addEventListener("change", selectPorts);
els.identityBtn.addEventListener("click", sendUniversalIdentity);
els.teEchoBtn.addEventListener("click", sendTeEchoProbe);
els.fileInitBtn.addEventListener("click", initFileProtocol);
els.rootInfoBtn.addEventListener("click", readRootInfo);
els.listRootBtn.addEventListener("click", listRootFolder);
els.listSoundsBtn.addEventListener("click", () => listKnownFolder("/sounds"));
els.listProjectsBtn.addEventListener("click", () => listKnownFolder("/projects"));
els.readSoundsMetaBtn.addEventListener("click", () => readKnownMetadata("/sounds"));
els.readProjectsMetaBtn.addEventListener("click", () => readKnownMetadata("/projects"));
els.uploadSampleBtn.addEventListener("click", () => lockedAction("Upload sample"));
els.deleteSampleBtn.addEventListener("click", () => lockedAction("Delete sample"));
els.moveFileBtn.addEventListener("click", () => lockedAction("Move file"));
els.writeMetadataBtn.addEventListener("click", () => lockedAction("Write metadata"));
els.devicePlaybackBtn.addEventListener("click", () => lockedAction("Device playback"));
els.backupRestoreBtn.addEventListener("click", () => lockedAction("Backup / restore"));
els.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
els.searchInput.addEventListener("input", renderLibrary);
els.clearLogBtn.addEventListener("click", () => els.log.textContent = "Log cleared.");
els.clearTreeBtn.addEventListener("click", () => {
  state.deviceNodesByPath.clear();
  state.deviceTree = [];
  renderDeviceTree();
  updateButtons();
});
els.exportManifestBtn.addEventListener("click", exportManifest);
els.downloadAllBtn.addEventListener("click", () => downloadSamples(state.samples, "Download all WAV"));
els.downloadSelectedBtn.addEventListener("click", () => downloadSamples(state.samples.filter((sample) => state.selected.has(sample.id)), "Download selected WAV"));
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

syncSettingsForm();
updateMeta();
renderProject();
renderDeviceTree();
renderProposals();
updateButtons();
})();
