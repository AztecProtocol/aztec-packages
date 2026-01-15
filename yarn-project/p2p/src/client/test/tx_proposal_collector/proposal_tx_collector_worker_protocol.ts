import { BlockProposal } from '@aztec/stdlib/p2p';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import type { P2PConfig } from '../../../config.js';

export type SerializedP2PConfig = Omit<P2PConfig, 'peerIdPrivateKey'> & { peerIdPrivateKey?: string };

export type CollectorType = 'batch-requester' | 'send-batch-request';

export type WorkerCommand =
  | { type: 'START'; requestId: string; clientIndex: number; config: SerializedP2PConfig }
  | { type: 'SET_TXS'; requestId: string; txs: string[]; mode?: 'replace' | 'append' }
  | { type: 'SET_BLOCK_PROPOSAL'; requestId: string; blockProposal: string }
  | {
      type: 'RUN_COLLECTOR';
      requestId: string;
      collectorType: CollectorType;
      txHashes: string[];
      blockProposal: string;
      pinnedPeerId?: string;
      peerIds: string[];
      timeoutMs: number;
    }
  | { type: 'GET_PEER_COUNT'; requestId: string }
  | { type: 'STOP'; requestId: string };

export type WorkerResponse =
  | { type: 'READY'; requestId: string; peerId: string }
  | { type: 'TXS_SET'; requestId: string; count: number }
  | { type: 'BLOCK_PROPOSAL_SET'; requestId: string; archiveRoot: string }
  | { type: 'COLLECTOR_RESULT'; requestId: string; durationMs: number; fetchedCount: number; error?: string }
  | { type: 'PEER_COUNT'; requestId: string; count: number }
  | { type: 'STOPPED'; requestId: string }
  | { type: 'ERROR'; requestId: string; error: string };

export type WorkerMessage = WorkerCommand | WorkerResponse;

export const serializeTx = (tx: Tx) => tx.toBuffer().toString('hex');
export const deserializeTx = (hex: string) => Tx.fromBuffer(Buffer.from(hex, 'hex'));

export const serializeTxHash = (txHash: TxHash) => txHash.toString();
export const deserializeTxHash = (hex: string) => TxHash.fromString(hex);

export const serializeBlockProposal = (proposal: BlockProposal) => proposal.toBuffer().toString('hex');
export const deserializeBlockProposal = (hex: string) => BlockProposal.fromBuffer(Buffer.from(hex, 'hex'));
