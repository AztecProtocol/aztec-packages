/**
 * Observer that decorates a libp2p P2PService's gossip handlers to record the
 * source peer of every received gossip message. Replaces the inline
 * `monitorP2PTraffic` monkey-patch used in the pre-worker-thread version of
 * `preferred_gossip_network.test.ts`, now encapsulated so it can be installed
 * inside a worker where the live P2PService instance lives.
 *
 * Records are kept in memory and drained via `drain()`, which the worker
 * exposes over RPC so the parent test can assert on sources at the end of the
 * run.
 */

export type GossipTopic = 'tx' | 'proposal' | 'attestation';

export type GossipSourceRecord = {
  topic: GossipTopic;
  source: string;
  msgId: string;
  timestampMs: number;
};

type GossipHandler = (payloadData: Buffer, msgId: string, source: { toString(): string }) => Promise<unknown>;

const HANDLER_BY_TOPIC: Record<GossipTopic, string> = {
  tx: 'handleGossipedTx',
  proposal: 'processBlockFromPeer',
  attestation: 'processCheckpointAttestationFromPeer',
};

export class GossipSourceObserver {
  private records: GossipSourceRecord[] = [];
  private originals: Partial<Record<GossipTopic, GossipHandler>> = {};
  private target?: any;

  /**
   * Decorates the three gossip handlers on the given P2PService instance.
   * Each wrapper records the source peer ID before delegating to the original
   * handler so the observed message is still processed normally.
   */
  attach(p2pService: any): void {
    if (this.target) {
      throw new Error('GossipSourceObserver already attached');
    }
    this.target = p2pService;
    for (const topic of Object.keys(HANDLER_BY_TOPIC) as GossipTopic[]) {
      const methodName = HANDLER_BY_TOPIC[topic];
      const original = p2pService[methodName];
      if (typeof original !== 'function') {
        throw new Error(`GossipSourceObserver: P2PService is missing ${methodName}`);
      }
      const bound = original.bind(p2pService) as GossipHandler;
      this.originals[topic] = bound;
      p2pService[methodName] = async (payloadData: Buffer, msgId: string, source: { toString(): string }) => {
        this.records.push({ topic, source: source.toString(), msgId, timestampMs: Date.now() });
        await bound(payloadData, msgId, source);
      };
    }
  }

  /** Returns the recorded events and clears the internal buffer. */
  drain(): GossipSourceRecord[] {
    const out = this.records;
    this.records = [];
    return out;
  }

  /** Restores the original handlers. Idempotent. */
  detach(): void {
    if (!this.target) {
      return;
    }
    for (const topic of Object.keys(HANDLER_BY_TOPIC) as GossipTopic[]) {
      const original = this.originals[topic];
      if (original) {
        this.target[HANDLER_BY_TOPIC[topic]] = original;
      }
    }
    this.originals = {};
    this.target = undefined;
  }
}
