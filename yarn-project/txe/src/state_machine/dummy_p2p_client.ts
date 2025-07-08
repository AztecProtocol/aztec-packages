import type {
  AuthRequest,
  ENR,
  P2P,
  P2PBlockReceivedCallback,
  P2PConfig,
  P2PSyncState,
  PeerId,
  ReqRespSubProtocol,
  ReqRespSubProtocolHandler,
  ReqRespSubProtocolValidators,
  StatusMessage,
} from '@aztec/p2p';
import type { L2BlockStreamEvent, L2Tips } from '@aztec/stdlib/block';
import type { PeerInfo } from '@aztec/stdlib/interfaces/server';
import type { BlockAttestation, BlockProposal } from '@aztec/stdlib/p2p';
import type { Tx, TxHash } from '@aztec/stdlib/tx';

export class DummyP2P implements P2P {
  public validate(_txs: Tx[]): Promise<void> {
    return Promise.resolve();
  }

  public clear(): Promise<void> {
    throw new Error('DummyP2P does not implement "clear".');
  }

  public getPendingTxs(): Promise<Tx[]> {
    throw new Error('DummyP2P does not implement "getPendingTxs"');
  }

  public getEncodedEnr(): Promise<string | undefined> {
    throw new Error('DummyP2P does not implement "getEncodedEnr"');
  }

  public getPeers(_includePending?: boolean): Promise<PeerInfo[]> {
    throw new Error('DummyP2P does not implement "getPeers"');
  }

  public broadcastProposal(_proposal: BlockProposal): Promise<void> {
    throw new Error('DummyP2P does not implement "broadcastProposal"');
  }

  public registerBlockProposalHandler(_handler: P2PBlockReceivedCallback): void {
    throw new Error('DummyP2P does not implement "registerBlockProposalHandler"');
  }

  public requestTxs(_txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    throw new Error('DummyP2P does not implement "requestTxs"');
  }

  public requestTxByHash(_txHash: TxHash): Promise<Tx | undefined> {
    throw new Error('DummyP2P does not implement "requestTxByHash"');
  }

  public sendTx(_tx: Tx): Promise<void> {
    throw new Error('DummyP2P does not implement "sendTx"');
  }

  public deleteTxs(_txHashes: TxHash[]): Promise<void> {
    throw new Error('DummyP2P does not implement "deleteTxs"');
  }

  public getTxByHashFromPool(_txHash: TxHash): Promise<Tx | undefined> {
    throw new Error('DummyP2P does not implement "getTxByHashFromPool"');
  }

  public getTxByHash(_txHash: TxHash): Promise<Tx | undefined> {
    throw new Error('DummyP2P does not implement "getTxByHash"');
  }

  public getArchivedTxByHash(_txHash: TxHash): Promise<Tx | undefined> {
    throw new Error('DummyP2P does not implement "getArchivedTxByHash"');
  }

  public getTxStatus(_txHash: TxHash): Promise<'pending' | 'mined' | undefined> {
    throw new Error('DummyP2P does not implement "getTxStatus"');
  }

  public iteratePendingTxs(): AsyncIterableIterator<Tx> {
    throw new Error('DummyP2P does not implement "iteratePendingTxs"');
  }

  public getPendingTxCount(): Promise<number> {
    throw new Error('DummyP2P does not implement "getPendingTxCount"');
  }

  public start(): Promise<void> {
    throw new Error('DummyP2P does not implement "start"');
  }

  public stop(): Promise<void> {
    throw new Error('DummyP2P does not implement "stop"');
  }

  public isReady(): boolean {
    throw new Error('DummyP2P does not implement "isReady"');
  }

  public getStatus(): Promise<P2PSyncState> {
    throw new Error('DummyP2P does not implement "getStatus"');
  }

  public getEnr(): ENR | undefined {
    throw new Error('DummyP2P does not implement "getEnr"');
  }

  public isP2PClient(): true {
    throw new Error('DummyP2P does not implement "isP2PClient"');
  }

  public getTxsByHash(_txHashes: TxHash[]): Promise<Tx[]> {
    throw new Error('DummyP2P does not implement "getTxsByHash"');
  }

  public getAttestationsForSlot(_slot: bigint, _proposalId?: string): Promise<BlockAttestation[]> {
    throw new Error('DummyP2P does not implement "getAttestationForSlot"');
  }

  public addAttestations(_attestations: BlockAttestation[]): Promise<void> {
    throw new Error('DummyP2P does not implement "addAttestations"');
  }

  public getL2BlockHash(_number: number): Promise<string | undefined> {
    throw new Error('DummyP2P does not implement "getL2BlockHash"');
  }

  public updateP2PConfig(_config: Partial<P2PConfig>): Promise<void> {
    throw new Error('DummyP2P does not implement "updateP2PConfig"');
  }

  public getL2Tips(): Promise<L2Tips> {
    throw new Error('DummyP2P does not implement "getL2Tips"');
  }

  public handleBlockStreamEvent(_event: L2BlockStreamEvent): Promise<void> {
    throw new Error('DummyP2P does not implement "handleBlockStreamEvent"');
  }

  public sync() {
    throw new Error('DummyP2P does not implement "sync"');
  }

  public requestTxsByHash(_txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    throw new Error('DummyP2P does not implement "requestTxsByHash"');
  }

  public getTxs(_filter: 'all' | 'pending' | 'mined'): Promise<Tx[]> {
    throw new Error('DummyP2P does not implement "getTxs"');
  }

  public getTxsByHashFromPool(_txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    throw new Error('DummyP2P does not implement "getTxsByHashFromPool"');
  }

  public hasTxsInPool(_txHashes: TxHash[]): Promise<boolean[]> {
    throw new Error('DummyP2P does not implement "hasTxsInPool"');
  }

  public addTxsToPool(_txs: Tx[]): Promise<number> {
    throw new Error('DummyP2P does not implement "addTxs"');
  }

  public getSyncedLatestBlockNum(): Promise<number> {
    throw new Error('DummyP2P does not implement "getSyncedLatestBlockNum"');
  }

  public getSyncedProvenBlockNum(): Promise<number> {
    throw new Error('DummyP2P does not implement "getSyncedProvenBlockNum"');
  }

  public getSyncedLatestSlot(): Promise<bigint> {
    throw new Error('DummyP2P does not implement "getSyncedLatestSlot"');
  }

  markTxsAsNonEvictable(_: TxHash[]): Promise<void> {
    throw new Error('DummyP2P does not implement "markTxsAsNonEvictable".');
  }

  addReqRespSubProtocol(
    _subProtocol: ReqRespSubProtocol,
    _handler: ReqRespSubProtocolHandler,
    _validator?: ReqRespSubProtocolValidators[ReqRespSubProtocol],
  ): Promise<void> {
    throw new Error('DummyP2P does not implement "addReqRespSubProtocol".');
  }
  handleAuthRequestFromPeer(_authRequest: AuthRequest, _peerId: PeerId): Promise<StatusMessage> {
    throw new Error('DummyP2P does not implement "handleAuthRequestFromPeer".');
  }
}
