const EXPERIMENTAL_WRITE_ENABLED = false;

const MIDI = {
  SYSEX_START: 0xf0,
  SYSEX_END: 0xf7,
  TE_ID: [0x00, 0x20, 0x76],
  TE_MARKER: 0x40
};

const TE_SYSEX = {
  GREET: 1,
  ECHO: 2,
  DFU: 3,
  PRODUCT_SPECIFIC: 127,
  STATUS_OK: 0,
  STATUS_ERROR: 1,
  STATUS_COMMAND_NOT_FOUND: 2,
  STATUS_BAD_REQUEST: 3,
  STATUS_SPECIFIC_ERROR_START: 16,
  STATUS_SPECIFIC_SUCCESS_START: 64
};

const TE_FILE = {
  COMMAND: 5,
  INIT: 1,
  INIT_SUBSCRIBE: 1,
  PUT: 2,
  PUT_TYPE_INIT: 0,
  PUT_TYPE_DATA: 1,
  GET: 3,
  GET_TYPE_INIT: 0,
  GET_TYPE_DATA: 1,
  LIST: 4,
  PLAYBACK: 5,
  DELETE: 6,
  METADATA: 7,
  METADATA_SET: 1,
  METADATA_GET: 2,
  METADATA_SET_PAGED: 4,
  FILE_TYPE_FILE: 1,
  FILE_TYPE_DIR: 2,
  CAPABILITY_READ: 4,
  CAPABILITY_WRITE: 8,
  CAPABILITY_DELETE: 16,
  CAPABILITY_MOVE: 32,
  CAPABILITY_PLAYBACK: 64,
  PLAYBACK_START: 1,
  PLAYBACK_STOP: 2,
  INFO: 11,
  MOVED: 12
};

const TE_FILE_EVENT = {
  METADATA_UPDATED: 3,
  FILE_ADDED: 8,
  FILE_UPDATED: 9,
  FILE_DELETED: 10,
  FILE_MOVED: 13
};

const BIT_IS_REQUEST = 0x40;
const BIT_REQUEST_ID_AVAILABLE = 0x20;
const WRITE_SUBCOMMANDS = new Set([
  TE_FILE.PUT,
  TE_FILE.DELETE,
  TE_FILE.MOVED,
  TE_FILE.PLAYBACK
]);

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

function stringToBytes(value) {
  return new TextEncoder().encode(value);
}

function bytesToString(bytes) {
  return new TextDecoder().decode(bytes);
}

function packTo7BitPayload(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const packedLength = source.length + Math.ceil(source.length / 7);
  const packed = new Uint8Array(packedLength);
  let dataIndex = 1;
  let headerIndex = 0;

  for (let i = 0; i < source.length; i += 1) {
    const groupOffset = i % 7;
    packed[headerIndex] |= (source[i] >> 7) << groupOffset;
    packed[dataIndex] = source[i] & 0x7f;
    dataIndex += 1;

    if (groupOffset === 6 && i < source.length - 1) {
      headerIndex += 8;
      dataIndex += 1;
    }
  }

  return packed;
}

function unpack7BitPayload(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const unpacked = new Uint8Array(source.length);
  let writeIndex = 0;
  let headerIndex = 0;
  let headerBit = 0;
  let header = source[headerIndex] || 0;

  for (let readIndex = 1; readIndex < source.length; readIndex += 1) {
    const highBit = (header & (1 << headerBit)) ? 0x80 : 0;
    unpacked[writeIndex] = highBit | (source[readIndex] & 0x7f);
    writeIndex += 1;
    headerBit += 1;

    if (headerBit > 6) {
      headerIndex += 8;
      readIndex += 1;
      headerBit = 0;
      header = source[headerIndex] || 0;
    }
  }

  return unpacked.subarray(0, writeIndex);
}

function parseUniversalIdentity(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length !== 17) return null;
  const isUniversalReply = bytes[0] === 0xf0 && bytes[1] === 0x7e && bytes[3] === 0x06 && bytes[4] === 0x02;
  const isTeenage = bytes[5] === MIDI.TE_ID[0] && bytes[6] === MIDI.TE_ID[1] && bytes[7] === MIDI.TE_ID[2];
  if (!isUniversalReply || !isTeenage) return null;
  const product = bytes[8] ^ (bytes[9] << 7);
  const variant = bytes[10] ^ (bytes[11] << 7);
  return {
    deviceId: bytes[2],
    sku: `TE${String(product).padStart(3, "0")}AS${String(variant).padStart(3, "0")}`,
    raw: bytes
  };
}

function parseTeMetadataString(value) {
  const metadata = {
    chip_id: "",
    mode: "",
    os_version: "",
    product: "",
    serial: "",
    sku: "",
    sw_version: "",
    base_sku: ""
  };

  String(value || "").split(";").forEach((part) => {
    const [key, val] = part.split(":");
    if (key in metadata) metadata[key] = val || "";
  });

  return metadata;
}

function statusToString(status) {
  if (status === TE_SYSEX.STATUS_OK) return "ok";
  if (status >= TE_SYSEX.STATUS_SPECIFIC_SUCCESS_START) return "command-specific-success";
  if (status === TE_SYSEX.STATUS_ERROR) return "error";
  if (status === TE_SYSEX.STATUS_COMMAND_NOT_FOUND) return "not-found";
  if (status === TE_SYSEX.STATUS_BAD_REQUEST) return "bad-request";
  if (status >= TE_SYSEX.STATUS_SPECIFIC_ERROR_START && status < TE_SYSEX.STATUS_SPECIFIC_SUCCESS_START) {
    return "command-specific-error";
  }
  return "unknown";
}

class FSEntry {
  constructor({ id, parentId = 0, name = "", flags = 0, size = 0 }) {
    this.id = id;
    this.parentId = parentId;
    this.name = name;
    this.flags = flags;
    this.size = size;
  }

  get isDirectory() {
    return (this.flags & TE_FILE.FILE_TYPE_DIR) === TE_FILE.FILE_TYPE_DIR;
  }

  get isFile() {
    return (this.flags & TE_FILE.FILE_TYPE_FILE) === TE_FILE.FILE_TYPE_FILE;
  }
}

function buildFileInitPayload(maxResponseLength = 4 * 1024 * 1024, subscribe = true) {
  const bytes = new Uint8Array(6);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, TE_FILE.INIT);
  view.setUint8(1, subscribe ? TE_FILE.INIT_SUBSCRIBE : 0);
  view.setUint32(2, maxResponseLength);
  return bytes;
}

function parseFileInitResponse(payload) {
  if (payload.length < 5) return null;
  return {
    chunkSize: (payload[1] << 24) | (payload[2] << 16) | (payload[3] << 8) | payload[4]
  };
}

function buildFileListPayload(nodeId = 0, page = 0) {
  const bytes = new Uint8Array(5);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, TE_FILE.LIST);
  view.setUint16(1, page);
  view.setUint16(3, nodeId);
  return bytes;
}

function buildFileInfoPayload(nodeId = 0) {
  const bytes = new Uint8Array(3);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, TE_FILE.INFO);
  view.setUint16(1, nodeId);
  return bytes;
}

function buildFileMetadataGetPayload(nodeId = 0, page = 0, key = "") {
  const keyBytes = key ? stringToBytes(key) : new Uint8Array(0);
  const bytes = new Uint8Array(6 + (keyBytes.length ? keyBytes.length + 1 : 0));
  const view = new DataView(bytes.buffer);
  view.setUint8(0, TE_FILE.METADATA);
  view.setUint8(1, TE_FILE.METADATA_GET);
  view.setUint16(2, nodeId);
  view.setUint16(4, page);
  if (keyBytes.length) {
    bytes.set(keyBytes, 6);
    bytes[bytes.length - 1] = 0;
  }
  return bytes;
}

function parseJsonMetadataPayload(payload) {
  if (payload.length <= 2) return { page: 0, done: true, metadata: {} };
  const page = (payload[0] << 8) | payload[1];
  const raw = payload.subarray(2);
  const nul = raw.indexOf(0);
  const text = bytesToString(nul >= 0 ? raw.subarray(0, nul) : raw);
  let metadata = {};
  try {
    metadata = text ? JSON.parse(text) : {};
  } catch (error) {
    metadata = { parseError: error.message, raw: text };
  }
  return { page, done: nul >= 0, metadata, raw: text };
}

function parseFileListResponse(payload) {
  if (payload.length <= 2) return { page: 0, entries: [] };
  const page = (payload[0] << 8) | payload[1];
  const entries = [];
  let offset = 2;

  while (offset + 7 <= payload.length) {
    const id = (payload[offset] << 8) | payload[offset + 1];
    const flags = payload[offset + 2];
    const size = (payload[offset + 3] << 24) | (payload[offset + 4] << 16) | (payload[offset + 5] << 8) | payload[offset + 6];
    let nameEnd = offset + 7;
    while (nameEnd < payload.length && payload[nameEnd] !== 0) nameEnd += 1;
    const name = bytesToString(payload.subarray(offset + 7, nameEnd));
    entries.push(new FSEntry({ id, flags, size, name }));
    offset = nameEnd + 1;
  }

  return { page, entries };
}

class TeSysexClient {
  constructor({ log = () => {} } = {}) {
    this.log = log;
    this.requestId = Math.floor(Math.random() * 4095);
    this.pending = new Map();
    this.output = null;
    this.deviceId = 0x7f;
  }

  configure({ output, deviceId }) {
    this.output = output || null;
    if (Number.isInteger(deviceId)) this.deviceId = deviceId;
  }

  nextRequestId() {
    this.requestId = (this.requestId + 1) % 4096;
    return this.requestId;
  }

  buildFrame(command, payload = new Uint8Array(), requestId = this.nextRequestId()) {
    const safePayload = packTo7BitPayload(payload);
    const frame = new Uint8Array(10 + safePayload.length);
    frame[0] = MIDI.SYSEX_START;
    frame.set(MIDI.TE_ID, 1);
    frame[4] = this.deviceId;
    frame[5] = MIDI.TE_MARKER;
    frame[6] = BIT_IS_REQUEST | BIT_REQUEST_ID_AVAILABLE | ((requestId >> 7) & 0x1f);
    frame[7] = requestId & 0x7f;
    frame[8] = command;
    frame.set(safePayload, 9);
    frame[frame.length - 1] = MIDI.SYSEX_END;
    return { frame, requestId };
  }

  parseFrame(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const valid = bytes.length >= 9
      && bytes[0] === MIDI.SYSEX_START
      && bytes[1] === MIDI.TE_ID[0]
      && bytes[2] === MIDI.TE_ID[1]
      && bytes[3] === MIDI.TE_ID[2]
      && bytes[5] === MIDI.TE_MARKER
      && bytes[bytes.length - 1] === MIDI.SYSEX_END;

    if (!valid) return null;

    const hasRequestId = (bytes[6] & BIT_REQUEST_ID_AVAILABLE) === BIT_REQUEST_ID_AVAILABLE;
    const type = (bytes[6] & BIT_IS_REQUEST) === BIT_IS_REQUEST ? "request" : "response";
    const requestId = hasRequestId ? ((bytes[6] & 0x1f) << 7) | (bytes[7] & 0x7f) : null;
    const command = bytes[8];
    let offset = 9;
    let status = -1;

    if (type === "response") {
      status = bytes[offset];
      offset += 1;
    }

    const payload = unpack7BitPayload(bytes.subarray(offset, bytes.length - 1));
    return {
      kind: "te-sysex",
      type,
      deviceId: bytes[4],
      requestId,
      command,
      status,
      statusText: statusToString(status),
      payload,
      raw: bytes
    };
  }

  send(command, payload = new Uint8Array()) {
    if (!this.output) throw new Error("No MIDI output selected");
    assertCommandAllowed(command, payload);
    const { frame, requestId } = this.buildFrame(command, payload);
    this.output.send(frame);
    this.log(`sent TE SysEx request #${requestId}, command ${command}: ${bytesToHex(frame)}`);
    return requestId;
  }

  sendAndReceive(command, payload = new Uint8Array(), timeoutMs = 2500) {
    const requestId = this.send(command, payload);
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Timed out waiting for TE SysEx response #${requestId}`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timeout });
    });
  }

  handleMessage(data) {
    const parsed = this.parseFrame(data);
    if (!parsed) return null;

    if (parsed.requestId !== null && this.pending.has(parsed.requestId)) {
      const pending = this.pending.get(parsed.requestId);
      window.clearTimeout(pending.timeout);
      this.pending.delete(parsed.requestId);
      pending.resolve(parsed);
    }

    return parsed;
  }
}

function assertCommandAllowed(command, payload) {
  if (command !== TE_FILE.COMMAND) return;
  const subcommand = payload[0];
  const metadataType = payload[1];
  if (!EXPERIMENTAL_WRITE_ENABLED && subcommand === TE_FILE.METADATA && metadataType !== TE_FILE.METADATA_GET) {
    throw new Error("Blocked write-capable TE metadata subcommand; EXPERIMENTAL_WRITE_ENABLED is false");
  }
  if (!EXPERIMENTAL_WRITE_ENABLED && WRITE_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`Blocked write-capable TE file subcommand ${subcommand}; EXPERIMENTAL_WRITE_ENABLED is false`);
  }
}

function selfTestPacking() {
  const sample = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 127, 128, 129, 255]);
  const roundTrip = unpack7BitPayload(packTo7BitPayload(sample));
  return sample.length === roundTrip.length && sample.every((byte, index) => byte === roundTrip[index]);
}

window.KO2Sysex = {
  EXPERIMENTAL_WRITE_ENABLED,
  MIDI,
  TE_SYSEX,
  TE_FILE,
  TE_FILE_EVENT,
  FSEntry,
  TeSysexClient,
  buildFileInitPayload,
  buildFileInfoPayload,
  buildFileListPayload,
  buildFileMetadataGetPayload,
  bytesToHex,
  bytesToString,
  parseFileInitResponse,
  parseJsonMetadataPayload,
  parseFileListResponse,
  parseTeMetadataString,
  parseUniversalIdentity,
  selfTestPacking,
  stringToBytes,
  packTo7BitPayload,
  unpack7BitPayload,
  statusToString
};
