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
  decodePcmFile,
  ensureAudioContext,
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
  autoLoadProject: true,
  deviceId: 0x7f,
  probeTimeout: 3000,
  portPollAttempts: 5,
  portPollInterval: 300,
  recursiveScanDepth: 3,
  pcmSampleRate: 44100,
  pcmChannels: 1,
  pcmBitDepth: 16
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
  pads: [],
  comparison: [],
  activeBank: 1,
  activeGroup: "A",
  deviceNodesByPath: new Map(),
  deviceTree: [],
  selected: new Set(),
  audioContext: null,
  projectLoadInFlight: false,
  transport: {
    playing: false,
    startedAt: 0,
    pausedAt: 0,
    duration: 0,
    sampleId: "",
    label: "",
    source: null,
    events: [],
    frame: 0
  },
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
  settingAutoLoadProject: $("settingAutoLoadProject"),
  settingDeviceId: $("settingDeviceId"),
  settingProbeTimeout: $("settingProbeTimeout"),
  settingPollAttempts: $("settingPollAttempts"),
  settingPollInterval: $("settingPollInterval"),
  settingScanDepth: $("settingScanDepth"),
  settingPcmSampleRate: $("settingPcmSampleRate"),
  settingPcmChannels: $("settingPcmChannels"),
  settingPcmBitDepth: $("settingPcmBitDepth"),
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
  compareDeviceBtn: $("compareDeviceBtn"),
  downloadAllBtn: $("downloadAllBtn"),
  downloadSelectedBtn: $("downloadSelectedBtn"),
  libraryStats: $("libraryStats"),
  bankTabs: $("bankTabs"),
  searchInput: $("searchInput"),
  selectAllBtn: $("selectAllBtn"),
  clearSelectionBtn: $("clearSelectionBtn"),
  masterCheckbox: $("masterCheckbox"),
  libraryRows: $("libraryRows"),
  clearLogBtn: $("clearLogBtn"),
  exportLogBtn: $("exportLogBtn"),
  clearTreeBtn: $("clearTreeBtn"),
  scanTreeBtn: $("scanTreeBtn"),
  exportTreeBtn: $("exportTreeBtn"),
  sceneList: $("sceneList"),
  trackList: $("trackList"),
  padList: $("padList"),
  padGrid: $("padGrid"),
  activeGroupSelect: $("activeGroupSelect"),
  projectSummary: $("projectSummary"),
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
  metaPrivileges: $("metaPrivileges"),
  playSelectedBtn: $("playSelectedBtn"),
  stopTimelineBtn: $("stopTimelineBtn"),
  timelineTime: $("timelineTime"),
  timelineViewport: $("timelineViewport"),
  timelineRuler: $("timelineRuler"),
  timelineLanes: $("timelineLanes"),
  timelinePlayhead: $("timelinePlayhead")
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
  els.scanTreeBtn.disabled = !canRead || !state.device.fileChunkSize;
  els.exportTreeBtn.disabled = !state.deviceNodesByPath.size;
  [
    els.uploadSampleBtn,
    els.deleteSampleBtn,
    els.moveFileBtn,
    els.writeMetadataBtn,
    els.devicePlaybackBtn,
    els.backupRestoreBtn
  ].forEach((button) => button.disabled = !state.settings.unlockWriteActions);
  els.exportManifestBtn.disabled = !state.samples.length;
  els.compareDeviceBtn.disabled = !state.samples.length || !state.deviceNodesByPath.size;
  els.downloadAllBtn.disabled = !state.samples.some((sample) => sample.buffer);
  els.downloadSelectedBtn.disabled = !selectedBufferedSamples().length;
  els.playSelectedBtn.disabled = !currentPlayableSample();
  els.stopTimelineBtn.disabled = !state.transport.playing && !state.transport.sampleId;
  els.selectAllBtn.disabled = !filteredSamples().length;
  els.clearSelectionBtn.disabled = !state.selected.size;
  const visible = filteredSamples().map((sample) => sample.id);
  const selectedVisible = visible.filter((id) => state.selected.has(id)).length;
  els.masterCheckbox.checked = visible.length > 0 && selectedVisible === visible.length;
  els.masterCheckbox.indeterminate = selectedVisible > 0 && selectedVisible < visible.length;
}

function sampleBank(sample) {
  const slot = Number(sample.slot || 1);
  return Math.max(1, Math.min(10, Math.floor((slot - 1) / 100) + 1));
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

function currentPlayableSample() {
  return selectedBufferedSamples()[0] || filteredSamples().find((sample) => sample.buffer) || state.samples.find((sample) => sample.buffer) || null;
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
    if (state.sysex && state.settings.autoLoadProject) {
      await autoLoadProjectData();
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
  renderTimeline();
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
    if (state.settings.autoLoadProject) {
      await autoLoadProjectData();
    }
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
  if (state.sysex && state.settings.autoLoadProject) autoLoadProjectData();
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

async function scanDeviceTree() {
  await runProbe("TE recursive tree scan", async () => {
    const visited = new Set();
    const queue = [{ id: 0, path: "/", depth: 0 }];
    const scanned = [];

    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current.id) || current.depth > state.settings.recursiveScanDepth) continue;
      visited.add(current.id);
      const parsed = await listFolderByNode(current.id, current.path);
      scanned.push({ path: current.path, entries: parsed.entries.length });
      parsed.entries
        .filter((entry) => entry.isDirectory)
        .forEach((entry) => queue.push({ id: entry.id, path: entry.path, depth: current.depth + 1 }));
    }

    renderDeviceTree();
    renderProposals();
    updateButtons();
    return {
      maxDepth: state.settings.recursiveScanDepth,
      foldersScanned: scanned.length,
      nodesCached: state.deviceNodesByPath.size,
      scanned
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
    mergeDeviceMetadata(path, parsed.metadata);
    return { page: parsed.page, done: parsed.done, metadata: parsed.metadata };
  });
}

async function autoLoadProjectData() {
  if (state.projectLoadInFlight || !state.sysex || !state.output || !state.settings.allowReadProbes) return;
  state.projectLoadInFlight = true;
  try {
    log("Auto project load started.");
    sendUniversalIdentity();
    await sendTeEchoProbe();
    await initFileProtocol();
    if (!state.device.fileChunkSize) {
      log("Auto project load stopped: file protocol did not report a chunk size.");
      return;
    }
    await readRootInfo();
    await listRootFolder();
    if (state.deviceNodesByPath.has("/sounds")) {
      await listKnownFolder("/sounds");
      await readKnownMetadata("/sounds");
    }
    if (state.deviceNodesByPath.has("/projects")) {
      await listKnownFolder("/projects");
      await readKnownMetadata("/projects");
    }
    if (state.settings.recursiveScanDepth > 1) {
      await scanDeviceTree();
    }
    log("Auto project load complete.");
  } finally {
    state.projectLoadInFlight = false;
    renderLibrary();
    renderProject();
    renderDeviceTree();
    renderProposals();
    updateButtons();
  }
}

function mergeDeviceMetadata(path, metadata) {
  if (!metadata || typeof metadata !== "object") return;
  const candidate = metadata.project || metadata.data || metadata;
  if (!hasProjectData(candidate)) return;
  applyProjectData(candidate, `device:${path}`);
  log(`Merged project metadata from ${path}.`);
}

function hasProjectData(value) {
  if (!value || typeof value !== "object") return false;
  return ["samples", "sounds", "songs", "scenes", "tracks", "pads", "padAssignments", "assignments"].some((key) => Array.isArray(value[key]));
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
  if (data[0] !== 0xf0) recordMidiEvent(data);
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
    } else if (/\.(pcm|raw)$/i.test(file.name)) {
      const sample = await decodePcmFile(file, state, {
        sampleRate: state.settings.pcmSampleRate,
        channels: state.settings.pcmChannels,
        bitDepth: state.settings.pcmBitDepth
      });
      sample.slot = nextAvailableSlot();
      state.samples.push(sample);
      log(`Imported PCM: ${file.name}`);
    } else if (file.type.startsWith("audio/")) {
      const sample = await decodeAudioFile(file, state);
      sample.slot = nextAvailableSlot();
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
  applyProjectData(json, "manifest");
  state.selected.clear();
  log(`Imported manifest: ${file.name}`);
}

function applyProjectData(json, sourceLabel = "manifest") {
  const sourceSamples = json.samples || json.sounds || [];
  const sourceSongs = json.songs || [];
  state.samples = sourceSamples.map((sample, index) => normalizeManifestSample({ ...sample, source: sample.source || sourceLabel }, index));
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
  state.pads = normalizePads(json);
}

function nextAvailableSlot() {
  const used = new Set(state.samples.map((sample) => Number(sample.slot || 0)));
  for (let slot = 1; slot <= 999; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return state.samples.length + 1;
}

function normalizePads(json) {
  const sourcePads = json.pads || json.padAssignments || json.assignments || [];
  const songPads = (json.songs || []).flatMap((song, songIndex) => (song.pads || song.padAssignments || []).map((pad, padIndex) => ({
    ...pad,
    song: song.name || `Song ${songIndex + 1}`,
    id: pad.id || `${song.id || `song-${songIndex}`}-pad-${padIndex}`
  })));
  return [...sourcePads, ...songPads].map((pad, index) => {
    const soundId = pad.soundId || pad.sampleId || pad.sample || pad.sound || "";
    const parsedPad = parsePadLabel(pad.pad || pad.index || pad.number || "");
    return {
      id: pad.id || `pad-${index}`,
      group: String(pad.group || pad.bank || pad.track || parsedPad.group || "").toUpperCase(),
      pad: parsedPad.pad || pad.pad || pad.index || pad.number || index + 1,
      soundId,
      soundName: pad.soundName || sampleName(soundId),
      mode: pad.mode || pad.playMode || pad.type || "",
      song: pad.song || "Project"
    };
  });
}

function parsePadLabel(value) {
  const match = String(value || "").trim().match(/^([A-D])\s*[-:]?\s*(1[0-2]|[1-9])$/i);
  if (!match) return { group: "", pad: "" };
  return { group: match[1].toUpperCase(), pad: Number(match[2]) };
}

function normalizeManifestSample(sample, index) {
  return {
    id: sample.id || `manifest-${index}`,
    slot: clampNumber(sample.slot || sample.slotNumber || sample.index || index + 1, 1, 999, index + 1),
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
  return state.samples.filter((sample) => {
    const bankMatch = sampleBank(sample) === state.activeBank;
    if (!bankMatch) return false;
    if (!query) return true;
    return [sample.slot, sample.name, sample.fileName, sample.type, sample.source].join(" ").toLowerCase().includes(query);
  });
}

function renderLibrary() {
  renderBankTabs();
  renderLibraryStats();
  const rows = filteredSamples();
  if (!rows.length) {
    els.libraryRows.innerHTML = '<tr><td colspan="11" class="muted">No matching samples in this bank.</td></tr>';
    renderTimeline();
    updateButtons();
    return;
  }

  els.libraryRows.innerHTML = rows.map((sample) => {
    const checked = state.selected.has(sample.id) ? " checked" : "";
    const assignments = assignedPadsForSample(sample.id);
    return `<tr>
      <td><input class="rowCheck" type="checkbox" data-id="${escapeHtml(sample.id)}"${checked}></td>
      <td><span class="slot-pill">${sample.slot || "-"}</span></td>
      <td>${assignmentHtml(assignments)}</td>
      <td><strong>${escapeHtml(sample.name)}</strong><div class="muted mono">${escapeHtml(sample.source)}</div></td>
      <td>${escapeHtml(sample.channels ? `${sample.channels}ch ${sample.type}` : sample.type)}</td>
      <td>${seconds(sample.duration)}</td>
      <td>${sample.sampleRate ? `${sample.sampleRate} Hz` : "-"}</td>
      <td>${bytesToHuman(sample.sizeBytes)}</td>
      <td>${waveHtml(sample.waveform)}</td>
      <td>${sample.objectUrl ? `<audio controls preload="none" src="${sample.objectUrl}"></audio>` : '<span class="muted">no buffer</span>'}</td>
      <td><div class="action-row"><button class="playOne" data-id="${escapeHtml(sample.id)}" type="button" title="Play this local audio buffer."${sample.buffer ? "" : " disabled"}>Play</button><button class="downloadOne" data-id="${escapeHtml(sample.id)}" type="button" title="Download this local audio buffer as WAV."${sample.buffer ? "" : " disabled"}>WAV</button></div></td>
    </tr>`;
  }).join("");
  renderTimeline();
  updateButtons();
}

function renderBankTabs() {
  els.bankTabs.innerHTML = Array.from({ length: 10 }, (_, index) => {
    const bank = index + 1;
    const count = state.samples.filter((sample) => sampleBank(sample) === bank).length;
    const active = state.activeBank === bank ? " active" : "";
    return `<button class="bank-tab${active}" type="button" data-bank="${bank}" title="Show sample slots ${(bank - 1) * 100 + 1}-${bank === 10 ? 999 : bank * 100}.">Bank ${bank}<span>${count}</span></button>`;
  }).join("");
}

function renderLibraryStats() {
  const used = state.samples.length;
  const bytes = state.samples.reduce((total, sample) => total + Number(sample.sizeBytes || 0), 0);
  els.libraryStats.textContent = `${used} / 999 slots · ${bytesToHuman(bytes)}`;
}

function assignedPadsForSample(sampleId) {
  return state.pads.filter((pad) => String(pad.soundId) === String(sampleId));
}

function assignmentHtml(assignments) {
  if (!assignments.length) return '<span class="assign-dot" title="Not assigned"></span>';
  const label = assignments.map((pad) => `${pad.group || "-"}${pad.pad}`).join(", ");
  return `<span class="assign-dot active" title="${escapeHtml(label)}"></span><span class="muted">${escapeHtml(label)}</span>`;
}

function renderProject() {
  els.projectSummary.textContent = `${state.scenes.length} scenes / ${state.tracks.length} tracks / ${state.pads.length} pads`;
  els.sceneList.classList.toggle("muted", !state.scenes.length);
  els.trackList.classList.toggle("muted", !state.tracks.length);
  els.padList.classList.toggle("muted", !state.pads.length);
  renderPadGrid();
  els.sceneList.innerHTML = state.scenes.length ? state.scenes.map((scene) => `<div class="item">
    <strong>${escapeHtml(scene.name)}</strong>
    <div class="sub">${escapeHtml(scene.song)} · ${scene.bars || 0} bars · groups ${escapeHtml((scene.groups || []).join(", ") || "-")} · patterns ${escapeHtml((scene.patterns || []).join(", ") || "-")}</div>
  </div>`).join("") : "No scenes loaded.";
  els.trackList.innerHTML = state.tracks.length ? state.tracks.map((track) => `<div class="item">
    <strong>${escapeHtml(track.name)}</strong>
    <div class="sub">${escapeHtml(track.song)} · ${escapeHtml(track.group || "-")} · ${track.clips.length} clips</div>
    <div class="sub">${track.clips.map((clip) => `${escapeHtml(clip.soundName)} @ ${clip.barStart || 0}/${clip.bars || 0}`).join("<br>") || "No clips"}</div>
  </div>`).join("") : "No tracks loaded.";
  els.padList.innerHTML = state.pads.length ? state.pads.map((pad) => `<div class="item">
    <strong>${escapeHtml(pad.group ? `${pad.group} ${pad.pad}` : `Pad ${pad.pad}`)}</strong>
    <div class="sub">${escapeHtml(pad.song)} Â· ${escapeHtml(pad.soundName || pad.soundId || "-")} Â· ${escapeHtml(pad.mode || "-")}</div>
  </div>`).join("") : "No pads loaded.";
  renderTimeline();
}

function renderPadGrid() {
  const groupPads = state.pads.filter((pad) => String(pad.group || "").toUpperCase() === state.activeGroup);
  els.padGrid.innerHTML = Array.from({ length: 12 }, (_, index) => {
    const padNumber = index + 1;
    const pad = groupPads.find((item) => Number(item.pad) === padNumber || String(item.pad).toUpperCase() === String(padNumber));
    const assigned = pad ? " assigned" : "";
    const label = pad ? pad.soundName || pad.soundId || "Assigned" : "Empty";
    return `<button class="pad-cell${assigned}" type="button" data-pad="${padNumber}" data-sound-id="${escapeHtml(pad ? pad.soundId : "")}" title="${escapeHtml(label)}">
      <span>${state.activeGroup}${padNumber}</span>
      <strong>${escapeHtml(label)}</strong>
    </button>`;
  }).join("");
}

function playCurrentSample(offset = null) {
  const sample = currentPlayableSample();
  if (!sample || !sample.buffer) return;
  const audio = ensureAudioContext(state);
  const requestedOffset = offset ?? (state.transport.pausedAt || 0);
  const startOffset = requestedOffset >= sample.buffer.duration ? 0 : Math.max(0, Math.min(requestedOffset, sample.buffer.duration));
  stopTransport(false);
  const source = audio.createBufferSource();
  source.buffer = sample.buffer;
  source.connect(audio.destination);
  source.onended = () => {
    if (state.transport.source === source) stopTransport(false);
  };
  source.start(0, startOffset);
  state.transport.playing = true;
  state.transport.startedAt = audio.currentTime - startOffset;
  state.transport.pausedAt = startOffset;
  state.transport.duration = sample.buffer.duration;
  state.transport.sampleId = sample.id;
  state.transport.label = sample.name;
  state.transport.source = source;
  recordTimelineEvent("audio", sample.name, startOffset, sample.buffer.duration - startOffset, sample.id);
  log(`Playback started: ${sample.name} @ ${seconds(startOffset)}.`);
  startTimelineLoop();
  updateButtons();
}

function stopTransport(reset = true) {
  if (state.transport.source) {
    try {
      state.transport.source.onended = null;
      state.transport.source.stop();
    } catch (error) {
      // Source may already be stopped by the browser audio engine.
    }
  }
  if (state.transport.playing) {
    state.transport.pausedAt = reset ? 0 : transportCurrentTime();
  } else if (reset) {
    state.transport.pausedAt = 0;
  }
  state.transport.playing = false;
  state.transport.source = null;
  cancelAnimationFrame(state.transport.frame);
  renderTimeline();
  updateButtons();
}

function transportCurrentTime() {
  if (!state.transport.playing || !state.audioContext) return state.transport.pausedAt || 0;
  return Math.min(state.transport.duration || 0, Math.max(0, state.audioContext.currentTime - state.transport.startedAt));
}

function startTimelineLoop() {
  cancelAnimationFrame(state.transport.frame);
  const tick = () => {
    renderTimeline();
    if (state.transport.playing) state.transport.frame = requestAnimationFrame(tick);
  };
  tick();
}

function renderTimeline() {
  const sample = state.samples.find((item) => item.id === state.transport.sampleId) || currentPlayableSample();
  const arrangementDuration = arrangementTimelineDuration();
  const duration = Math.max(4, state.transport.duration || sample?.duration || arrangementDuration || 16);
  const current = Math.min(duration, transportCurrentTime());
  const percent = duration ? (current / duration) * 100 : 0;
  els.timelineTime.textContent = `${formatTimelineTime(current)} / ${formatTimelineTime(duration)}`;
  els.timelinePlayhead.style.left = `${percent}%`;
  renderTimelineRuler(duration);
  renderTimelineLanes(duration, sample);
}

function renderTimelineRuler(duration) {
  const ticks = 8;
  els.timelineRuler.innerHTML = Array.from({ length: ticks + 1 }, (_, index) => {
    const time = (duration / ticks) * index;
    return `<span style="left:${(index / ticks) * 100}%">${formatTimelineTime(time)}</span>`;
  }).join("");
}

function renderTimelineLanes(duration, sample) {
  const audioClip = sample ? timelineClipHtml({
    label: sample.name,
    start: 0,
    duration: sample.duration || duration,
    total: duration,
    className: state.transport.sampleId === sample.id ? " playing" : ""
  }) : "";
  const arrangement = arrangementClipHtml(duration);
  const midi = midiEventHtml(duration);
  els.timelineLanes.innerHTML = `
    ${timelineLaneHtml("Audio", audioClip || '<span class="timeline-empty">No local sample selected</span>')}
    ${timelineLaneHtml("Project", arrangement || '<span class="timeline-empty">No clips loaded</span>')}
    ${timelineLaneHtml("MIDI In", midi || '<span class="timeline-empty">No MIDI activity</span>')}
  `;
}

function timelineLaneHtml(label, content) {
  return `<div class="timeline-row"><div class="timeline-lane-label">${escapeHtml(label)}</div><div class="timeline-track">${content}</div></div>`;
}

function timelineClipHtml({ label, start, duration, total, className = "" }) {
  const left = Math.max(0, Math.min(100, (start / total) * 100));
  const width = Math.max(1, Math.min(100 - left, (duration / total) * 100));
  return `<button class="timeline-clip${className}" type="button" style="left:${left}%;width:${width}%;" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
}

function arrangementClipHtml(total) {
  const secondsPerBar = 2;
  return state.tracks.flatMap((track) => (track.clips || []).map((clip) => timelineClipHtml({
    label: `${track.name}: ${clip.soundName || clip.soundId || "clip"}`,
    start: Number(clip.barStart || 0) * secondsPerBar,
    duration: Math.max(secondsPerBar / 2, Number(clip.bars || 1) * secondsPerBar),
    total,
    className: " project"
  }))).join("");
}

function midiEventHtml(total) {
  const now = transportCurrentTime();
  return state.transport.events
    .filter((event) => event.type === "midi" && event.start >= Math.max(0, now - total) && event.start <= total)
    .map((event) => timelineClipHtml({
      label: event.label,
      start: event.start,
      duration: event.duration,
      total,
      className: " midi"
    }))
    .join("");
}

function arrangementTimelineDuration() {
  const secondsPerBar = 2;
  const ends = state.tracks.flatMap((track) => (track.clips || []).map((clip) => (Number(clip.barStart || 0) + Number(clip.bars || 1)) * secondsPerBar));
  return Math.max(0, ...ends);
}

function recordTimelineEvent(type, label, start, duration = 0.25, sampleId = "") {
  state.transport.events.push({ type, label, start, duration, sampleId });
  if (state.transport.events.length > 160) state.transport.events.splice(0, state.transport.events.length - 160);
  renderTimeline();
}

function recordMidiEvent(data) {
  const status = data[0] & 0xf0;
  const channel = (data[0] & 0x0f) + 1;
  const note = data[1];
  const velocity = data[2] || 0;
  const label = status === 0x90 && velocity ? `ch${channel} note ${note}` : status === 0x80 || status === 0x90 ? `ch${channel} off ${note}` : `ch${channel} ${bytesToHex(data)}`;
  recordTimelineEvent("midi", label, transportCurrentTime(), 0.35);
}

function seekTimeline(event) {
  const sample = state.samples.find((item) => item.id === state.transport.sampleId) || currentPlayableSample();
  if (!sample?.buffer) return;
  const rect = els.timelineViewport.getBoundingClientRect();
  const offset = ((event.clientX - rect.left) / rect.width) * sample.buffer.duration;
  if (state.transport.playing) playCurrentSample(offset);
  else {
    state.transport.sampleId = sample.id;
    state.transport.label = sample.name;
    state.transport.duration = sample.buffer.duration;
    state.transport.pausedAt = Math.max(0, Math.min(sample.buffer.duration, offset));
    renderTimeline();
    updateButtons();
  }
}

function formatTimelineTime(value) {
  if (!Number.isFinite(value)) return "--";
  const minutes = Math.floor(value / 60);
  const secondsValue = value - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${secondsValue.toFixed(2).padStart(5, "0")}`;
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
  const hasTree = state.deviceNodesByPath.size > 0;
  const hasPads = state.pads.length > 0;
  const hasComparison = state.comparison.length > 0;
  const proposals = [
    ["Official parity", "Reference target: 999 sample slots, ten banks, groups A-D, 12 pads, assignment dots, drag/drop upload, rename, trim, download, delete, and project backup/restore."],
    ["Read-only browser", "Implemented recursive folder scan with configurable depth and cached tree export."],
    ["Sample backup", hasTree ? "Device tree cache is ready for verified sample backup once file GET is implemented." : "List or scan the device tree before attempting backup mapping."],
    ["Pad assignment", hasPads ? "Imported pad assignments are rendered by group, pad, and sample." : "Pad assignment view is ready for manifests that include pads or padAssignments."],
    ["Project view", "Scenes, tracks, clips, pads, ten sample banks, and local audio contents render from imported metadata."],
    ["Safe write mode", "Write privileges can be surfaced at runtime, but protocol writes remain blocked until verified."],
    ["Compare mode", hasComparison ? "Local samples have been compared against cached device filenames and sizes." : "Use Compare device after loading local samples and scanning the device tree."],
    ["Session capture", "Implemented protocol log export for validation and sharing."]
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
    pads: state.pads,
    comparison: state.comparison,
    deviceTree: [...state.deviceNodesByPath.entries()].map(([path, node]) => ({ path, id: node.id, flags: node.flags, size: node.size, name: node.name }))
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "ko2-local-samples.json");
}

function compareLocalSamplesToDevice() {
  const deviceFiles = [...state.deviceNodesByPath.entries()]
    .filter(([, node]) => node.isFile)
    .map(([path, node]) => ({ path, node, normalized: normalizeCompareName(node.name || path.split("/").pop()) }));

  state.comparison = state.samples.map((sample) => {
    const names = [sample.fileName, sample.name].filter(Boolean).map(normalizeCompareName);
    const nameMatch = deviceFiles.find((file) => names.includes(file.normalized));
    const sizeMatch = sample.sizeBytes ? deviceFiles.find((file) => file.node.size === sample.sizeBytes) : null;
    const match = nameMatch || sizeMatch || null;
    return {
      sampleId: sample.id,
      sampleName: sample.name,
      localBytes: sample.sizeBytes,
      devicePath: match ? match.path : "",
      deviceBytes: match ? match.node.size : 0,
      status: match ? (sample.sizeBytes && match.node.size && sample.sizeBytes !== match.node.size ? "name-match-size-diff" : "matched") : "missing"
    };
  });

  log("Device comparison complete.", {
    matched: state.comparison.filter((item) => item.status !== "missing").length,
    missing: state.comparison.filter((item) => item.status === "missing").length,
    results: state.comparison
  });
  renderProposals();
  updateButtons();
}

function normalizeCompareName(value) {
  return safeName(String(value || "").replace(/\.[^.]+$/, "")).toLowerCase();
}

function exportDeviceTree() {
  downloadBlob(new Blob([JSON.stringify({
    exportedAt: new Date().toISOString(),
    device: state.device,
    nodes: [...state.deviceNodesByPath.entries()].map(([path, node]) => ({
      path,
      id: node.id,
      parentPath: node.parentPath || "",
      flags: node.flags,
      size: node.size,
      name: node.name,
      isDirectory: node.isDirectory,
      isFile: node.isFile
    }))
  }, null, 2)], { type: "application/json" }), "ko2-device-tree.json");
}

function exportProtocolLog() {
  downloadBlob(new Blob([els.log.textContent], { type: "text/plain" }), "ko2-protocol-log.txt");
}

function syncSettingsForm() {
  els.settingRequestSysex.checked = state.settings.requestSysex;
  els.settingAutoSysexRetry.checked = state.settings.autoSysexRetry;
  els.settingAutoSelectKo.checked = state.settings.autoSelectKo;
  els.settingListenInput.checked = state.settings.listenInput;
  els.settingAllowReadProbes.checked = state.settings.allowReadProbes;
  els.settingUnlockWriteActions.checked = state.settings.unlockWriteActions;
  els.settingLogRawMidi.checked = state.settings.logRawMidi;
  els.settingAutoLoadProject.checked = state.settings.autoLoadProject;
  els.settingDeviceId.value = state.settings.deviceId;
  els.settingProbeTimeout.value = state.settings.probeTimeout;
  els.settingPollAttempts.value = state.settings.portPollAttempts;
  els.settingPollInterval.value = state.settings.portPollInterval;
  els.settingScanDepth.value = state.settings.recursiveScanDepth;
  els.settingPcmSampleRate.value = state.settings.pcmSampleRate;
  els.settingPcmChannels.value = state.settings.pcmChannels;
  els.settingPcmBitDepth.value = state.settings.pcmBitDepth;
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
    autoLoadProject: els.settingAutoLoadProject.checked,
    deviceId: clampNumber(els.settingDeviceId.value, 0, 127, defaultSettings.deviceId),
    probeTimeout: clampNumber(els.settingProbeTimeout.value, 250, 30000, defaultSettings.probeTimeout),
    portPollAttempts: clampNumber(els.settingPollAttempts.value, 0, 30, defaultSettings.portPollAttempts),
    portPollInterval: clampNumber(els.settingPollInterval.value, 50, 5000, defaultSettings.portPollInterval),
    recursiveScanDepth: clampNumber(els.settingScanDepth.value, 1, 10, defaultSettings.recursiveScanDepth),
    pcmSampleRate: clampNumber(els.settingPcmSampleRate.value, 8000, 192000, defaultSettings.pcmSampleRate),
    pcmChannels: clampNumber(els.settingPcmChannels.value, 1, 2, defaultSettings.pcmChannels),
    pcmBitDepth: clampNumber(els.settingPcmBitDepth.value, 8, 32, defaultSettings.pcmBitDepth)
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
  els.settingAutoLoadProject,
  els.settingDeviceId,
  els.settingProbeTimeout,
  els.settingPollAttempts,
  els.settingPollInterval,
  els.settingScanDepth,
  els.settingPcmSampleRate,
  els.settingPcmChannels,
  els.settingPcmBitDepth
].forEach((control) => control.addEventListener("change", readSettingsForm));
els.exportSettingsBtn.addEventListener("click", exportSettings);
els.resetSettingsBtn.addEventListener("click", resetSettings);
els.playSelectedBtn.addEventListener("click", () => playCurrentSample());
els.stopTimelineBtn.addEventListener("click", () => stopTransport(true));
els.timelineViewport.addEventListener("click", seekTimeline);
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
els.scanTreeBtn.addEventListener("click", scanDeviceTree);
els.exportTreeBtn.addEventListener("click", exportDeviceTree);
els.uploadSampleBtn.addEventListener("click", () => lockedAction("Upload sample"));
els.deleteSampleBtn.addEventListener("click", () => lockedAction("Delete sample"));
els.moveFileBtn.addEventListener("click", () => lockedAction("Move file"));
els.writeMetadataBtn.addEventListener("click", () => lockedAction("Write metadata"));
els.devicePlaybackBtn.addEventListener("click", () => lockedAction("Device playback"));
els.backupRestoreBtn.addEventListener("click", () => lockedAction("Backup / restore"));
els.fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
els.searchInput.addEventListener("input", renderLibrary);
els.bankTabs.addEventListener("click", (event) => {
  const button = event.target.closest(".bank-tab");
  if (!button) return;
  state.activeBank = Number(button.dataset.bank);
  renderLibrary();
});
els.activeGroupSelect.addEventListener("change", () => {
  state.activeGroup = els.activeGroupSelect.value;
  renderProject();
});
els.padGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".pad-cell");
  if (!button || !button.dataset.soundId) return;
  const sample = state.samples.find((item) => String(item.id) === String(button.dataset.soundId));
  if (!sample) {
    log(`Pad ${state.activeGroup}${button.dataset.pad}: assigned sample ${button.dataset.soundId} is not in the local manifest.`);
    return;
  }
  state.activeBank = sampleBank(sample);
  state.selected.clear();
  state.selected.add(sample.id);
  els.searchInput.value = "";
  renderLibrary();
  log(`Pad ${state.activeGroup}${button.dataset.pad}: selected sample ${sample.name}.`);
});
els.clearLogBtn.addEventListener("click", () => els.log.textContent = "Log cleared.");
els.exportLogBtn.addEventListener("click", exportProtocolLog);
els.clearTreeBtn.addEventListener("click", () => {
  state.deviceNodesByPath.clear();
  state.deviceTree = [];
  state.comparison = [];
  renderDeviceTree();
  renderProposals();
  updateButtons();
});
els.exportManifestBtn.addEventListener("click", exportManifest);
els.compareDeviceBtn.addEventListener("click", compareLocalSamplesToDevice);
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
  const playButton = event.target.closest(".playOne");
  if (playButton) {
    const sample = state.samples.find((item) => item.id === playButton.dataset.id);
    if (sample) {
      state.selected.clear();
      state.selected.add(sample.id);
      playCurrentSample(0);
      renderLibrary();
    }
    return;
  }
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
renderLibrary();
renderProject();
renderDeviceTree();
renderProposals();
updateButtons();
})();
