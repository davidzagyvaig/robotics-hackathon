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
};

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class BrailleController {
  private transport: Transport | null = null;
  private state: BrailleState = INITIAL;
  private listeners = new Set<() => void>();
  private pendingIdentify: ((name: string) => void) | null = null;

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

  // The device streams POT/SPEED/CHARMS/TOUCH/SW at ~10 Hz; we intentionally ignore them
  // (timing is agent-driven now). We only listen for the identity reply.
  private handleLine = (line: string): void => {
    if (line.startsWith("BRAILLEBUDDY")) this.pendingIdentify?.(line.trim());
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
  async renderBraille(character: string, seconds: number): Promise<string> {
    if (!this.state.connected) {
      return "No BrailleBuddy is connected, so I couldn't show that.";
    }
    const ch = (character ?? "").trim()[0]; // guardrail: only the first character
    if (!ch) return "No character was given to show.";
    const bits = charToBits(ch);
    if (!bits) return `I don't have a braille pattern for "${ch}".`;

    const holdMs = Math.max(0.3, Math.min(seconds || 2, 15)) * 1000; // clamp 0.3–15 s
    this.set({ busy: true, currentCell: bits, currentLabel: ch.toUpperCase() });
    try {
      // Physical device gets the serial frames; in no-hardware mode the on-screen
      // cell (which mirrors this state) is the device, so we just animate + hold.
      if (this.transport) await this.transport.send(`B${bits}`);
      await delay(holdMs);
      if (this.transport) await this.transport.send("Z");
      this.set({ currentCell: CELL_DOWN, currentLabel: null, busy: false });
      return `Showed "${ch.toUpperCase()}" for ${Math.round(holdMs / 1000)} seconds.`;
    } catch (e) {
      this.set({ busy: false });
      return `The cell isn't responding: ${e instanceof Error ? e.message : "unknown error"}.`;
    }
  }

  /**
   * The `render_word` client tool: step a whole word across the single cell, one letter at
   * a time, resetting to all-dots-down between letters. The right pane shows the word with
   * the active letter highlighted. Indicator cells (number/capital signs) are shown too.
   */
  async renderWord(word: string, secondsPerLetter: number): Promise<string> {
    if (!this.state.connected) {
      return "No BrailleBuddy is connected, so I couldn't show that word.";
    }
    const clean = (word ?? "").trim();
    if (!clean) return "No word was given to show.";
    const cells = textToCells(clean);
    if (cells.length === 0) return `I couldn't turn "${clean}" into braille.`;

    const holdMs = Math.max(0.3, Math.min(secondsPerLetter || 1.5, 8)) * 1000;
    const gapMs = 320; // dots-down pause between letters so each is felt as separate
    this.set({ busy: true, currentWord: clean, wordIndex: -1 });
    try {
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        this.set({ currentCell: cell.bits, currentLabel: cell.label, wordIndex: i });
        if (this.transport) await this.transport.send(`B${cell.bits}`);
        await delay(holdMs);
        this.set({ currentCell: CELL_DOWN, currentLabel: null });
        if (this.transport) await this.transport.send("Z");
        if (i < cells.length - 1) await delay(gapMs);
      }
      this.set({ busy: false, currentWord: null, wordIndex: -1 });
      return `Showed the word "${clean}" — ${cells.length} cells.`;
    } catch (e) {
      this.set({ busy: false, currentWord: null, wordIndex: -1 });
      return `The cell isn't responding: ${e instanceof Error ? e.message : "unknown error"}.`;
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
