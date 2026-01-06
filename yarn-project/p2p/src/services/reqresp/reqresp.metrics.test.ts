import { Fr } from '@aztec/foundation/fields';
import { sleep } from '@aztec/foundation/sleep';
import type {
  Histogram,
  Meter,
  MetricAttributesType,
  TelemetryClient,
  Tracer,
  UpDownCounter,
} from '@aztec/telemetry-client';
import { Metrics } from '@aztec/telemetry-client';

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { PeerId } from '@libp2p/interface';

import {
  MOCK_SUB_PROTOCOL_HANDLERS,
  MOCK_SUB_PROTOCOL_VALIDATORS,
  type ReqRespNode,
  connectToPeers,
  createLibp2pNode,
  stopNodes,
} from '../../test-helpers/reqresp-nodes.js';
import { ReqRespSubProtocol } from './interface.js';
import { BitVector, BlockTxsRequest } from './protocols/block_txs/index.js';
import { ReqResp } from './reqresp.js';

class TestHistogram implements Histogram {
  public records: Array<{ value: number; attributes?: MetricAttributesType }> = [];
  record(value: number, attributes?: MetricAttributesType) {
    this.records.push({ value, attributes });
  }
}

class TestUpDownCounter implements UpDownCounter {
  public adds: Array<{ value: number; attributes?: MetricAttributesType }> = [];
  add(value: number, attributes?: MetricAttributesType) {
    this.adds.push({ value, attributes });
  }
}

class InMemoryMeter {
  public histograms = new Map<string, TestHistogram>();
  public counters = new Map<string, TestUpDownCounter>();
  createHistogram(name: string, _opts?: any): Histogram {
    const h = new TestHistogram();
    this.histograms.set(name, h);
    return h;
  }
  createUpDownCounter(name: string, _opts?: any): UpDownCounter {
    const c = new TestUpDownCounter();
    this.counters.set(name, c);
    return c;
  }
}

class InMemoryTelemetryClient implements TelemetryClient {
  private meter = new InMemoryMeter();
  isEnabled(): boolean {
    return true;
  }
  getMeter(): Meter {
    return this.meter as unknown as Meter;
  }
  getTracer(): Tracer {
    return {
      startActiveSpan: (_name: string, fn: (span: any) => any) => fn({ setAttributes() {}, setStatus() {}, end() {} }),
      startSpan: () => ({ setAttributes() {}, setStatus() {}, end() {} }),
    } as unknown as Tracer;
  }
  stop(): Promise<void> {
    return Promise.resolve();
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
  setExportedPublicTelemetry(): void {}
  setPublicTelemetryCollectFrom(): void {}
  // helpers
  getInMemoryMeter() {
    return this.meter;
  }
}

const waitFor = async (check: () => void, timeoutMs = 2000, intervalMs = 50) => {
  const start = Date.now();
  let lastError: unknown = undefined;
  while (Date.now() - start < timeoutMs) {
    try {
      check();
      return;
    } catch (err) {
      lastError = err;
      await sleep(intervalMs);
    }
  }
  // Re-throw the last assertion error for better debugging
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

describe('ReqResp metrics for BLOCK and BLOCK_TXS', () => {
  jest.setTimeout(60_000);

  let a: ReqRespNode;
  let b: ReqRespNode;
  const telemetryA = new InMemoryTelemetryClient();
  const telemetryB = new InMemoryTelemetryClient();

  beforeAll(async () => {
    const p2pA = await createLibp2pNode();
    const p2pB = await createLibp2pNode();
    const dummyPeerScoring = { penalizePeer: (_peerId: PeerId) => 0 } as any;

    const config = {
      overallRequestTimeoutMs: 4000,
      individualRequestTimeoutMs: 2000,
      dialTimeoutMs: 1000,
      p2pOptimisticNegotiation: false,
    };

    a = { p2p: p2pA, req: new ReqResp(config, p2pA, dummyPeerScoring, undefined, {}, telemetryA) };
    b = { p2p: p2pB, req: new ReqResp(config, p2pB, dummyPeerScoring, undefined, {}, telemetryB) };

    await a.req.start(MOCK_SUB_PROTOCOL_HANDLERS, MOCK_SUB_PROTOCOL_VALIDATORS);
    await b.req.start(MOCK_SUB_PROTOCOL_HANDLERS, MOCK_SUB_PROTOCOL_VALIDATORS);

    await connectToPeers([a, b]);
    await sleep(300);
  });

  afterAll(async () => {
    await stopNodes([a, b]);
  });

  it('records metrics for BLOCK and BLOCK_TXS requests', async () => {
    // Send a BLOCK request
    const blockReq = Fr.ONE.toBuffer();
    const res1 = await a.req.sendRequestToPeer(b.p2p.peerId, ReqRespSubProtocol.BLOCK, blockReq);
    expect(res1.status).toBe(0); // SUCCESS

    // Send a BLOCK_TXS request with a small bitvector
    const bv = BitVector.init(8, [0, 3, 5]);
    const blockTxsReq = new BlockTxsRequest(Fr.random(), bv).toBuffer();
    const res2 = await a.req.sendRequestToPeer(b.p2p.peerId, ReqRespSubProtocol.BLOCK_TXS, blockTxsReq);
    expect(res2.status).toBe(0); // SUCCESS

    // Wait for async metrics to be recorded reliably
    await waitFor(() => {
      const mA = telemetryA.getInMemoryMeter();
      const mB = telemetryB.getInMemoryMeter();

      // Requester side
      expect(mA.counters.get(Metrics.P2P_REQ_RESP_SENT_REQUESTS)?.adds.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(mA.histograms.get(Metrics.P2P_REQ_RESP_OUTBOUND_DURATION)?.records.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(mA.histograms.get(Metrics.P2P_REQ_RESP_REQUEST_SIZE)?.records.length ?? 0).toBeGreaterThanOrEqual(2);
      // Response size recorded only on SUCCESS
      expect(mA.histograms.get(Metrics.P2P_REQ_RESP_RESPONSE_SIZE)?.records.length ?? 0).toBeGreaterThanOrEqual(2);

      // Responder side
      expect(mB.counters.get(Metrics.P2P_REQ_RESP_RECEIVED_REQUESTS)?.adds.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(
        mB.histograms.get(Metrics.P2P_REQ_RESP_INBOUND_HANDLER_DURATION)?.records.length ?? 0,
      ).toBeGreaterThanOrEqual(2);
      expect(
        mB.histograms.get(Metrics.P2P_REQ_RESP_RESPONSE_COMPRESSED_SIZE)?.records.length ?? 0,
      ).toBeGreaterThanOrEqual(2);
      expect(mB.histograms.get(Metrics.P2P_REQ_RESP_RESPONSE_SIZE)?.records.length ?? 0).toBeGreaterThanOrEqual(2);
    });
  });
});
