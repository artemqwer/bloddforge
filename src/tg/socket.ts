import { Buffer } from 'buffer';
import { PromisedWebSockets } from 'telegram/extensions';

// GramJS' browser socket decodes frames via `new Response(blob)`, which React
// Native's WebSocket does not support reliably. This variant asks for raw
// ArrayBuffers and feeds them into the same read buffer.
export class RNWebSocket extends PromisedWebSockets {
  async connect(port: number, ip: string, testServers = false): Promise<unknown> {
    const self = this as any;
    self.stream = Buffer.alloc(0);
    self.canRead = new Promise((resolve) => {
      self.resolveRead = resolve;
    });
    self.closed = false;
    self.website = this.getWebSocketLink(ip, port, testServers);

    const ws = new WebSocket(self.website, 'binary');
    ws.binaryType = 'arraybuffer';
    self.client = ws;

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        this.receive();
        resolve(this);
      };
      ws.onerror = (error) => reject(error);
      ws.onclose = () => {
        self.resolveRead?.(false);
        self.closed = true;
      };
    });
  }

  async receive(): Promise<void> {
    const self = this as any;
    const ws: WebSocket | undefined = self.client;
    if (!ws) return;
    ws.onmessage = (message) => {
      const data = Buffer.from(new Uint8Array(message.data as ArrayBuffer));
      self.stream = Buffer.concat([self.stream, data]);
      self.resolveRead?.(true);
    };
  }

  async close(): Promise<void> {
    const self = this as any;
    self.client?.close();
    self.closed = true;
  }
}
