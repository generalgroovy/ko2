# Self Prompt: Professional KO II DAW Interface

Adjust the KO II web app into a professional DAW-style control surface for a connected Teenage Engineering EP-133 / KO II over USB-C while preserving all existing protocol, file, and safety behavior.

## Integrity Rules

- Maintain file and functionality integrity of the existing KO II code at all costs.
- Do not remove or weaken existing read/write safety guards in `te-sysex.js`.
- Do not invent write, delete, move, playback, restore, or sample-transfer commands unless they are verified against connected hardware and guarded by explicit runtime privileges.
- Preserve all existing DOM IDs used by `app.js` unless the app code is updated in the same change.
- Keep local sample import, manifest export, WAV download, MIDI diagnostics, tree cache, and protocol log behavior working.
- Keep the app static and browser-native: no build step, no backend, no hidden dependency.

## Interface Goal

Make the first screen feel like a compact DAW hardware editor, not a lab notebook:

- Persistent transport/status strip with MIDI, SysEx, privilege, selected input/output, port count, chunk size, device ID, SKU, and serial.
- Left-side inspector for connection, runtime settings, and gated device operations.
- Central arrangement/library area with samples, scenes, tracks, pads, and device tree.
- Right-side session/protocol area with proposals, log export, diagnostics, and cached device state.
- Dense controls, clear state, restrained visual design, no marketing layout.

## Function Proposals To Surface

- Recursive read-only device browser with configurable scan depth.
- Device tree export for protocol debugging.
- Protocol log export for reproducing hardware sessions.
- Local sample versus cached device tree comparison by normalized filename and byte size.
- Project view for scenes, tracks, clips, pads, and sample references from imported metadata.
- Future verified sample backup using read-only file GET after device paths are confirmed.
- Future pad assignment editor after real project metadata format is validated.
- Future write mode with explicit runtime privilege gating and hardware-tested commands only.
- Future compare/restore workflow using hashes or device metadata after transfer protocol is verified.

## Connected KO II USB-C Test Method

1. Verify Windows sees the device:
   - Query PnP entities for `EP-133`, `VID_2367`, `PID_0020`, `MidiEndpoint`, and `MEDIA`.
   - Expected result: EP-133 USB composite, media, and MIDI endpoint entries have `Status OK`.
2. Serve the static app locally.
3. Open the app in a Web MIDI-capable browser such as Chrome or Edge.
4. Click `Connect MIDI`.
5. Confirm plain MIDI registration first, then SysEx privilege request.
6. Confirm KO II input/output are visible and selected.
7. Run `Diagnose MIDI`, then `Identity`.
8. If SysEx is granted, run read-only probes in order:
   - `TE echo`
   - `File init`
   - `Root info`
   - `List root`
   - `Recursive scan`
9. Export the protocol log and cached tree after any hardware session.
10. Do not execute write-surface actions unless their implementation has been independently verified.

## Implementation Task

Implement the professional DAW interface in the GitHub repo while preserving the current app behavior. Retest syntax, static wiring, browser rendering where allowed, and connected-device visibility. Commit and push only after the app is functional and the worktree contains the intended files.
