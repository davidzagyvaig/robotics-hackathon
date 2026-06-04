// BrailleBuddy controller — a small module-level singleton that owns the device
// connection and the shared UI state. React components subscribe via useBrailleState();
// the ElevenLabs client tool calls controller.renderBraille().

import { useSyncExternalStore } from "react";
import { BrailleSerial } from "./serial";
import { textToCells, CELL_DOWN } from "./braille";
import { potToCps, potToDelayMs } from "./speed";

export type BrailleState = {
  supported: boolean;
  connected: boolean;
  connecting: boolean;
  deviceName: string | null;
  error: string | null;
  /** Raw 0..4095 potentiometer value (reading-speed knob). */
  pot: number;
  /** The cell currently shown on the device, as a 6-bit string. */
  currentCell: string;
  /** Label of the character currently shown (for the on-screen mirror). */
  currentLabel: string | null;
  /** True while a render_braille() call is streaming characters. */
  busy: boolean;
};

const INITIAL: BrailleState = {
  supported: true, // assume true on the server; corrected on the client after mount
  connected: false,
  connecting: false,
  deviceName: null,
  error: null,
  pot: 0,
  currentCell: CELL_DOWN,
  currentLabel: null,
  busy: false,
};

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

class BrailleController {
  private serial: BrailleSerial | null = null;
  private state: BrailleState = INITIAL;
  private listeners = new Set<() => void>();

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

  /** Current reading speed in characters/second, derived from the pot. */
  get cps(): number {
    return potToCps(this.state.pot);
  }

  /** Reflect WebSerial support on the client (called from a component effect). */
  reportSupport(): void {
    this.set({ supported: BrailleSerial.isSupported() });
  }

  private attach(serial: BrailleSerial): void {
    serial.onPot = (v) => this.set({ pot: v });
    this.serial = serial;
  }

  /** Prompt for a port, open it, and confirm it's a BrailleBuddy. */
  async connect(): Promise<void> {
    if (this.state.connecting || this.state.connected) return;
    this.set({ connecting: true, error: null });
    const serial = new BrailleSerial();
    try {
      this.attach(serial);
      await serial.connect();
      const name = await serial.identify();
      this.set({ connected: true, connecting: false, deviceName: name });
    } catch (e) {
      await serial.disconnect().catch(() => {});
      this.serial = null;
      this.set({
        connecting: false,
        connected: false,
        error: e instanceof Error ? e.message : "Failed to connect.",
      });
    }
  }

  /** Silently re-open a previously granted device, if one is present. */
  async tryReconnect(): Promise<boolean> {
    if (!BrailleSerial.isSupported()) return false;
    const ports = await navigator.serial.getPorts();
    for (const port of ports) {
      const serial = new BrailleSerial();
      try {
        this.attach(serial);
        await serial.open(port);
        const name = await serial.identify();
        this.set({ connected: true, deviceName: name, error: null });
        return true;
      } catch {
        await serial.disconnect().catch(() => {});
        this.serial = null;
      }
    }
    return false;
  }

  async disconnect(): Promise<void> {
    await this.serial?.disconnect().catch(() => {});
    this.serial = null;
    this.set({ connected: false, deviceName: null, currentCell: CELL_DOWN, currentLabel: null });
  }

  /**
   * Stream `text` to the device one braille cell at a time, pacing each character
   * by the live potentiometer speed. This is the body of the `render_braille`
   * client tool the ElevenLabs agent calls.
   */
  async renderBraille(text: string): Promise<string> {
    if (!this.serial || !this.state.connected) {
      return "No BrailleBuddy device is connected, so I couldn't show that.";
    }
    const cells = textToCells(text);
    this.set({ busy: true });
    try {
      for (const cell of cells) {
        await this.serial.sendCell(cell.bits);
        this.set({ currentCell: cell.bits, currentLabel: cell.label });
        await delay(potToDelayMs(this.state.pot));
      }
      await this.serial.clear();
      this.set({ currentCell: CELL_DOWN, currentLabel: null, busy: false });
      const cps = this.cps.toFixed(1);
      return `Showed "${text}" on BrailleBuddy at about ${cps} characters per second.`;
    } catch (e) {
      this.set({ busy: false });
      return `Something went wrong driving the device: ${
        e instanceof Error ? e.message : "unknown error"
      }.`;
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
