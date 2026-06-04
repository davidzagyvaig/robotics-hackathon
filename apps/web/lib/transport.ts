// Transport abstraction — the web app talks to the BrailleBuddy device the same way
// over USB (WebSerial) or Bluetooth (BLE / Nordic UART). The controller holds one
// Transport and never cares which it is. (BLE is built on @capacitor-community/bluetooth-le
// so the exact same code works in the browser now and under Capacitor later.)

// Nordic UART Service UUIDs (lowercase; must match the firmware in src/main.cpp).
export const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // host -> device (write)
export const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // device -> host (notify)

export type TransportKind = "usb" | "ble";

export interface Transport {
  readonly kind: TransportKind;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Send one protocol line (a trailing newline is added). */
  send(line: string): Promise<void>;
  setOnLine(cb: (line: string) => void): void;
  setOnDisconnect(cb: () => void): void;
}

/** Frames incoming byte chunks into newline-delimited lines. */
export class LineAssembler {
  private buf = "";
  private decoder = new TextDecoder();

  push(chunk: Uint8Array | DataView | ArrayBuffer, onLine: (line: string) => void): void {
    let bytes: Uint8Array;
    if (chunk instanceof Uint8Array) bytes = chunk;
    else if (chunk instanceof DataView)
      bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    else bytes = new Uint8Array(chunk);
    this.buf += this.decoder.decode(bytes, { stream: true });
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).replace(/\r$/, "");
      this.buf = this.buf.slice(nl + 1);
      if (line) onLine(line);
    }
  }
}

export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export function isBleSupported(): boolean {
  // In the browser the BLE transport runs on Web Bluetooth (desktop Chrome/Edge +
  // Android Chrome); under Capacitor it's native. Gate on navigator.bluetooth for web.
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}
