import { PeerId } from '@libp2p/interface-peer-id';
import { Stream } from '@libp2p/interface-connection';
import { Libp2p } from 'libp2p';

export class LibP2PPeer {
  readonly streams: Stream[] = [];
  constructor(private peerId: PeerId, stream: Stream) {
    this.streams.push(stream);
  }

  public static async dial(node: Libp2p, peerId: PeerId, protocol: string) {
    const stream = await node.dialProtocol(peerId, protocol);
    return new LibP2PPeer(peerId, stream);
  }

  public addStream(stream: Stream) {
    this.streams.push(stream);
  }
}
