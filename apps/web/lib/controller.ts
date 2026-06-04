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
import { charToBits, CELL_DOWN } from "./braille";

export type BrailleState = {
  usbSupported: boolean;
  bleSupported: boolean;
  connected: boolean;
  connecting: boolean;
  transport: TransportKind | null;
  deviceName: string | null;
  error: string | null;
  /** The cell currently shown on the device, as a 6-bit string. */
  currentCell: string;
  /** The character currently shown (for the on-screen mirror). */
  currentLabel: string | null;
  busy: boolean;
};

const INITIAL: BrailleState = {
  usbSupported: false,
  bleSupported: false,
  connected: false,
  connecting: false,
  transport: null,
  deviceName: null,
  error: null,
  currentCell: CELL_DOWN,
  currentLabel: null,
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
    if (!this.transport || !this.state.connected) {
      return "No BrailleBuddy device is connected, so I couldn't show that.";
    }
    const ch = (character ?? "").trim()[0]; // guardrail: only the first character
    if (!ch) return "No character was given to show.";
    const bits = charToBits(ch);
    if (!bits) return `I don't have a braille pattern for "${ch}".`;

    const holdMs = Math.max(0.3, Math.min(seconds || 2, 15)) * 1000; // clamp 0.3–15 s
    this.set({ busy: true, currentCell: bits, currentLabel: ch.toUpperCase() });
    try {
      await this.transport.send(`B${bits}`);
      await delay(holdMs);
      await this.transport.send("Z");
      this.set({ currentCell: CELL_DOWN, currentLabel: null, busy: false });
      return `Showed "${ch.toUpperCase()}" for ${Math.round(holdMs / 1000)} seconds.`;
    } catch (e) {
      this.set({ busy: false });
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
