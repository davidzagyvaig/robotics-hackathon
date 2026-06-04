import { BleClient, type BleDevice } from "@capacitor-community/bluetooth-le";
import { Transport, LineAssembler, NUS_SERVICE, NUS_RX, NUS_TX } from "./transport";

// BLE transport over the Nordic UART Service, via @capacitor-community/bluetooth-le.
// Same code path in the browser (Web Bluetooth: desktop Chrome/Edge + Android Chrome)
// and natively under Capacitor.
export class BleTransport implements Transport {
  readonly kind = "ble" as const;
  private deviceId: string | null = null;
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
    await BleClient.initialize();
    const device: BleDevice = await BleClient.requestDevice({
      namePrefix: "BrailleBuddy",
      optionalServices: [NUS_SERVICE],
    });
    this.deviceId = device.deviceId;
    await BleClient.connect(this.deviceId, () => this.handleDisconnect());
    await BleClient.startNotifications(this.deviceId, NUS_SERVICE, NUS_TX, (value) => {
      this.asm.push(value, this.onLine);
    });
  }

  private handleDisconnect(): void {
    this.deviceId = null;
    this.onDisc();
  }

  async send(line: string): Promise<void> {
    if (!this.deviceId) throw new Error("Bluetooth device is not connected.");
    const bytes = new TextEncoder().encode(line + "\n");
    await BleClient.writeWithoutResponse(
      this.deviceId,
      NUS_SERVICE,
      NUS_RX,
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    );
  }

  async disconnect(): Promise<void> {
    const id = this.deviceId;
    this.deviceId = null;
    if (id) {
      try {
        await BleClient.stopNotifications(id, NUS_SERVICE, NUS_TX);
      } catch {
        /* ignore */
      }
      try {
        await BleClient.disconnect(id);
      } catch {
        /* ignore */
      }
    }
  }
}
