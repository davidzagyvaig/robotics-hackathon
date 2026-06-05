// BrailleBuddy controller — a module-level singleton that owns the device connection
// (USB or BLE) and the shared UI state. React subscribes via useBrailleState(); the
// ElevenLabs client tool calls controller.renderBraille().

import { useSyncExternalStore } from "react";
import {
  Transport,
  TransportKind,
  isWebSerialSupported,
  isBleSupported,
} from "./transport";
import { SerialTransport } from "./serialTransport";
import { BleTransport } from "./bleTransport";
import { charToBits, CELL_DOWN, textToCells } from "./braille";

export type BrailleState = {
  usbSupported: boolean;
  bleSupported: boolean;
  connected: boolean;
  connecting: boolean;
  /** True when running with no physical device — the on-screen cell IS the device. */
  simulated: boolean;
  transport: TransportKind | null;
  deviceName: string | null;
  error: string | null;
  /** The cell currently shown on the device, as a 6-bit string. */
  currentCell: string;
  /** The character currently shown (for the on-screen mirror). */
  currentLabel: string | null;
  /** The word currently being read (for the right-pane word strip), or null. */
  currentWord: string | null;
  /** Index of the active letter within currentWord, or -1. */
  wordIndex: number;
  busy: boolean;
  /** A teaching caption shown during the no-key "Watch demo" playback. */
  demoCaption: string | null;
  /** True while the scripted demo is running. */
  demoRunning: boolean;
  /** True when the demo is holding a dot and waiting for the learner to confirm they feel it. */
  demoAwaitingConfirm: boolean;
  /** True when a live teaching step is waiting for learner confirmation. */
  teachAwaitingConfirm: boolean;
  /** Which pane the cell is in. The voice agent flips this via set_mode so the screen
   *  follows the lesson: "learn" shows the letter; "quiz" hides it (the learner guesses). */
  mode: "learn" | "quiz";
};

const INITIAL: BrailleState = {
  usbSupported: false,
  bleSupported: false,
  connected: false,
  connecting: false,
  simulated: false,
  transport: null,
  deviceName: null,
  error: null,
  currentCell: CELL_DOWN,
  currentLabel: null,
  currentWord: null,
  wordIndex: -1,
  busy: false,
  demoCaption: null,
  demoRunning: false,
  demoAwaitingConfirm: false,
  teachAwaitingConfirm: false,
  mode: "learn",
};

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class BrailleController {
  private transport: Transport | null = null;
  private state: BrailleState = INITIAL;
  private listeners = new Set<() => void>();
  private wordGen = 0; // bumped on each renderWord so a newer call supersedes an in-flight one
  private pendingIdentify: ((name: string) => void) | null = null;
  private feelResolve: (() => void) | null = null;

  private ensureVisibleCell(): void {
    if (!this.state.connected && !this.state.simulated) {
      this.connectSimulated();
    }
  }

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };
  getSnapshot = (): BrailleState => this.state;
  getServerSnapshot = (): BrailleState => INITIAL;

  private set(patch: Partial<BrailleState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Reflect which transports this environment can actually use (call from an effect). */
  reportSupport(): void {
    this.set({ usbSupported: isWebSerialSupported(), bleSupported: isBleSupported() });
  }

  // The physical "assistant" button on the device taps the capacitive sensor → "TOUCH 1".
  // We surface that as a device-button event so the app can start the voice agent
  // (disability mode) hands-free. Other telemetry (POT/SPEED/CHARMS/SW) is ignored.
  private deviceButtonCb: (() => void) | null = null;

  onDeviceButton(cb: () => void): () => void {
    this.deviceButtonCb = cb;
    return () => {
      if (this.deviceButtonCb === cb) this.deviceButtonCb = null;
    };
  }

  private handleLine = (line: string): void => {
    if (line.startsWith("BRAILLEBUDDY")) this.pendingIdentify?.(line.trim());
    else if (line.trim() === "TOUCH 1") this.deviceButtonCb?.();
  };

  /**
   * No-hardware mode: the on-screen cell becomes the "device". The voice tutor and
   * render_braille work exactly the same — the cell animates on screen instead of
   * raising real dots. Doubles as the demo fallback and the screen-recorded B-roll.
   */
  connectSimulated(): void {
    if (this.state.connecting || this.state.connected) return;
    this.set({
      connected: true,
      simulated: true,
      transport: null,
      deviceName: "On-screen cell",
      error: null,
      currentCell: CELL_DOWN,
      currentLabel: null,
    });
  }

  async connect(kind: TransportKind): Promise<void> {
    if (this.state.connecting || this.state.connected) return;
    this.set({ connecting: true, error: null });
    const t: Transport = kind === "usb" ? new SerialTransport() : new BleTransport();
    t.setOnLine(this.handleLine);
    t.setOnDisconnect(() => this.onDisconnect());
    try {
      await t.connect();
      this.transport = t;
      const name = await this.identify(t);
      this.set({ connected: true, connecting: false, transport: kind, deviceName: name });
    } catch (e) {
      try {
        await t.disconnect();
      } catch {
        /* ignore */
      }
      this.transport = null;
      this.set({
        connecting: false,
        connected: false,
        error: e instanceof Error ? e.message : "Failed to connect.",
      });
    }
  }

  private identify(t: Transport, timeoutMs = 2500): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingIdentify = null;
        reject(new Error("No response from a BrailleBuddy device."));
      }, timeoutMs);
      this.pendingIdentify = (name) => {
        clearTimeout(timer);
        this.pendingIdentify = null;
        resolve(name);
      };
      t.send("ID?").catch((e) => {
        clearTimeout(timer);
        this.pendingIdentify = null;
        reject(e);
      });
    });
  }

  private onDisconnect(): void {
    this.transport = null;
    this.set({
      connected: false,
      simulated: false,
      transport: null,
      deviceName: null,
      currentCell: CELL_DOWN,
      currentLabel: null,
    });
  }

  async disconnect(): Promise<void> {
    try {
      await this.transport?.disconnect();
    } catch {
      /* ignore */
    }
    this.onDisconnect();
  }

  /**
   * The `render_braille` client tool: show one character on the cell for `seconds`,
   * then drop every dot. The agent passes a letter (we guard to the first character)
   * and the browser looks up the dot pattern in braille.ts.
   */
  async renderBraille(character: string, _seconds?: number): Promise<string> {
    const ch = (character ?? "").trim()[0]; // guardrail: only the first character
    if (!ch) return "No character was given to show.";
    const bits = charToBits(ch);
    if (!bits) return `I don't have a braille pattern for "${ch}".`;

    // The on-screen cell IS the device when no hardware is connected — always works.
    this.ensureVisibleCell();
    this.wordGen += 1; // stop any looping word so this single letter takes over the cell

    // Raise the letter and KEEP it up so the learner can feel it while you ask, by VOICE,
    // "can you feel it?". Return immediately — never block the tool call (that caused the
    // ~20s latency and the false "cell isn't responding" error).
    this.set({
      busy: false,
      currentWord: null,
      wordIndex: -1,
      currentCell: bits,
      currentLabel: ch.toUpperCase(),
      teachAwaitingConfirm: false,
    });
    try {
      if (this.transport) await this.transport.send(`B${bits}`);
    } catch {
      /* hardware hiccup — the on-screen cell is already showing it, so we still succeed */
    }
    // Neutral context for the agent (works for teaching AND quizzing). The agent decides
    // whether to confirm it ("can you feel/see it?") or quiz it ("what do you think it is?").
    return `The cell is now showing the letter ${ch.toUpperCase()}.`;
  }

  /**
   * The `render_word` client tool: step a whole word across the single cell, one letter at
   * a time, resetting to all-dots-down between letters. The right pane shows the word with
   * the active letter highlighted. Indicator cells (number/capital signs) are shown too.
   */
  async renderWord(word: string, secondsPerLetter: number): Promise<string> {
    const clean = (word ?? "").trim();
    if (!clean) return "No word was given to show.";
    const cells = textToCells(clean);
    if (cells.length === 0) return `I couldn't turn "${clean}" into braille.`;

    this.ensureVisibleCell();

    const holdMs = Math.max(0.3, Math.min(secondsPerLetter || 1.5, 8)) * 1000;
    const gapMs = 320; // dots-down pause between letters so each is felt as separate
    const loopPauseMs = 1300; // calm pause between repeats while the word keeps showing
    const gen = ++this.wordGen; // claim this run; any newer cell update supersedes it
    this.set({ busy: true, currentWord: clean, wordIndex: -1 });
    try {
      // Keep showing the word — step C-A-R, pause, repeat — until something else supersedes
      // it (a new letter/word, a quiz, or clear). It never silently blanks to "now learning".
      while (gen === this.wordGen) {
        for (let i = 0; i < cells.length; i++) {
          if (gen !== this.wordGen) return "Superseded by a newer cell update.";
          const cell = cells[i];
          this.set({ currentCell: cell.bits, currentLabel: cell.label, wordIndex: i });
          if (this.transport) await this.transport.send(`B${cell.bits}`);
          await delay(holdMs);
          if (gen !== this.wordGen) return "Superseded by a newer cell update.";
          this.set({ currentCell: CELL_DOWN, currentLabel: null });
          if (this.transport) await this.transport.send("Z");
          if (i < cells.length - 1) await delay(gapMs);
        }
        if (gen !== this.wordGen) return "Superseded by a newer cell update.";
        await delay(loopPauseMs); // word strip stays on screen during the pause, then repeats
      }
      return `Showing the word "${clean}".`;
    } catch (e) {
      if (gen === this.wordGen) this.set({ busy: false, currentWord: null, wordIndex: -1 });
      return `The cell isn't responding: ${e instanceof Error ? e.message : "unknown error"}.`;
    }
  }
  // --- interactive demo: hold a dot, ask "can you feel it?", wait for the learner ---
  private demoResolve: (() => void) | null = null;

  /** Learner tapped "I can feel it" (or said yes). Advances the interactive demo. */
  confirmFeel(): void {
    this.feelResolve?.();
    this.demoResolve?.();
  }

  /**
   * Interactive, paced preview — mirrors how the voice agent teaches: raise a letter, ask
   * "can you feel it?", WAIT for the learner to confirm, then move on. Works with no voice
   * key and no hardware (on-screen cell), and reads identically on the real device.
   */
  async runDemo(): Promise<void> {
    if (this.state.busy || this.state.demoRunning) return;
    if (!this.state.connected) this.connectSimulated();
    this.set({ demoRunning: true });
    const say = (t: string | null) => this.set({ demoCaption: t });
    const alive = () => this.state.demoRunning;

    try {
      say("Let's try the cell together. I'll raise a letter — feel for the dots.");
      await delay(2600);

      // C — raise, hold so they can feel, then move on (no taps; the device has no sensors)
      if (!alive()) return;
      say("Here's the letter C — two dots along the top of the cell.");
      await this.showLetter("c");
      await delay(3600);
      if (!alive()) return;
      await this.clear();
      say("That was C. Beautifully done.");
      await delay(1800);

      // A
      if (!alive()) return;
      say("Now the letter A — just one dot, top-left.");
      await this.showLetter("a");
      await delay(3600);
      if (!alive()) return;
      await this.clear();
      say("That was A. You're a natural.");
      await delay(1600);

      // the word
      if (!alive()) return;
      say("Now let's read a whole word — cat. Feel each letter as it rises.");
      await delay(2200);
      if (!alive()) return;
      await this.renderWord("cat", 2.0);
      if (!alive()) return;
      say("C… A… T. That spells “cat.” You just read braille.");
      await delay(3000);
    } finally {
      this.demoResolve = null;
      this.feelResolve = null;
      this.set({ demoRunning: false, demoCaption: null, demoAwaitingConfirm: false, teachAwaitingConfirm: false });
      await this.clear();
    }
  }

  stopDemo(): void {
    this.set({ demoRunning: false });
    this.demoResolve?.(); // unblock any pending wait so the loop can exit
  }

  /** Raise a letter and HOLD it (no auto-clear) — used by Quiz mode for "what is this?". */
  async showLetter(character: string): Promise<boolean> {
    this.ensureVisibleCell();
    const ch = (character ?? "").trim()[0];
    if (!ch) return false;
    const bits = charToBits(ch);
    if (!bits) return false;
    this.wordGen += 1; // stop any looping word
    this.set({ currentCell: bits, currentLabel: ch.toUpperCase(), currentWord: null, wordIndex: -1 });
    try {
      if (this.transport) await this.transport.send(`B${bits}`);
      return true;
    } catch {
      return false;
    }
  }

  /** Wait until the learner confirms they can feel the current letter. */
  waitForFeel(): Promise<void> {
    return new Promise<void>((resolve) => {
      const original = this.demoResolve;
      this.demoResolve = () => {
        original?.();
        resolve();
      };
    });
  }

  /** Flip the cell pane between teaching (label visible) and quizzing (label hidden).
   *  Called by the agent's set_mode tool and by the manual LEARN/QUIZ toggle. */
  setMode(mode: "learn" | "quiz"): void {
    this.set({ mode });
  }

  /** Drop every dot and clear the label. */
  async clear(): Promise<void> {
    this.wordGen += 1; // stop any looping word
    this.set({ currentCell: CELL_DOWN, currentLabel: null, currentWord: null, wordIndex: -1, busy: false });
    try {
      if (this.transport) await this.transport.send("Z");
    } catch {
      /* ignore */
    }
  }
}

export const controller = new BrailleController();

/** React hook: subscribe to the controller's shared state. */
export function useBrailleState(): BrailleState {
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot
  );
}
