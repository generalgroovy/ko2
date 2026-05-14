# KO II Web MIDI Lab

Static DAW-style browser control surface for exploring Teenage Engineering EP / KO II communication over USB MIDI.

This project is intentionally conservative. It implements Web MIDI connection, local sample import/export, TE SysEx frame helpers, and read-only protocol probes in a professional hardware-editor workspace. Device-mutating commands are blocked by default.

## Current Features

- Connects to MIDI devices through Web MIDI plain registration first.
- Registers plain MIDI first, then requests SysEx as an upgrade so EP-133 ports still appear if SysEx is denied.
- Tracks MIDI inputs and outputs separately.
- Includes manual port refresh and browser MIDI diagnostics.
- Exposes runtime settings for SysEx requests, read probe privilege, write-action visibility, port selection, MIDI listening, logging, poll timing, device ID, and request timeouts.
- Implements proposal surfaces for recursive device-tree scanning, cached tree export, protocol log export, local-vs-device sample comparison, and pad assignment rendering from imported metadata.
- Uses a DAW workspace layout with a left inspector, transport/device strip, central sample and arrangement panels, hardware file browser, function queue, and session log.
- Mirrors official EP Sample Tool reference targets with ten sample banks, 999-slot awareness, assignment dots, and a group A-D / 12-pad grid fed by imported metadata.
- Adds an interactable live timeline for local sample playback, imported project clips, and incoming MIDI activity.
- Imports raw `.pcm` and `.raw` files using configurable sample rate, channels, and bit depth, converting them to playable browser audio.
- Can auto-load read-only project metadata after MIDI/SysEx connection instead of requiring each probe button to be pressed manually.
- Adds live performance controls: configurable trigger mode, MIDI channel, base note, velocity, gate, hold, keyboard shortcuts, pad context menu, MIDI panic, and MIDI clock messages.
- Reworks the GUI into a conventional DAW-style control surface with a Matrix-inspired green-on-black visual system and session log.
- Adds a live KO II monitor for browser-observable MIDI input, MIDI output, SysEx/file probe state, held notes, clock, and local preview state.
- Sends the universal MIDI identity request.
- Parses Teenage Engineering identity replies when present.
- Builds and parses Teenage Engineering SysEx frames.
- Implements 7-bit SysEx payload packing and unpacking.
- Provides read-only probe buttons:
  - Universal identity
  - TE echo
  - TE file protocol init
  - Root node info
  - TE root folder list, after init
  - `/sounds` and `/projects` list probes, after those folders are discovered
  - `/sounds` and `/projects` metadata probes
- Imports local audio files in the browser.
- Renders waveform previews from decoded audio.
- Exports selected local samples as WAV.
- Downloads all available local audio buffers as WAV without creating placeholder text files for missing hardware buffers.
- Shows imported manifest samples, tracks, scenes, and clip-to-sample references.
- Shows cached read-only device tree results.
- Exports a local JSON manifest.

## Safety

The official EP Sample Tool uses a vendor SysEx file-transfer protocol over Web MIDI. This repo includes protocol scaffolding, but it is not a full replacement for the official tool.

Write-capable operations are blocked unless `EXPERIMENTAL_WRITE_ENABLED` is changed in `te-sysex.js`.

Blocked by default:

- `PUT`
- `DELETE`
- `MOVE`
- `METADATA_SET`
- `PLAYBACK_START`

Do not enable write commands without a device you can safely test against and a current backup made with the official tool.

## Browser Requirements

- A browser with Web MIDI and SysEx permission support.
- Chrome, Edge, or another Chromium-based browser is the safest choice.
- A real USB-C data cable, not a charge-only cable.
- Browser permission for MIDI and SysEx.
- The KO II / EP MIDI ports must not be exclusively held by another app.
- Some embedded browsers deny Web MIDI entirely. Use Chrome or Edge on `localhost` for hardware probes.

## What Is Known From The Official EP Sample Tool

The official Teenage Engineering app says it can upload, download, delete, edit, and quickly assign samples to pads. It uses a Web MIDI-compatible browser and connects to KO II over USB.

The inspected official bundle uses:

- `navigator.requestMIDIAccess`
- `onmidimessage`
- `MIDIOutput.send()`

It does not appear to use:

- `navigator.usb`
- `navigator.serial`
- `navigator.hid`

So USB-C communication is exposed to the browser as USB MIDI, with sample/project transfer implemented as vendor SysEx.

## Supported Device SKUs Seen In The Official Bundle

- `TE032AS001` - EP-133 K.O. II
- `TE032AS005` - EP-1320 medieval
- `TE032AS006` - EP-40 riddim

## Roadmap

1. Verify identity, echo, file init, and root list against real hardware.
2. Expand read-only file-tree listing.
3. Read file metadata safely.
4. Add sample download once file paths and metadata are confirmed.
5. Add guarded upload/delete only after repeatable backups and restore tests.

## Files

- `index.html` - static app shell.
- `styles.css` - UI styling.
- `app.js` - browser app state and UI wiring.
- `te-sysex.js` - SysEx frame, packing, constants, and read-only protocol helpers.
- `audio.js` - local audio decode, waveform, and WAV export helpers.
- `docs/protocol-notes.md` - protocol notes collected from the official app bundle.
