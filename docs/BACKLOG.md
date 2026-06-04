# BrailleBuddy — backlog / ideas

Things we deliberately **tabled** to keep the current build stable and demoable (a focused braille
teaching box: connect, talk to the tutor, feel the dots). Nothing here is lost — pick them up later.

The firmware already exposes hooks for several of these (`TOUCH 1/2`, `SW 0/1`, `CON/COFF`, `POT/SPEED/CHARMS`),
so most are web/agent-side work.

## Product / UX
- **Frontend redesign.** A more polished, branded UI; better onboarding; accessibility pass (screen-reader
  labels, focus order, large-text/high-contrast).
- **No-hardware web mode.** Let someone converse with the tutor and see the dot combinations **on-screen**
  with no ESP connected (a software braille cell). Makes the public link useful without the box and
  de-risks demos. *(We chose hardware-only for now.)*
- **Switch as a real mode.** Use the toggle (`SW 0/1`) for **Learn vs Practice/Quiz** — the box shows a
  random letter, the learner guesses, the tutor checks. (Today the switch is read + reported but unused.)

## Notifications (a separate "connected" product)
- **Notification mode.** Single tap (`TOUCH 1`) = read the latest notification aloud; double tap (`TOUCH 2`)
  = step through it one letter at a time in braille. Needs a real notification source and fits a
  phone/native build better than a laptop. The agent prompt already references a "Connected mode (not yet
  available)".

## Hardware-driven inputs (firmware already emits these)
- **Touch-button behaviour in learn mode.** e.g. tap = repeat the current letter, double-tap = next — a
  tactile self-pacing control so the learner doesn't have to speak.
- **Pot scales reading speed.** Today the agent's `seconds` sets how long each letter shows and the pot
  only changes the physical sweep speed. Optionally multiply `seconds` by the pot so the physical knob
  becomes a personal pace control again (the firmware streams `POT`/`SPEED`/`CHARMS` for this).
- **Live calibration UI.** Drive `CON`/`COFF`/`C?` from the web to tune each dot's up/down angle from a
  panel instead of editing `src/main.cpp`.
- **Quiet the 10 Hz telemetry over BLE.** Since the web ignores `POT`/`SPEED`/`CHARMS`, consider streaming
  them only on change / only over USB, to keep the BLE link clean.

## `render_braille` enhancements
- **Words in one call + reset-between-chars.** Optionally accept a word and step through it, always
  dropping the cell to all-zeros between characters, with a per-character hold time. (Today the agent calls
  once per letter with `seconds`; that already resets after each letter.)

## Native apps (Capacitor)
- **Android.** Free to build/test/sideload — no developer account. A debug APK installs over USB
  (`npx cap run android`) or as a shared file; the **$25 Play fee is only to publish**. An installable
  **PWA** (Web Bluetooth on Android Chrome) is an even lighter no-account path.
- **iOS.** Needs a **Mac + Xcode**. Free on **your own** device with a free Apple ID (re-sign every 7 days);
  the iOS Simulator has **no Bluetooth**, so test on a real iPhone. The **$99/yr is only to distribute**
  (TestFlight/App Store). iPhone Safari has no Web Bluetooth, so iOS needs the native build.
- The web BLE is built on `@capacitor-community/bluetooth-le`, so wrapping in Capacitor needs **no BLE rewrite**.
- Setup would add: `output: 'export'` build (handle the `/api/get-signed-url` route — host it remotely +
  CORS), `capacitor.config.ts` (`webDir: out`), the native projects, and BLE permissions
  (Android `BLUETOOTH_SCAN/CONNECT`; iOS `NSBluetoothAlwaysUsageDescription`).

## Easy-access / accessibility "open the app"
- **Laptop:** a button that makes the device (composite USB **CDC + HID keyboard**) "type" `Win+R` → the
  URL → Enter to open the site (OS-specific; Windows default). WebUSB landing pages are disabled in Chrome
  on Windows, so HID is the route.
- **Phone:** an **NFC tag** on the box — tap to open the app/site (accessible, no aiming; Android + iPhone).
- **Auto-reconnect** so it's "one-time setup, then one button": after granting the device + mic once, the
  site silently reconnects (`navigator.serial.getPorts()`) and auto-starts the conversation.

## Other ideas raised by the team
- **Remove the dot-char map from the agent prompt.** The reference table (letters → dot codes) is still in
  `agent/prompt.md` only so the agent can describe patterns verbally; the tool no longer needs it (the
  browser does the lookup). Take it out and have the agent describe patterns another way (or drop the
  per-letter dot description).
- _(running list — add as they come up)_
