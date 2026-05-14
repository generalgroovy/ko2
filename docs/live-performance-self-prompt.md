# Self Prompt: KO II Live Performance Web App

Refactor the KO II web app to maximize live-performance usability while preserving all existing file and protocol integrity.

## Goals

- Keep everything usable on a fullscreen laptop display without requiring constant scrolling.
- Use collapsible sections, dropdowns, and context menus where they reduce clutter.
- Rework the GUI around a conventional DAW shape: transport/status, inspector, arrangement/timeline, pad performance area, sample browser, device browser, and session log.
- Make the global style and session log feel like a Matrix-style terminal: green-on-black, scanlines, compact mono data surfaces.
- Add safe, real-time MIDI performance controls that can interact with KO II during a live session.
- Accurately visualize only browser-observable KO II activity: incoming MIDI, outgoing MIDI, SysEx replies/probes, selected ports, cached project data, and local preview playback.
- Keep raw PCM and browser-decoded audio playable locally.
- Keep read-only project/device discovery automated, but preserve manual controls for recovery.
- Do not enable unverified write/file mutation commands.

## Live Performance Options To Implement

- Configurable performance mode: local preview, MIDI trigger, or both.
- Configurable MIDI channel, base note, velocity, gate length, and hold behavior.
- Pad grid triggers can send MIDI note messages to the selected KO II MIDI output.
- Pad context menu with local preview, MIDI trigger, both, select sample, and panic.
- Computer keyboard shortcuts for the 12 visible pads.
- MIDI panic/all-notes-off.
- MIDI clock start, stop, continue, and tick controls for sync experiments.
- Timeline records browser-observable local playback, MIDI input, and outgoing performance events.

## Test Method

1. Run JavaScript syntax checks for `app.js`, `audio.js`, and `te-sysex.js`.
2. Verify every `app.js` DOM lookup exists in `index.html`.
3. Verify HTML IDs are unique.
4. Verify PCM decoder remains exported and referenced.
5. Verify Windows sees connected EP-133 / KO II USB MIDI endpoints when hardware is attached.
6. In Chrome or Edge, connect MIDI, select KO II ports, trigger pads, and confirm MIDI out events appear in the timeline/log.

## Safety

Real-time MIDI channel messages are allowed as performance controls. SysEx file writes, deletes, moves, metadata writes, backup/restore, and sample upload remain blocked unless independently verified.
