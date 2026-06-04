import { Transport, LineAssembler } from "./transport";

// WebSerial transport — the ESP32-S3 native USB CDC shows up as a serial port.
// Desktop Chrome/Edge only.
export class SerialTransport implements Transport {
  readonly kind = "usb" as const;
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private keepReading = false;
  private asm = new LineAssembler();
  private onLine: (line: string) => void = () => {};
  private onDisc: () => void = () => {};

  setOnLine(cb: (line: string) => void): void {
    this.onLine = cb;
  }
  setOnDisconnect(cb: () => void): void {
    this.onDisc = cb;
  }

  async connect(): Promise<void> {
    if (!("serial" in navigator)) throw new Error("WebSerial isn't available — use Chrome or Edge.");
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    this.port = port;
    this.keepReading = true;
    void this.readLoop();
  }

  private async readLoop(): Promise<void> {
    while (this.port?.readable && this.keepReading) {
      const reader = this.port.readable.getReader();
      this.reader = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) this.asm.push(value, this.onLine);
        }
      } catch {
        break; // read error — usually the device was unplugged
      } finally {
        reader.releaseLock();
      }
    }
    if (this.keepReading) {
      this.keepReading = false;
      this.onDisc();
    }
  }

  async send(line: string): Promise<void> {
    if (!this.port?.writable) throw new Error("Serial port is not writable.");
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(line + "\n"));
    } finally {
      writer.releaseLock();
    }
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
