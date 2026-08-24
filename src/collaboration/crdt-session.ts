export interface CollaborationOperation<T = unknown> {
  key: string;
  value: T;
  clock: number;
  clientId: string;
}

export interface CollaborationSnapshot {
  roomId: string;
  clientId: string;
  peers: number;
  values: Record<string, unknown>;
  clock: number;
}

/** WebRTC data-channel transport. Signaling payloads can be exchanged by any app/backend. */
export class WebRTCCollaborationPeer {
  private connection: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private onOperation: (operation: CollaborationOperation) => void;

  constructor(onOperation: (operation: CollaborationOperation) => void, configuration?: RTCConfiguration) {
    this.onOperation = onOperation;
    this.connection = new RTCPeerConnection(configuration);
    this.connection.ondatachannel = event => this.bindChannel(event.channel);
  }

  public async createOffer(): Promise<string> {
    this.bindChannel(this.connection.createDataChannel('astrodyne-crdt', { ordered: true }));
    await this.connection.setLocalDescription(await this.connection.createOffer());
    await this.waitForIce();
    return JSON.stringify(this.connection.localDescription);
  }

  public async acceptOffer(serializedOffer: string): Promise<string> {
    const offer = JSON.parse(serializedOffer) as RTCSessionDescriptionInit;
    await this.connection.setRemoteDescription(offer);
    await this.connection.setLocalDescription(await this.connection.createAnswer());
    await this.waitForIce();
    return JSON.stringify(this.connection.localDescription);
  }

  public async acceptAnswer(serializedAnswer: string): Promise<void> {
    await this.connection.setRemoteDescription(JSON.parse(serializedAnswer) as RTCSessionDescriptionInit);
  }

  public send(operation: CollaborationOperation): boolean {
    if (this.channel?.readyState !== 'open') return false;
    this.channel.send(JSON.stringify(operation));
    return true;
  }

  public close(): void {
    this.channel?.close();
    this.connection.close();
  }

  private bindChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    this.channel.onmessage = event => {
      try { this.onOperation(JSON.parse(String(event.data)) as CollaborationOperation); } catch { /* ignore invalid peer payloads */ }
    };
  }

  private async waitForIce(): Promise<void> {
    if (this.connection.iceGatheringState === 'complete') return;
    await new Promise<void>(resolve => {
      const listener = () => {
        if (this.connection.iceGatheringState === 'complete') {
          this.connection.removeEventListener('icegatheringstatechange', listener);
          resolve();
        }
      };
      this.connection.addEventListener('icegatheringstatechange', listener);
      setTimeout(resolve, 1500);
    });
  }
}

/** Lightweight LWW CRDT transported over BroadcastChannel for zero-server design rooms. */
export class CollaborativeDesignSession {
  private channel: BroadcastChannel | null = null;
  private clock = 0;
  private peers = new Set<string>();
  private values = new Map<string, CollaborationOperation>();
  private listeners = new Set<(operation: CollaborationOperation) => void>();
  private webRtcPeers = new Set<WebRTCCollaborationPeer>();
  public readonly clientId: string;

  constructor(public readonly roomId: string, clientId?: string) {
    this.clientId = clientId ?? `engineer-${Math.random().toString(36).slice(2, 9)}`;
  }

  public connect(): boolean {
    if (typeof BroadcastChannel === 'undefined') return false;
    if (this.channel) return true;
    this.channel = new BroadcastChannel(`astrodyne-room-${this.roomId}`);
    this.channel.onmessage = event => this.receive(event.data as CollaborationOperation);
    this.publishInternal('__presence__', { joined: true });
    return true;
  }

  public disconnect(): void {
    if (!this.channel) return;
    this.publishInternal('__presence__', { joined: false });
    this.channel.close();
    this.channel = null;
    this.peers.clear();
    this.webRtcPeers.forEach(peer => peer.close());
    this.webRtcPeers.clear();
  }

  public createWebRTCPeer(configuration?: RTCConfiguration): WebRTCCollaborationPeer {
    const peer = new WebRTCCollaborationPeer(operation => this.receive(operation), configuration);
    this.webRtcPeers.add(peer);
    return peer;
  }

  public publish<T>(key: string, value: T): CollaborationOperation<T> {
    return this.publishInternal(key, value) as CollaborationOperation<T>;
  }

  public apply(operation: CollaborationOperation): boolean {
    this.clock = Math.max(this.clock, operation.clock) + 1;
    const existing = this.values.get(operation.key);
    const newer = !existing || operation.clock > existing.clock ||
      (operation.clock === existing.clock && operation.clientId > existing.clientId);
    if (!newer) return false;
    this.values.set(operation.key, operation);
    if (operation.key === '__presence__') {
      const joined = (operation.value as { joined?: boolean }).joined !== false;
      if (joined) this.peers.add(operation.clientId); else this.peers.delete(operation.clientId);
    }
    this.listeners.forEach(listener => listener(operation));
    return true;
  }

  public subscribe(listener: (operation: CollaborationOperation) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public snapshot(): CollaborationSnapshot {
    const values: Record<string, unknown> = {};
    this.values.forEach((operation, key) => {
      if (key !== '__presence__') values[key] = operation.value;
    });
    return { roomId: this.roomId, clientId: this.clientId, peers: this.peers.size, values, clock: this.clock };
  }

  private publishInternal<T>(key: string, value: T): CollaborationOperation<T> {
    const operation: CollaborationOperation<T> = { key, value, clock: ++this.clock, clientId: this.clientId };
    this.apply(operation);
    this.channel?.postMessage(operation);
    this.webRtcPeers.forEach(peer => peer.send(operation));
    return operation;
  }

  private receive(operation: CollaborationOperation): void {
    if (!operation || operation.clientId === this.clientId) return;
    this.apply(operation);
  }
}
