export interface MAVLinkTelemetry {
  rollDeg?: number;
  pitchDeg?: number;
  yawDeg?: number;
  altitudeM?: number;
  groundSpeedMs?: number;
  headingDeg?: number;
  throttlePct?: number;
  messageId: number;
}

export class MAVLinkParser {
  private buffer: number[] = [];

  public push(chunk: Uint8Array): MAVLinkTelemetry[] {
    this.buffer.push(...chunk);
    const messages: MAVLinkTelemetry[] = [];
    while (this.buffer.length >= 8) {
      const start = this.buffer.findIndex(byte => byte === 0xfe);
      if (start < 0) { this.buffer = []; break; }
      if (start > 0) this.buffer.splice(0, start);
      const payloadLength = this.buffer[1];
      const frameLength = payloadLength + 8;
      if (this.buffer.length < frameLength) break;
      const frame = new Uint8Array(this.buffer.splice(0, frameLength));
      const decoded = this.decodeFrame(frame);
      if (decoded) messages.push(decoded);
    }
    return messages;
  }

  private decodeFrame(frame: Uint8Array): MAVLinkTelemetry | null {
    const messageId = frame[5];
    const view = new DataView(frame.buffer, frame.byteOffset + 6, frame[1]);
    if (messageId === 30 && frame[1] >= 16) {
      return {
        messageId,
        rollDeg: view.getFloat32(4, true) * 180 / Math.PI,
        pitchDeg: view.getFloat32(8, true) * 180 / Math.PI,
        yawDeg: view.getFloat32(12, true) * 180 / Math.PI
      };
    }
    if (messageId === 33 && frame[1] >= 20) {
      return { messageId, altitudeM: view.getInt32(12, true) / 1000, headingDeg: view.getUint16(18, true) / 100 };
    }
    if (messageId === 74 && frame[1] >= 20) {
      return {
        messageId,
        groundSpeedMs: view.getFloat32(4, true),
        headingDeg: view.getInt16(8, true),
        throttlePct: view.getUint16(10, true),
        altitudeM: view.getFloat32(12, true)
      };
    }
    return { messageId };
  }
}

interface SerialReader { read(): Promise<{ value?: Uint8Array; done: boolean }>; releaseLock(): void; }
interface SerialWriter { write(data: Uint8Array): Promise<void>; releaseLock(): void; }
interface SerialPortLike { open(options: { baudRate: number }): Promise<void>; close(): Promise<void>; readable?: { getReader(): SerialReader }; writable?: { getWriter(): SerialWriter }; }
interface SerialNavigator { requestPort(): Promise<SerialPortLike>; }

export class HardwareTelemetryBridge {
  private port: SerialPortLike | null = null;
  private parser = new MAVLinkParser();
  private active = false;
  private socket: WebSocket | null = null;

  public isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  public async connect(onTelemetry: (telemetry: MAVLinkTelemetry) => void, baudRate = 115200): Promise<void> {
    const serial = (navigator as Navigator & { serial?: SerialNavigator }).serial;
    if (!serial) throw new Error('WebSerial is not supported in this browser');
    this.port = await serial.requestPort();
    await this.port.open({ baudRate });
    this.active = true;
    const reader = this.port.readable?.getReader();
    if (!reader) return;
    try {
      while (this.active) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) this.parser.push(value).forEach(onTelemetry);
      }
    } finally {
      reader.releaseLock();
    }
  }

  public async disconnect(): Promise<void> {
    this.active = false;
    this.socket?.close();
    this.socket = null;
    await this.port?.close();
    this.port = null;
  }

  public connectWebSocket(url: string, onTelemetry: (telemetry: MAVLinkTelemetry) => void): void {
    this.socket?.close();
    this.socket = new WebSocket(url);
    this.socket.binaryType = 'arraybuffer';
    this.socket.onmessage = event => {
      if (event.data instanceof ArrayBuffer) this.parser.push(new Uint8Array(event.data)).forEach(onTelemetry);
    };
  }

  public async sendRaw(frame: Uint8Array): Promise<boolean> {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(frame);
      return true;
    }
    const writer = this.port?.writable?.getWriter();
    if (!writer) return false;
    try { await writer.write(frame); return true; } finally { writer.releaseLock(); }
  }

  public mirrorFlightCommand(command: { throttle?: number; pitch?: number; yaw?: number; roll?: number }): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ type: 'ASTRODYNE_FLIGHT_COMMAND', ...command, timestamp: Date.now() }));
    return true;
  }
}
