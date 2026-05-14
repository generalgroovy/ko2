# Teenage Engineering EP / KO II Protocol Notes

These notes are based on static inspection of the live EP Sample Tool bundle and public Teenage Engineering pages. They should be treated as implementation notes, not official protocol documentation.

## Transport

The app uses Web MIDI with SysEx:

```js
navigator.requestMIDIAccess({ sysex: true })
```

The browser APIs observed in the official bundle are:

- `navigator.requestMIDIAccess`
- `onmidimessage`
- `MIDIOutput.send()`

No direct WebUSB, WebSerial, or WebHID usage was found.

## SysEx Frame

Teenage Engineering manufacturer ID:

```text
00 20 76
```

Observed TE frame shape:

```text
F0
00 20 76        manufacturer ID
<device_id>
40              TE marker
<flags/request-id-hi>
<request-id-lo>
<command>
<7-bit-packed payload>
F7
```

Requests include a 12-bit request ID split across the flag byte and request-id low byte. Responses are matched by request ID.

Payloads are packed to MIDI-safe 7-bit bytes before sending and unpacked after receiving.

## General Commands

```js
GREET = 1
ECHO = 2
DFU = 3
PRODUCT_SPECIFIC = 127
```

Statuses:

```js
STATUS_OK = 0
STATUS_ERROR = 1
STATUS_COMMAND_NOT_FOUND = 2
STATUS_BAD_REQUEST = 3
STATUS_SPECIFIC_ERROR_START = 16
STATUS_SPECIFIC_SUCCESS_START = 64
```

## File Command Group

```js
TE_SYSEX_FILE = 5
```

Subcommands:

```js
INIT = 1
PUT = 2
GET = 3
LIST = 4
PLAYBACK = 5
DELETE = 6
METADATA = 7
INFO = 11
MOVED = 12
```

File events:

```js
METADATA_UPDATED = 3
FILE_ADDED = 8
FILE_UPDATED = 9
FILE_DELETED = 10
FILE_MOVED = 13
```

Capability flags:

```js
READ = 4
WRITE = 8
DELETE = 16
MOVE = 32
PLAYBACK = 64
```

## Implemented Read-Only Helpers

This repo currently implements:

- TE SysEx frame build/parse.
- 7-bit payload pack/unpack.
- Universal identity parsing.
- File protocol init payload and response parsing.
- Root/list payload and response parsing.
- File entry model.

## Intentionally Blocked

The code blocks write-capable operations by default:

- sample upload
- file delete
- file move
- metadata write
- playback start

This is deliberate. The official app has a tested implementation, but this repo does not yet have device traffic tests or recovery tooling.

## Official App Capabilities Observed

The official EP Sample Tool appears to implement:

- device discovery
- identity parsing
- metadata parsing
- file tree list/get/put/delete/move
- metadata get/set
- sample upload
- sample download as WAV
- sound preview/playback
- project backup
- project restore
- SKU compatibility checks
- free-space checks
- CRC checks during restore
- audio conversion and resampling through WASM libraries

WASM libraries referenced by the official bundle:

- `libsndfile`
- `libsamplerate`
- `libtag`
- `libtag_c`

## Unknowns Requiring Hardware Testing

- Exact behavior of `GREET` against each supported EP SKU.
- Whether root LIST works before specific metadata or active-project setup.
- Whether firmware versions differ in file command support.
- Exact file-tree paths for sounds, projects, groups, and pads on each device.
- Full metadata schema accepted by each SKU.
- Restore behavior after interrupted writes.
