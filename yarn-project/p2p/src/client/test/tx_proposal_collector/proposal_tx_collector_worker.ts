import { MockL2BlockSource } from '@aztec/archiver/test';
import { SecretValue } from '@aztec/foundation/config';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, Timer, executeTimeout } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { ClientProtocolCircuitVerifier } from '@aztec/stdlib/interfaces/server';
import { P2PClientType, PeerErrorSeverity } from '@aztec/stdlib/p2p';
import type { Tx, TxValidationResult } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { PeerId } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import type { P2PConfig } from '../../../config.js';
import type { IBatchRequestTxValidator } from '../../../services/reqresp/batch-tx-requester/tx_validator.js';
import { RateLimitStatus } from '../../../services/reqresp/rate-limiter/rate_limiter.js';
import {
  BatchTxRequesterCollector,
  SendBatchRequestCollector,
} from '../../../services/tx_collection/proposal_tx_collector.js';
import { AlwaysTrueCircuitVerifier } from '../../../test-helpers/reqresp-nodes.js';
import {
  BENCHMARK_CONSTANTS,
  InMemoryAttestationPool,
  InMemoryTxPool,
  UNLIMITED_RATE_LIMIT_QUOTA,
  calculateInternalTimeout,
  createMockEpochCache,
  createMockWorldStateSynchronizer,
} from '../../../test-helpers/testbench-utils.js';
import { createP2PClient } from '../../index.js';
import type { P2PClient } from '../../p2p_client.js';
import {
  type WorkerCommand,
  type WorkerResponse,
  deserializeBlockProposal,
  deserializeTx,
  deserializeTxHash,
} from './proposal_tx_collector_worker_protocol.js';

let client: P2PClient | undefined;
let txPool: InMemoryTxPool | undefined;
let attestationPool: InMemoryAttestationPool | undefined;
let logger = createLogger('p2p:proposal-bench');
let kvStore: Awaited<ReturnType<typeof openTmpStore>> | undefined;
let ipcDisconnected = false;

function ensureClient(): P2PClient {
  if (!client || !txPool) {
    throw new Error('Worker client not started');
  }
  return client;
}

function isIpcDisconnectError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EPIPE' || code === 'ERR_IPC_CHANNEL_CLOSED';
}

function sendMessage(message: WorkerResponse): Promise<void> {
  const send = process.send;
  if (!send || !process.connected || ipcDisconnected) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const fallbackTimeout = setTimeout(() => resolve(), 2000);
    try {
      send.call(process, message, undefined, undefined, err => {
        clearTimeout(fallbackTimeout);
        if (!err) {
          resolve();
          return;
        }
        if (isIpcDisconnectError(err)) {
          ipcDisconnected = true;
          resolve();
          return;
        }
        logger.warn('Failed to send IPC message', { error: err?.message ?? String(err) });
        resolve();
      });
    } catch (err: any) {
      clearTimeout(fallbackTimeout);
      if (isIpcDisconnectError(err)) {
        ipcDisconnected = true;
        resolve();
        return;
      }
      logger.warn('Failed to send IPC message', { error: err?.message ?? String(err) });
      resolve();
    }
  });
}

async function startClient(config: P2PConfig, clientIndex: number) {
  txPool = new InMemoryTxPool();
  attestationPool = new InMemoryAttestationPool();
  const epochCache = createMockEpochCache();
  const worldState = createMockWorldStateSynchronizer();
  const l2BlockSource = new MockL2BlockSource();
  const proofVerifier = new AlwaysTrueCircuitVerifier();
  kvStore = await openTmpStore(`proposal-bench-${clientIndex}`);
  logger = createLogger(`p2p:proposal-bench:${clientIndex}`);

  const telemetry = getTelemetryClient();
  const deps = {
    txPool,
    attestationPool,
    store: kvStore,
    logger,
  };

  client = await createP2PClient(
    P2PClientType.Full,
    config as P2PConfig & DataStoreConfig,
    l2BlockSource as L2BlockSource & ContractDataSource,
    proofVerifier as ClientProtocolCircuitVerifier,
    worldState,
    epochCache,
    'proposal-tx-collector-bench-worker',
    new DateProvider(),
    telemetry as TelemetryClient,
    deps,
  );

  await client.start();
  installUnlimitedRateLimits();

  for (let i = 0; i < 120; i++) {
    if (client.isReady()) {
      return;
    }
    await sleep(500);
  }

  throw new Error('Timed out waiting for P2P client readiness');
}

function installSamplerOverrides(peerList: ReturnType<typeof peerIdFromString>[]) {
  const reqResp = (ensureClient() as any).p2pService.reqresp as any;
  const sampler = reqResp.connectionSampler as any;

  sampler.getPeerListSortedByConnectionCountAsc = (excluding?: Set<string>) => {
    if (!excluding || excluding.size === 0) {
      return peerList;
    }
    return peerList.filter(peerId => !excluding.has(peerId.toString()));
  };
  sampler.samplePeersBatch = (numberToSample: number, excluding?: Map<string, boolean>) => {
    const filtered = peerList.filter(peerId => !excluding?.has(peerId.toString()));
    return filtered.slice(0, Math.min(numberToSample, filtered.length));
  };
  sampler.getPeer = (excluding?: Map<string, boolean>) => {
    const filtered = peerList.filter(peerId => !excluding?.has(peerId.toString()));
    return filtered[0];
  };
}

function installUnlimitedRateLimits() {
  const reqResp = (ensureClient() as any).p2pService.reqresp as any;
  const rateLimiter = reqResp.rateLimiter as any;

  rateLimiter.getRateLimits = () => UNLIMITED_RATE_LIMIT_QUOTA;
  rateLimiter.allow = () => RateLimitStatus.Allowed;
}

async function runCollector(cmd: Extract<WorkerCommand, { type: 'RUN_COLLECTOR' }>) {
  const { collectorType, txHashes, blockProposal, pinnedPeerId, peerIds, timeoutMs } = cmd;
  const reqResp = (ensureClient() as any).p2pService.reqresp as any;
  const peerList = peerIds.map(peerId => peerIdFromString(peerId));

  installSamplerOverrides(peerList);
  installUnlimitedRateLimits();

  const p2pService = {
    reqResp,
    connectionSampler: {
      getPeerListSortedByConnectionCountAsc: () => peerList,
    },
    txValidatorConfig: {
      l1ChainId: 1,
      rollupVersion: 1,
      proofVerifier: {
        verifyProof: () => Promise.resolve({ valid: true, durationMs: 0, totalDurationMs: 0 }),
        stop: () => Promise.resolve(),
      },
    },
    peerScoring: {
      penalizePeer: (_peerId: PeerId, _penalty: PeerErrorSeverity) => {},
    },
  };

  const parsedTxHashes = txHashes.map(deserializeTxHash);
  const parsedProposal = deserializeBlockProposal(blockProposal);
  const pinnedPeer = pinnedPeerId ? peerIdFromString(pinnedPeerId) : undefined;

  const timer = new Timer();
  let fetchedCount = 0;

  const internalTimeoutMs = calculateInternalTimeout(timeoutMs);

  const noopTxValidator: IBatchRequestTxValidator = {
    validateRequestedTx: (_tx: Tx): Promise<TxValidationResult> => Promise.resolve({ result: 'valid' }),
    validateRequestedTxs: (txs: Tx[]): Promise<TxValidationResult[]> =>
      Promise.resolve(txs.map(() => ({ result: 'valid' }))),
  };

  try {
    if (collectorType === 'batch-requester') {
      const collector = new BatchTxRequesterCollector(p2pService, logger, new DateProvider(), noopTxValidator);
      const fetched = await executeTimeout(
        (_signal: AbortSignal) => collector.collectTxs(parsedTxHashes, parsedProposal, pinnedPeer, internalTimeoutMs),
        timeoutMs,
        () => new Error(`Collector timed out after ${timeoutMs}ms`),
      );
      fetchedCount = fetched.length;
    } else {
      const collector = new SendBatchRequestCollector(
        p2pService,
        BENCHMARK_CONSTANTS.FIXED_MAX_PEERS,
        BENCHMARK_CONSTANTS.FIXED_MAX_RETRY_ATTEMPTS,
      );
      const fetched = await executeTimeout(
        (_signal: AbortSignal) => collector.collectTxs(parsedTxHashes, parsedProposal, pinnedPeer, internalTimeoutMs),
        timeoutMs,
        () => new Error(`Collector timed out after ${timeoutMs}ms`),
      );
      fetchedCount = fetched.length;
    }
  } catch (err: any) {
    logger.warn(`Collector error: ${err?.message ?? String(err)}`);
  }

  return { durationMs: timer.ms(), fetchedCount };
}

async function stopClient() {
  if (!client) {
    return;
  }
  await client.stop();
  if (kvStore?.close) {
    await kvStore.close();
  }
  client = undefined;
  txPool = undefined;
  attestationPool = undefined;
}

process.on('disconnect', () => {
  ipcDisconnected = true;
  void stopClient().finally(() => process.exit(0));
});

process.on('error', err => {
  if (isIpcDisconnectError(err)) {
    ipcDisconnected = true;
    return;
  }
  logger.warn('Worker process error', { error: err?.message ?? String(err) });
});

process.on('message', (msg: WorkerCommand) => {
  void (async () => {
    if (!msg || typeof msg !== 'object') {
      return;
    }

    const requestId = msg.requestId;

    try {
      switch (msg.type) {
        case 'START': {
          const rawConfig = msg.config;
          const config: P2PConfig = {
            ...rawConfig,
            peerIdPrivateKey: rawConfig.peerIdPrivateKey ? new SecretValue(rawConfig.peerIdPrivateKey) : undefined,
          } as P2PConfig;

          await startClient(config, msg.clientIndex);
          const peerId = (ensureClient() as any).p2pService.node.peerId.toString();
          await sendMessage({ type: 'READY', requestId, peerId });
          break;
        }
        case 'SET_TXS': {
          if (!txPool) {
            throw new Error('Tx pool not initialized');
          }
          const txs = msg.txs.map(deserializeTx);
          const count = msg.mode === 'append' ? txPool.appendTxs(txs) : txPool.setTxs(txs);
          await sendMessage({ type: 'TXS_SET', requestId, count });
          break;
        }
        case 'SET_BLOCK_PROPOSAL': {
          if (!attestationPool) {
            throw new Error('Attestation pool not initialized');
          }
          const proposal = deserializeBlockProposal(msg.blockProposal);
          await attestationPool.addBlockProposal(proposal);
          await sendMessage({ type: 'BLOCK_PROPOSAL_SET', requestId, archiveRoot: proposal.archive.toString() });
          break;
        }
        case 'RUN_COLLECTOR': {
          const { durationMs, fetchedCount } = await runCollector(msg);
          await sendMessage({ type: 'COLLECTOR_RESULT', requestId, durationMs, fetchedCount });
          break;
        }
        case 'GET_PEER_COUNT': {
          const peers = await ensureClient().getPeers();
          await sendMessage({ type: 'PEER_COUNT', requestId, count: peers.length });
          break;
        }
        case 'STOP': {
          await stopClient();
          await sendMessage({ type: 'STOPPED', requestId });
          process.exit(0);
          break;
        }
        default: {
          const _exhaustive: never = msg;
          throw new Error(`Unknown command: ${(msg as { type?: string }).type}`);
        }
      }
    } catch (err: any) {
      await sendMessage({ type: 'ERROR', requestId, error: err?.message ?? String(err) });
      if (msg.type === 'START') {
        process.exit(1);
      }
    }
  })();
});
