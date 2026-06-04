# Team guide — who owns what

Four people, one contract (`firmware/PROTOCOL.md`). Build the web half and the firmware half in
parallel against it.

## The contract that lets us work in parallel
- **Device boundary:** the firmware accepts `B<6 bits>` over USB serial and streams `POT <value>`.
  Nothing else crosses the hardware/software line. (`firmware/PROTOCOL.md`)
- **Browser owns the logic:** char→braille mapping, timing, and the ElevenLabs tool all live in
  `apps/web`. The agent just passes text to `render_braille`.

## Roles

### Mete — web / agent (all software)
Owns: `apps/web/`, `agent/`.
- The Next.js app, WebSerial connection (`lib/serial.ts`), braille dict (`lib/braille.ts`).
- The ElevenLabs agent + `render_braille` client tool + signed-URL route.
- Can build everything against the **Wokwi** simulator before hardware exists.

### Samer — mechanical / electronics / 3D print
Owns: the physical braille cell + power.
- Design/print the 6-dot mechanism that turns servo motion into crisp raised dots.
- **Dedicated 5–6 V servo rail, common ground, 1000 µF cap. This is the #1 risk — get it solid first.**
- Mount the 6 MG90S + the potentiometer knob.

### Dave — firmware / hardware↔software bridge
Owns: `firmware/`.
- Flash `firmware/braillebuddy_esp32` to the ESP32-S3. Verify `BOOT` + `BRAILLEBUDDY v1` over serial.
- Confirm `B<bits>` moves the right dots and the pot streams. Calibrate `DOWN_US`/`UP_US` per dot.
- Own the monorepo + Vercel deploy.

### Zsombor — content / demo / UX
Owns: the teaching script + demo.
- Tune the agent prompt in `agent/prompt.md` (greeting, how letters are explained, encouragement).
- Sanity-check the braille mappings in `docs/BRAILLE.md`.
- Run the learner role-play in the demo; write the judge-facing script.

## Build order (ship-blockers first)
1. **serial loop** — `B<bits>` drives servos, `POT` streams (Dave + Samer) ← must be bulletproof
2. **web connect + render_braille** against Wokwi/real board (Mete)
3. **ElevenLabs agent + signed URL** wired into the conversation (Mete + Zsombor)
4. **physical cell + calibration** (Samer + Dave)
5. **Vercel deploy + demo polish** (Dave + Mete)

## Failsafe ladder (degrade gracefully)
| If this breaks… | Fall back to | Say |
|---|---|---|
| voice agent | manual: type text in a dev box → `render_braille` | "same device, I'm driving it by text" |
| WebSerial / device | the on-screen cell mirror in the UI | "here's the cell on screen; the hardware mirrors it" |
| a flaky servo | teach letters that avoid that dot | — |
