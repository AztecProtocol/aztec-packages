import type { CheckpointProposalHash, SlotNumber } from '@aztec/foundation/branded-types';
import type {
  AuthRequest,
  ENR,
  P2P,
  P2PBlockReceivedCallback,
  P2PCheckpointAttestationCallback,
  P2PCheckpointReceivedCallback,
  P2PConfig,
  P2PDuplicateAttestationCallback,
  P2PDuplicateProposalCallback,
  P2POversizedProposalCallback,
  P2PSyncState,
  PeerId,
  ReqRespSubProtocol,
  ReqRespSubProtocolHandler,
  StatusMessage,
} from '@aztec/p2p';
import type { EthAddress, L2BlockStreamEvent, L2Tips } from '@aztec/stdlib/block';
import type { ITxProvider, PeerInfo } from '@aztec/stdlib/interfaces/server';
import type {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  CheckpointProposalCore,
  TopicType,
} from '@aztec/stdlib/p2p';
import type { BlockHeader, Tx, TxHash } from '@aztec/stdlib/tx';

export class DummyP2P implements P2P {
  public validateTxsReceivedInBlockProposal(_txs: Tx[]): Promise<void> {
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

  public getGossipMeshPeerCount(_topicType: TopicType): Promise<number> {
    return Promise.resolve(0);
  }

  public broadcastProposal(_proposal: BlockProposal): Promise<void> {
    throw new Error('DummyP2P does not implement "broadcastProposal"');
  }

  public broadcastCheckpointProposal(_proposal: CheckpointProposal): Promise<void> {
    throw new Error('DummyP2P does not implement "broadcastCheckpointProposal"');
  }

  public broadcastCheckpointAttestations(_attestations: CheckpointAttestation[]): Promise<void> {
    throw new Error('DummyP2P does not implement "broadcastCheckpointAttestations"');
  }

  public registerBlockProposalHandler(_handler: P2PBlockReceivedCallback): void {
    throw new Error('DummyP2P does not implement "registerBlockProposalHandler"');
  }

  public registerValidatorCheckpointProposalHandler(_handler: P2PCheckpointReceivedCallback): void {
    throw new Error('DummyP2P does not implement "registerValidatorCheckpointProposalHandler"');
  }

  public registerAllNodesCheckpointProposalHandler(_handler: P2PCheckpointReceivedCallback): void {
    throw new Error('DummyP2P does not implement "registerAllNodesCheckpointProposalHandler"');
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

  public handleFailedExecution(_txHashes: TxHash[]): Promise<void> {
    throw new Error('DummyP2P does not implement "handleFailedExecution"');
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
    // In TXE there is no concept of transactions but we need to implement this because of tagging. We return 'mined'
    // tx status for any tx hash.
    return Promise.resolve('mined');
  }

  public iteratePendingTxs(): AsyncIterableIterator<Tx> {
    throw new Error('DummyP2P does not implement "iteratePendingTxs"');
  }

  public iterateEligiblePendingTxs(): AsyncIterableIterator<Tx> {
    throw new Error('DummyP2P does not implement "iterateEligiblePendingTxs"');
  }

  public getPendingTxCount(): Promise<number> {
    throw new Error('DummyP2P does not implement "getPendingTxCount"');
  }

  public getEligiblePendingTxCount(): Promise<number> {
    throw new Error('DummyP2P does not implement "getEligiblePendingTxCount"');
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

  public getTxProvider(): ITxProvider {
    throw new Error('DummyP2P does not implement "getTxProvider"');
  }

  public getTxsByHash(_txHashes: TxHash[]): Promise<Tx[]> {
    throw new Error('DummyP2P does not implement "getTxsByHash"');
  }

  public getCheckpointAttestationsForSlot(
    _slot: SlotNumber,
    _proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]> {
    throw new Error('DummyP2P does not implement "getCheckpointAttestationsForSlot"');
  }

  public addOwnCheckpointAttestations(_attestations: CheckpointAttestation[]): Promise<void> {
    throw new Error('DummyP2P does not implement "addOwnCheckpointAttestations"');
  }

  public getProposalsForSlot(_slot: SlotNumber): Promise<{
    blockProposals: BlockProposal[];
    checkpointProposals: CheckpointProposalCore[];
  }> {
    return Promise.resolve({ blockProposals: [], checkpointProposals: [] });
  }

  public hasCheckpointProposalForSlot(_slot: SlotNumber): Promise<boolean> {
    return Promise.resolve(false);
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

  public getTxsByHashFromPool(_txHashes: TxHash[]): Promise<(Tx | undefined)[]> {
    throw new Error('DummyP2P does not implement "getTxsByHashFromPool"');
  }

  public hasTxsInPool(_txHashes: TxHash[]): Promise<boolean[]> {
    throw new Error('DummyP2P does not implement "hasTxsInPool"');
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

  protectTxs(_txHashes: TxHash[], _blockHeader: BlockHeader): Promise<TxHash[]> {
    throw new Error('DummyP2P does not implement "protectTxs".');
  }

  prepareForSlot(_slotNumber: SlotNumber): Promise<void> {
    return Promise.resolve();
  }

  addReqRespSubProtocol(_subProtocol: ReqRespSubProtocol, _handler: ReqRespSubProtocolHandler): Promise<void> {
    throw new Error('DummyP2P does not implement "addReqRespSubProtocol".');
  }
  handleAuthRequestFromPeer(_authRequest: AuthRequest, _peerId: PeerId): Promise<StatusMessage> {
    throw new Error('DummyP2P does not implement "handleAuthRequestFromPeer".');
  }

  //This is no-op
  public registerThisValidatorAddresses(_address: EthAddress[]): void {}

  public registerDuplicateProposalCallback(_callback: P2PDuplicateProposalCallback): void {
    throw new Error('DummyP2P does not implement "registerDuplicateProposalCallback"');
  }

  public registerOversizedProposalCallback(_callback: P2POversizedProposalCallback): void {
    throw new Error('DummyP2P does not implement "registerOversizedProposalCallback"');
  }

  public registerDuplicateAttestationCallback(_callback: P2PDuplicateAttestationCallback): void {
    throw new Error('DummyP2P does not implement "registerDuplicateAttestationCallback"');
  }

  public registerCheckpointAttestationCallback(_callback: P2PCheckpointAttestationCallback): void {
    throw new Error('DummyP2P does not implement "registerCheckpointAttestationCallback"');
  }

  public hasBlockProposalsForSlot(_slot: SlotNumber): Promise<boolean> {
    throw new Error('DummyP2P does not implement "hasBlockProposalsForSlot"');
  }
}
