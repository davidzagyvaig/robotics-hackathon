// WebSerial driver for the BrailleBuddy device.
//
// Mirrors the clean driver abstraction from the old DermaScout `control/arm_driver.py`:
// one small class owns the port, a background read loop parses newline-delimited ASCII
// lines, and the rest of the app talks to it through a handful of methods.
//
// Protocol (see firmware/PROTOCOL.md), 115200 baud, '\n'-terminated:
//   host → device:  ID?  |  B<6 bits>  |  Z  |  E  |  D
//   device → host:  BOOT  |  BRAILLEBUDDY v1  |  OK  |  POT <0-4095>
//
// WebSerial is Chrome/Edge only and requires HTTPS (or localhost).

export type LineHandler = (line: string) => void;

export class BrailleSerial {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private keepReading = false;
  private lineHandlers = new Set<LineHandler>();

  /** Called with the raw 0..4095 pot value whenever a `POT` line arrives. */
  onPot: ((value: number) => void) | null = null;

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "serial" in navigator;
  }

  get isOpen(): boolean {
    return this.port !== null;
  }

  /** Prompt the user to pick a serial port, then open it. */
  async connect(): Promise<void> {
    if (!BrailleSerial.isSupported()) {
      throw new Error("WebSerial isn't available — please use Chrome or Edge.");
    }
    const port = await navigator.serial.requestPort();
    await this.open(port);
  }

  /** Open a port we already have permission for (e.g. from getPorts() auto-reconnect). */
  async open(port: SerialPort): Promise<void> {
    await port.open({ baudRate: 115200 });
    this.port = port;
    this.keepReading = true;
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    const decoder = new TextDecoder();
    let buf = "";
    while (this.port?.readable && this.keepReading) {
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).replace(/\r$/, "");
            buf = buf.slice(nl + 1);
            if (line) this.dispatch(line);
          }
        }
      } catch {
        // Read error (usually the device was unplugged) — exit the loop.
        break;
      } finally {
        reader.releaseLock();
      }
    }
  }

  private dispatch(line: string): void {
    if (line.startsWith("POT ")) {
      const v = parseInt(line.slice(4).trim(), 10);
      if (!Number.isNaN(v)) this.onPot?.(v);
    }
    this.lineHandlers.forEach((h) => h(line));
  }

  private async write(s: string): Promise<void> {
    if (!this.port?.writable) throw new Error("Serial port is not writable.");
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(s));
    } finally {
      writer.releaseLock();
    }
  }

  /** Send `ID?` and resolve with the device's identity line (or reject on timeout). */
  async identify(timeoutMs = 1500): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const handler: LineHandler = (line) => {
        if (line.startsWith("BRAILLEBUDDY")) {
          cleanup();
          resolve(line.trim());
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("No response from a BrailleBuddy device on that port."));
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.lineHandlers.delete(handler);
      };
      this.lineHandlers.add(handler);
      this.write("ID?\n").catch((e) => {
        cleanup();
        reject(e);
      });
    });
  }

  /** Set the cell to a 6-bit pattern, e.g. "100000". */
  sendCell(bits: string): Promise<void> {
    return this.write(`B${bits}\n`);
  }

  /** Lower every dot. */
  clear(): Promise<void> {
    return this.write("Z\n");
  }

  /** Re-energize the servos. */
  enable(): Promise<void> {
    return this.write("E\n");
  }

  /** Relax (detach) the servos so they stop buzzing/heating when idle. */
  relax(): Promise<void> {
    return this.write("D\n");
  }

  async disconnect(): Promise<void> {
    this.keepReading = false;
    try {
      await this.reader?.cancel();
    } catch {
      /* ignore */
    }
    try {
      await this.port?.close();
    } catch {
      /* ignore */
    }
    this.port = null;
    this.reader = null;
  }
}
