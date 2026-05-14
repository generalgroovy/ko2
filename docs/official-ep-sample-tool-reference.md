# Official EP Sample Tool Reference

Reference sources:

- `https://teenage.engineering/apps/ep-sample-tool`
- `https://teenage.engineering/apps`
- `https://teenage.engineering/products/ep-133`
- `https://teenage.engineering/now/2024`

## Confirmed Official Capabilities

- Manages samples on K.O. II over USB through a Web MIDI-compatible browser.
- Compatible devices listed by teenage engineering: EP-133 K.O. II and EP-1320 medieval.
- Upload, download, delete, edit, and quick-assign samples to pads.
- Drag and drop files into the browser sample library.
- Sample library contains 999 slots across ten tabs.
- Groups A-D and 12 pads are part of the interaction model.
- The official UI shows group and pad allocation, sample slot number, sample name, sample length, and current loaded project.
- Assigned samples are marked with a dot in the sample list.
- Storage usage is surfaced with a top-bar chart and MB amount.
- Samples can be renamed by double-clicking in the official tool.
- Sample trim is adjusted with `in` and `out` positions when the unit is in sound edit trim mode.
- Project backup/restore, individual project save/load, moving files between K.O. II units, and sharing sample banks are official targets.
- The official app presents playback/editing context visually; this repo maps that into a local browser timeline for imported project clips, local sample playback, and MIDI input events.

## Safe Implementation Mapping

- Implement visible 999-slot / ten-bank library organization locally.
- Render assignment dots from imported manifest pad metadata.
- Render groups A-D and 12 pads as a DAW-style pad grid.
- Render a real-time left-to-right timeline for local sample preview and browser-observable MIDI activity.
- Decode raw PCM locally with explicit runtime settings instead of assuming one fixed PCM format.
- Auto-run the read-only project discovery path after SysEx permission is granted.
- Keep upload, delete, restore, move, and write metadata as gated surfaces until the device-transfer implementation is verified.
- Keep read-only SysEx probes, diagnostics, protocol log export, and cached tree export available for verification sessions.
- Prefer local manifests and cached device metadata for project, pad, and sample mapping until full hardware sample transfer is verified.
