import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { BlockNumber, type SlotNumber } from '@aztec/foundation/branded-types';
import { maxBy } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import type { EthAddress, L2BlockSource } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { type BlockMinFeesProvider, GasFees } from '@aztec/stdlib/gas';
import type { ClientProtocolCircuitVerifier, WorldStateSynchronizer } from '@aztec/stdlib/interfaces/server';
import {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  type CheckpointProposalCore,
  type Gossipable,
  PeerErrorSeverity,
  PeerErrorSeverityByHarshness,
} from '@aztec/stdlib/p2p';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { Tx, type TxValidationResult } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';
import { Attributes, type TelemetryClient, WithTracer, trackSpan } from '@aztec/telemetry-client';

import { type PeerId, TopicValidatorResult } from '@libp2p/interface';

import type { P2PConfig } from '../../config.js';
import { CheckpointProposalReceivedCallbackNotRegisteredError } from '../../errors/p2p-service.error.js';
import type { MemPools } from '../../mem_pools/interface.js';
import {
  BlockProposalValidator,
  CheckpointAttestationValidator,
  CheckpointProposalValidator,
  DoubleSpendTxValidator,
  FishermanAttestationValidator,
  getDefaultAllowedSetupFunctions,
} from '../../msg_validators/index.js';
import {
  type TransactionValidator,
  createFirstStageTxValidationsForGossipedTransactions,
  createSecondStageTxValidationsForGossipedTransactions,
  createTxValidatorForBlockProposalReceivedTxs,
} from '../../msg_validators/tx_validator/factory.js';
import type { TxValidationCache } from '../../msg_validators/tx_validator/tx_validation_cache.js';
import type { BatchRequestTxValidatorConfig } from '../reqresp/batch-tx-requester/tx_validator.js';
import {
  BlockTxsRequest,
  BlockTxsResponse,
  ReqRespSubProtocol,
  type ReqRespSubProtocolHandlers,
  ValidationError,
  reqRespBlockTxsHandler,
  reqRespStatusHandler,
  reqRespTxHandler,
} from '../reqresp/index.js';
import type {
  P2PBlockReceivedCallback,
  P2PCheckpointAttestationCallback,
  P2PCheckpointReceivedCallback,
  P2PDuplicateAttestationCallback,
} from '../service.js';

interface ValidationResult {
  name: string;
  isValid: TxValidationResult;
  severity: PeerErrorSeverity;
}

type ValidationOutcome = { allPassed: true } | { allPassed: false; failure: ValidationResult };

// REFACTOR: Unify with the type above
export type ReceivedMessageValidationResult<T, M = undefined> =
  | { obj: T; result: Exclude<TopicValidatorResult, TopicValidatorResult.Reject>; metadata?: M }
  | { obj?: T; result: TopicValidatorResult.Reject; metadata?: M; severity: PeerErrorSeverity };

/**
 * The subset of libp2p network operations the message processor invokes while handling received
 * messages: re-broadcasting (propagate) and peer scoring (penalizePeer). Kept as a narrow interface
 * so the processor stays decoupled from the libp2p node itself.
 */
export interface P2PNetwork {
  propagate<T extends Gossipable>(message: T): Promise<void>;
  penalizePeer(peerId: PeerId, severity: PeerErrorSeverity): void;
}

/**
 * Handles the content of P2P messages received over gossip and request/response: validation against
 * node state (world state, archiver, mempools), persistence into the mempools, and dispatch to the
 * consensus callbacks. This is the part of the P2P stack that depends on main-thread node state, as
 * opposed to the libp2p networking machinery in {@link LibP2PService}.
 */
export class P2PMessageProcessor extends WithTracer {
  // Message validators
  private blockProposalValidator: BlockProposalValidator;
  private checkpointProposalValidator: CheckpointProposalValidator;
  private checkpointAttestationValidator: CheckpointAttestationValidator;

  /** Callback invoked when a duplicate proposal is detected (triggers slashing). */
  private duplicateProposalCallback?: (info: {
    slot: SlotNumber;
    proposer: EthAddress;
    type: 'checkpoint' | 'block';
  }) => void;

  /** Callback invoked when a duplicate attestation is detected (triggers slashing). */
  private duplicateAttestationCallback?: P2PDuplicateAttestationCallback;

  /** Callback invoked when a valid checkpoint attestation is accepted into the pool. */
  private checkpointAttestationCallback?: P2PCheckpointAttestationCallback;

  /**
   * Callback for when a block is received from a peer.
   * @param block - The block received from the peer.
   * @returns The attestation for the block, if any.
   */
  private blockReceivedCallback: P2PBlockReceivedCallback;

  /**
   * Callback for when a checkpoint proposal is received from a peer.
   * @param checkpoint - The checkpoint proposal received from the peer.
   * @returns The attestations for the checkpoint, if any.
   */
  private allNodesCheckpointReceivedCallback: P2PCheckpointReceivedCallback;
  /**
   * Callback for when a checkpoint proposal is received - specifically for validators - from a peer.
   * @param checkpoint - The checkpoint proposal received from the peer.
   * @returns The attestations for the checkpoint, if any.
   */
  private validatorCheckpointReceivedCallback: P2PCheckpointReceivedCallback;

  protected logger: Logger;

  private network?: P2PNetwork;

  constructor(
    private config: P2PConfig,
    protected mempools: MemPools,
    protected archiver: L2BlockSource & ContractDataSource,
    private epochCache: EpochCacheInterface,
    private proofVerifier: ClientProtocolCircuitVerifier,
    private worldStateSynchronizer: WorldStateSynchronizer,
    private blockMinFeesProvider: BlockMinFeesProvider,
    telemetry: TelemetryClient,
    logger: Logger = createLogger('p2p:libp2p_service'),
    private txValidationCache?: TxValidationCache,
  ) {
    super(telemetry, 'P2PMessageProcessor');

    // Create child logger with fisherman prefix if in fisherman mode
    this.logger = config.fishermanMode ? logger.createChild('[FISHERMAN]') : logger;

    const p2pPropagationTime = config.attestationPropagationTime;
    const proposalValidatorOpts = {
      txsPermitted: !config.disableTransactions,
      maxTxsPerBlock: config.validateMaxTxsPerBlock ?? config.validateMaxTxsPerCheckpoint,
      maxBlocksPerCheckpoint: config.maxBlocksPerCheckpoint,
      p2pPropagationTime,
      skipSlotValidation: config.skipProposalSlotValidation,
      signatureContext: {
        chainId: config.l1ChainId,
        rollupAddress: config.rollupAddress,
      },
    };
    this.blockProposalValidator = new BlockProposalValidator(epochCache, proposalValidatorOpts);
    this.checkpointProposalValidator = new CheckpointProposalValidator(epochCache, proposalValidatorOpts);
    const attestationValidatorOpts = {
      l1PublishingTime: config.l1PublishingTime,
      p2pPropagationTime,
      signatureContext: proposalValidatorOpts.signatureContext,
    };
    this.checkpointAttestationValidator = config.fishermanMode
      ? new FishermanAttestationValidator(epochCache, mempools.attestationPool, telemetry, attestationValidatorOpts)
      : new CheckpointAttestationValidator(epochCache, attestationValidatorOpts);

    this.blockReceivedCallback = async (block: BlockProposal): Promise<boolean> => {
      this.logger.warn(
        `Handler for block received not yet registered on P2P service. Received block ${block.blockNumber} for slot ${block.slotNumber} from peer.`,
        { p2pMessageIdentifier: await block.p2pMessageLoggingIdentifier() },
      );
      return true;
    };

    this.allNodesCheckpointReceivedCallback = (
      _checkpoint: CheckpointProposalCore,
    ): Promise<CheckpointAttestation[] | undefined> => {
      throw new CheckpointProposalReceivedCallbackNotRegisteredError();
    };

    this.validatorCheckpointReceivedCallback = (
      _checkpoint: CheckpointProposalCore,
    ): Promise<CheckpointAttestation[] | undefined> => {
      return Promise.resolve(undefined);
    };
  }

  /** Wires up the libp2p network operations the processor invokes. Called once during construction of the service. */
  public setNetwork(network: P2PNetwork): void {
    this.network = network;
  }

  private get net(): P2PNetwork {
    if (!this.network) {
      throw new Error('P2PMessageProcessor network not set');
    }
    return this.network;
  }

  public registerBlockReceivedCallback(callback: P2PBlockReceivedCallback) {
    this.blockReceivedCallback = callback;
  }

  public registerValidatorCheckpointReceivedCallback(callback: P2PCheckpointReceivedCallback) {
    this.validatorCheckpointReceivedCallback = callback;
  }

  public registerAllNodesCheckpointReceivedCallback(callback: P2PCheckpointReceivedCallback) {
    this.allNodesCheckpointReceivedCallback = callback;
  }

  /**
   * Registers a callback to be invoked when a duplicate proposal is detected.
   * This callback is triggered on the first duplicate (when count goes from 1 to 2).
   */
  public registerDuplicateProposalCallback(
    callback: (info: { slot: SlotNumber; proposer: EthAddress; type: 'checkpoint' | 'block' }) => void,
  ): void {
    this.duplicateProposalCallback = callback;
  }

  /**
   * Registers a callback to be invoked when a duplicate attestation is detected.
   * A validator signing attestations for different proposals at the same slot.
   * This callback is triggered on the first duplicate (when count goes from 1 to 2).
   */
  public registerDuplicateAttestationCallback(callback: P2PDuplicateAttestationCallback): void {
    this.duplicateAttestationCallback = callback;
  }

  public registerCheckpointAttestationCallback(callback: P2PCheckpointAttestationCallback): void {
    this.checkpointAttestationCallback = callback;
  }

  /**
   * Validates a gossiped transaction against node state and, if valid, persists it to the tx pool.
   * @returns The gossip validation result, indicating whether to re-broadcast the tx.
   */
  public async validateAndStoreTx(tx: Tx, source: PeerId): Promise<ReceivedMessageValidationResult<Tx>> {
    const currentBlockNumber = await this.archiver.getBlockNumber();
    const { ts: nextSlotTimestamp } = this.epochCache.getEpochAndSlotInNextL1Slot();

    // Stage 1: fast validators (metadata, data, timestamps, double-spend, gas, phases, block header)
    const firstStageValidators = await this.createFirstStageMessageValidators(currentBlockNumber, nextSlotTimestamp);
    const firstStageOutcome = await this.runValidations(tx, firstStageValidators);
    if (!firstStageOutcome.allPassed) {
      const { name } = firstStageOutcome.failure;
      let { severity } = firstStageOutcome.failure;

      // Double spend validator has a special case handler. We perform more detailed examination
      // as to how recently the nullifier was entered into the tree and if the transaction should
      // have 'known' the nullifier existed. This determines the severity of the penalty applied to the peer.
      if (name === 'doubleSpendValidator') {
        const txBlockNumber = BlockNumber(currentBlockNumber + 1);
        severity = await this.handleDoubleSpendFailure(tx, txBlockNumber);
      }

      this.logger.verbose(`Rejecting gossiped tx ${tx.getTxHash().toString()}: stage 1 validation failed`, {
        validator: name,
        severity,
        source: source.toString(),
      });
      return { result: TopicValidatorResult.Reject, severity };
    }

    // Pool pre-check: see if the pool would accept this tx before doing expensive proof verification
    const canAdd = await this.mempools.txPool.canAddPendingTx(tx);
    if (canAdd === 'ignored') {
      this.logger.verbose(`Ignoring gossiped tx ${tx.getTxHash().toString()}: pool pre-check returned ignored`, {
        source: source.toString(),
      });
      return { result: TopicValidatorResult.Ignore, obj: tx };
    }

    // Stage 2: expensive proof verification
    const secondStageValidators = this.createSecondStageMessageValidators();
    const secondStageOutcome = await this.runValidations(tx, secondStageValidators);
    if (!secondStageOutcome.allPassed) {
      const { severity, name } = secondStageOutcome.failure;
      this.logger.verbose(`Rejecting gossiped tx ${tx.getTxHash().toString()}: stage 2 validation failed`, {
        validator: name,
        severity,
        source: source.toString(),
      });
      return { result: TopicValidatorResult.Reject, severity };
    }

    // Pool add: persist the tx
    const txHash = tx.getTxHash();
    const addResult = await this.mempools.txPool.addPendingTxs([tx], { source: 'gossip' });

    const wasAccepted = addResult.accepted.some(h => h.equals(txHash));
    const wasIgnored = addResult.ignored.some(h => h.equals(txHash));

    this.logger.verbose(`Validate propagated tx ${txHash.toString()}`, {
      wasAccepted,
      wasIgnored,
      [Attributes.P2P_ID]: source.toString(),
    });

    if (wasAccepted) {
      return { result: TopicValidatorResult.Accept, obj: tx };
    } else if (wasIgnored) {
      return { result: TopicValidatorResult.Ignore, obj: tx };
    } else {
      this.logger.warn(`Gossiped tx ${txHash.toString()} unexpectedly rejected by pool`, {
        source: source.toString(),
        txHash: txHash.toString(),
      });
      return { result: TopicValidatorResult.Reject, severity: PeerErrorSeverity.HighToleranceError };
    }
  }

  /** Validates a checkpoint attestation and adds it to the pool. Penalizes the peer if validation fails. */
  @trackSpan('Libp2pService.validateAndStoreCheckpointAttestation', (_peerId, attestation) => ({
    [Attributes.SLOT_NUMBER]: attestation.payload.header.slotNumber.toString(),
  }))
  public async validateAndStoreCheckpointAttestation(
    peerId: PeerId,
    attestation: CheckpointAttestation,
  ): Promise<ReceivedMessageValidationResult<CheckpointAttestation>> {
    const validationResult = await this.checkpointAttestationValidator.validate(attestation);

    if (validationResult.result === 'reject') {
      this.logger.warn(`Penalizing peer ${peerId} for checkpoint attestation validation failure`);
      return { result: TopicValidatorResult.Reject, severity: validationResult.severity };
    }

    if (validationResult.result === 'ignore') {
      return { result: TopicValidatorResult.Ignore, obj: attestation };
    }

    // Try to add the attestation: this handles existence check, cap check, and adding in one call
    // count is the number of attestations by this signer for this slot (for duplicate detection)
    const slot = attestation.payload.header.slotNumber;
    const { added, alreadyExists, count } =
      await this.mempools.attestationPool.tryAddCheckpointAttestation(attestation);

    this.logger.trace(`Validate propagated checkpoint attestation`, {
      added,
      alreadyExists,
      count,
      [Attributes.SLOT_NUMBER]: slot.toString(),
      [Attributes.P2P_ID]: peerId.toString(),
    });

    // Exact same attestation received, no need to re-broadcast
    if (alreadyExists) {
      return { result: TopicValidatorResult.Ignore, obj: attestation };
    }

    // Could not add (cap reached for signer), penalize and do not re-broadcast
    if (!added) {
      this.logger.warn(`Rejecting checkpoint attestation due to cap`, {
        slot: slot.toString(),
        archive: attestation.archive.toString(),
        source: peerId.toString(),
        attester: attestation.getSender()?.toString(),
        count,
      });
      return { result: TopicValidatorResult.Reject, severity: PeerErrorSeverity.HighToleranceError };
    }

    // Check if this is a duplicate attestation (signer attested to a different proposal at the same slot)
    // count is the number of attestations by this signer for this slot
    if (count === 2) {
      const attester = attestation.getSender();
      if (attester) {
        this.logger.warn(`Detected duplicate attestation (equivocation) at slot ${slot}`, {
          slot: slot.toString(),
          archive: attestation.archive.toString(),
          source: peerId.toString(),
          attester: attester.toString(),
        });
        this.duplicateAttestationCallback?.({ slot, attester });
      }
    }

    // Attestation was added successfully - accept it so other nodes can also detect the equivocation
    this.checkpointAttestationCallback?.(attestation);
    return { result: TopicValidatorResult.Accept, obj: attestation };
  }

  /** Validates a block proposal. Triggers a penalization to the peer that sent it if invalid. Adds to the mempool if valid. */
  @trackSpan('Libp2pService.validateAndStoreBlockProposal', (_peerId, block) => ({
    [Attributes.BLOCK_NUMBER]: block.blockNumber.toString(),
    [Attributes.SLOT_NUMBER]: block.slotNumber.toString(),
  }))
  public async validateAndStoreBlockProposal(
    peerId: PeerId,
    block: BlockProposal,
  ): Promise<ReceivedMessageValidationResult<BlockProposal, { isEquivocated: boolean }>> {
    const validationResult = await this.blockProposalValidator.validate(block);

    if (validationResult.result === 'reject') {
      this.logger.warn(`Penalizing peer ${peerId} for block proposal validation failure`);
      return { result: TopicValidatorResult.Reject, severity: validationResult.severity };
    }

    if (validationResult.result === 'ignore') {
      return { result: TopicValidatorResult.Ignore, obj: block };
    }

    // Try to add the proposal: this handles existence check, cap check, and adding in one call
    const { added, alreadyExists, count } = await this.mempools.attestationPool.tryAddBlockProposal(block);
    const isEquivocated = count !== undefined && count > 1;

    // Duplicate proposal received, no need to re-broadcast
    if (alreadyExists) {
      this.logger.debug(`Ignoring duplicate block proposal received`, {
        ...block.toBlockInfo(),
        indexWithinCheckpoint: block.indexWithinCheckpoint,
        proposer: block.getSender()?.toString(),
        source: peerId.toString(),
      });
      return { result: TopicValidatorResult.Ignore, obj: block, metadata: { isEquivocated } };
    }

    // Too many blocks received for this slot and index, penalize peer and do not re-broadcast
    if (!added) {
      this.logger.warn(`Penalizing peer for block proposal exceeding per-position cap`, {
        ...block.toBlockInfo(),
        indexWithinCheckpoint: block.indexWithinCheckpoint,
        count,
        proposer: block.getSender()?.toString(),
        source: peerId.toString(),
      });
      return {
        result: TopicValidatorResult.Reject,
        metadata: { isEquivocated },
        severity: PeerErrorSeverity.HighToleranceError,
      };
    }

    // If this was a duplicate proposal, do not process it, but do invoke the duplicate callback,
    // and do re-broadcast it so other nodes in the network know to slash the proposer
    if (isEquivocated) {
      const proposer = block.getSender();
      this.logger.warn(`Detected duplicate block proposal (equivocation) at slot ${block.slotNumber}`, {
        ...block.toBlockInfo(),
        source: peerId.toString(),
        proposer: proposer?.toString(),
      });
      // Invoke the duplicate callback on the first duplicate spotted only
      if (proposer && count === 2) {
        this.duplicateProposalCallback?.({ slot: block.slotNumber, proposer, type: 'block' });
      }
      return { result: TopicValidatorResult.Accept, obj: block, metadata: { isEquivocated } };
    }

    // Otherwise, we're good to go!
    return { result: TopicValidatorResult.Accept, obj: block };
  }

  // REFACTOR(palla): This method should be moved to the p2p_client or to a separate component,
  // should not be here as it does not deal with p2p networking.
  @trackSpan('Libp2pService.processValidBlockProposal', async block => ({
    [Attributes.SLOT_NUMBER]: block.slotNumber,
    [Attributes.BLOCK_ARCHIVE]: block.archive.toString(),
    [Attributes.P2P_ID]: await block.p2pMessageLoggingIdentifier().then(i => i.toString()),
  }))
  public async processValidBlockProposal(block: BlockProposal, sender: PeerId) {
    const slot = block.slotNumber;
    this.logger.verbose(`Received block proposal for slot ${slot} from external peer ${sender.toString()}.`, {
      p2pMessageIdentifier: await block.p2pMessageLoggingIdentifier(),
      source: sender.toString(),
      ...block.toBlockInfo(),
    });

    // Mark the txs in this proposal as protected
    await this.mempools.txPool.protectTxs(block.txHashes, block.blockHeader);

    // Call the block received callback to validate the proposal.
    // Note: Validators do NOT attest to individual blocks, only to checkpoint proposals.
    const isValid = await this.blockReceivedCallback(block, sender);
    if (!isValid) {
      this.logger.info(`Block proposal validation failed for block ${block.blockNumber}`, block.toBlockInfo());
    }
  }

  /**
   * Validates a checkpoint proposal. Penalizes peer if validation fails. Adds the checkpoint and
   * its last block (if present) to the mempool if valid. Triggers equivocation detection on both.
   */
  @trackSpan('Libp2pService.validateAndStoreCheckpointProposal', (_peerId, checkpoint) => ({
    [Attributes.SLOT_NUMBER]: checkpoint.slotNumber.toString(),
  }))
  public async validateAndStoreCheckpointProposal(
    peerId: PeerId,
    checkpoint: CheckpointProposal,
  ): Promise<ReceivedMessageValidationResult<CheckpointProposal, { isEquivocated: boolean; processBlock: boolean }>> {
    const validationResult = await this.checkpointProposalValidator.validate(checkpoint);

    if (validationResult.result === 'reject') {
      this.logger.warn(`Penalizing peer ${peerId} for checkpoint proposal validation failure`);
      return { result: TopicValidatorResult.Reject, severity: validationResult.severity };
    }

    if (validationResult.result === 'ignore') {
      return { result: TopicValidatorResult.Ignore, obj: checkpoint };
    }

    // Extract and try to add the block proposal first if present
    const blockProposal = checkpoint.getBlockProposal();
    let processBlock = false;
    if (blockProposal) {
      this.logger.debug(`Validating block proposal from propagated checkpoint`, {
        [Attributes.SLOT_NUMBER]: checkpoint.slotNumber.toString(),
        [Attributes.P2P_ID]: peerId.toString(),
      });
      const blockProposalResult = await this.validateAndStoreBlockProposal(peerId, blockProposal);
      const { obj, metadata: { isEquivocated } = {} } = blockProposalResult;
      if (blockProposalResult.result === TopicValidatorResult.Reject || !obj || isEquivocated) {
        this.logger.debug(`Rejecting checkpoint due to invalid last block proposal`, {
          [Attributes.SLOT_NUMBER]: checkpoint.slotNumber.toString(),
          [Attributes.P2P_ID]: peerId.toString(),
          isEquivocated,
          result: blockProposalResult.result,
        });
        return {
          result: TopicValidatorResult.Reject,
          severity:
            'severity' in blockProposalResult ? blockProposalResult.severity : PeerErrorSeverity.MidToleranceError,
        };
      } else if (blockProposalResult.result === TopicValidatorResult.Accept && obj && !isEquivocated) {
        processBlock = true;
      }
    }

    // Try to add the checkpoint proposal core: this handles existence check, cap check, and adding in one call
    const checkpointCore = checkpoint.toCore();
    const tryAddResult = await this.mempools.attestationPool.tryAddCheckpointProposal(checkpointCore);
    const { added, alreadyExists, count } = tryAddResult;
    const isEquivocated = count !== undefined && count > 1;

    // Duplicate proposal received, do not re-broadcast
    if (alreadyExists) {
      this.logger.debug(`Ignoring duplicate checkpoint proposal received`, {
        ...checkpoint.toCheckpointInfo(),
        source: peerId.toString(),
      });
      return {
        result: TopicValidatorResult.Ignore,
        obj: checkpoint,
        metadata: { isEquivocated, processBlock },
      };
    }

    // Too many checkpoint proposals received for this slot, penalize peer and do not re-broadcast
    // Note: We still return the checkpoint obj so the lastBlock can be processed if valid
    if (!added) {
      this.logger.warn(`Penalizing peer for checkpoint proposal exceeding per-slot cap`, {
        ...checkpoint.toCheckpointInfo(),
        count,
        source: peerId.toString(),
      });
      return {
        result: TopicValidatorResult.Reject,
        obj: checkpoint,
        metadata: { isEquivocated, processBlock },
        severity: PeerErrorSeverity.HighToleranceError,
      };
    }

    // If this was a duplicate proposal, do not process it, but do invoke the duplicate callback,
    // and do re-broadcast it so other nodes in the network know to slash the proposer
    if (isEquivocated) {
      const proposer = checkpoint.getSender();
      this.logger.warn(`Detected duplicate checkpoint proposal (equivocation) at slot ${checkpoint.slotNumber}`, {
        ...checkpoint.toCheckpointInfo(),
        source: peerId.toString(),
        proposer: proposer?.toString(),
      });
      // Invoke the duplicate callback on the first duplicate spotted only
      if (proposer && count === 2) {
        this.duplicateProposalCallback?.({ slot: checkpoint.slotNumber, proposer, type: 'checkpoint' });
      }
      return {
        result: TopicValidatorResult.Accept,
        obj: checkpoint,
        metadata: { isEquivocated, processBlock },
      };
    }

    // Otherwise, we're good to go!
    return { result: TopicValidatorResult.Accept, obj: checkpoint, metadata: { processBlock, isEquivocated } };
  }

  /**
   * Process a validated checkpoint proposal.
   * Note: The proposal was already added to the pool by tryAddCheckpointProposal in handleGossipedCheckpointProposal.
   */
  @trackSpan('Libp2pService.processValidCheckpointProposal', async checkpoint => ({
    [Attributes.SLOT_NUMBER]: checkpoint.slotNumber,
    [Attributes.BLOCK_ARCHIVE]: checkpoint.archive.toString(),
    [Attributes.P2P_ID]: await checkpoint.p2pMessageLoggingIdentifier().then(i => i.toString()),
  }))
  public async processValidCheckpointProposal(checkpoint: CheckpointProposalCore, sender: PeerId) {
    const slot = checkpoint.slotNumber;
    this.logger.verbose(`Received checkpoint proposal for slot ${slot} from external peer ${sender.toString()}.`, {
      p2pMessageIdentifier: await checkpoint.p2pMessageLoggingIdentifier(),
      slot: checkpoint.slotNumber,
      archive: checkpoint.archive.toString(),
      source: sender.toString(),
    });

    await this.allNodesCheckpointReceivedCallback(checkpoint, sender);

    // Call the checkpoint received callback with the core version (without lastBlock)
    // to validate and potentially generate attestations
    const attestations = await this.validatorCheckpointReceivedCallback(checkpoint, sender);
    if (attestations && attestations.length > 0) {
      // If the callback returned attestations, add them to the pool and propagate them
      await this.mempools.attestationPool.addOwnCheckpointAttestations(attestations);
      for (const attestation of attestations) {
        await this.net.propagate(attestation);
      }
    }
  }

  /**
   * Validate the requested block transactions request-response consistency.
   * It does NOT validate the transactions themselves.
   * @param request - The block transactions request.
   * @param response - The block transactions response.
   * @param peerId - The ID of the peer that made the request.
   * @returns True if the request-response is consistent, false otherwise.
   */
  @trackSpan('Libp2pService.validateRequestedBlockTxsConsistency', request => ({
    [Attributes.BLOCK_ARCHIVE]: request.archiveRoot.toString(),
  }))
  public async validateRequestedBlockTxsConsistency(
    request: BlockTxsRequest,
    response: BlockTxsResponse,
    peerId: PeerId,
  ): Promise<boolean> {
    try {
      // A response with archiveRoot=Fr.zero is the documented "I don't have the block" signal from
      // reqRespBlockTxsHandler (block_txs_handler.ts:54-58): the peer lacked the block in its
      // attestation pool and archiver, but matched the requested hashes against its tx pool and
      // shipped what it found. This is legitimate behaviour, not misbehaviour — we just can't verify
      // membership/order without the block, so we drop the response without penalising the peer.
      if (response.archiveRoot.isZero()) {
        this.logger.debug(`Peer ${peerId.toString()} signalled missing block with Fr.zero archive root`);
        return false;
      }

      if (!response.archiveRoot.equals(request.archiveRoot)) {
        this.net.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
        throw new ValidationError(
          `Received block txs for unexpected archive root: expected ${request.archiveRoot.toString()}, got ${response.archiveRoot.toString()}`,
        );
      }

      if (response.txIndices.getLength() !== request.txIndices.getLength()) {
        this.net.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
        throw new ValidationError(
          `Received block txs with mismatched bitvector length: expected ${request.txIndices.getLength()}, got ${response.txIndices.getLength()}`,
        );
      }

      // Check no duplicates and not exceeding returnable count
      const requestedIndices = new Set(request.txIndices.getTrueIndices());
      const availableIndices = new Set(response.txIndices.getTrueIndices());
      const maxReturnable = [...requestedIndices].filter(i => availableIndices.has(i)).length;

      const returnedHashes = await Promise.all(response.txs.map(tx => tx.getTxHash().toString()));
      const uniqueReturned = new Set(returnedHashes.map(h => h.toString()));
      if (uniqueReturned.size !== returnedHashes.length) {
        this.net.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
        throw new ValidationError(`Received duplicate txs in block txs response`);
      }
      if (response.txs.length > maxReturnable) {
        this.net.penalizePeer(peerId, PeerErrorSeverity.MidToleranceError);
        throw new ValidationError(
          `Received more txs (${response.txs.length}) than requested-and-available (${maxReturnable})`,
        );
      }

      // To verify membership/order of the returned txs we need the canonical tx hash list for the
      // block. Prefer the block proposal (held while a block is in flight), but fall back to the
      // archiver for blocks we only know as mined — e.g. a prover collecting txs to prove a block it
      // never received a proposal for. This mirrors the responder side (reqRespBlockTxsHandler),
      // which serves from proposal-or-archiver.
      const proposal = await this.mempools.attestationPool.getBlockProposalByArchive(request.archiveRoot.toString());
      const blockTxHashes =
        proposal?.txHashes ??
        (await this.archiver.getBlock({ archive: request.archiveRoot }))?.body.txEffects.map(e => e.txHash);

      if (blockTxHashes) {
        // Build intersected indices
        const intersectIdx = request.txIndices.getTrueIndices().filter(i => response.txIndices.isSet(i));

        // Enforce subset membership and preserve increasing order by index.
        const hashToIndexInBlock = new Map<string, number>(
          blockTxHashes.map((h, i) => [h.toString(), i] as [string, number]),
        );
        const allowedIndexSet = new Set(intersectIdx);
        const indices = returnedHashes.map(h => hashToIndexInBlock.get(h));
        const allAllowed = indices.every(idx => idx !== undefined && allowedIndexSet.has(idx));
        const strictlyIncreasing = indices.every((idx, i) => (i === 0 ? idx !== undefined : idx! > indices[i - 1]!));
        if (!allAllowed || !strictlyIncreasing) {
          this.net.penalizePeer(peerId, PeerErrorSeverity.LowToleranceError);
          throw new ValidationError('Returned txs do not match expected subset/order for requested indices');
        }
      } else {
        // Neither a local proposal nor an archived block: we cannot verify membership/order of the
        // returned txs. This is a local-state gap, not a peer fault, so we do not penalize.
        this.logger.warn(
          `Block ${request.archiveRoot.toString()} not found in attestation pool or archiver; cannot validate membership/order of returned txs`,
        );
        return false;
      }

      return true;
    } catch (e: any) {
      if (e instanceof ValidationError) {
        this.logger.warn(`Failed validation for requested block txs from peer ${peerId.toString()}`);
      } else {
        this.logger.error(`Error during validation of requested block txs`, e);
      }

      return false;
    }
  }

  public async validateTxsReceivedInBlockProposal(txs: Tx[]): Promise<void> {
    const validator = createTxValidatorForBlockProposalReceivedTxs(
      this.proofVerifier,
      { l1ChainId: this.config.l1ChainId, rollupVersion: this.config.rollupVersion },
      this.logger.getBindings(),
      this.txValidationCache,
    );

    const results = await Promise.all(
      txs.map(async tx => {
        const result = await validator.validateTx(tx);
        return result.result !== 'invalid';
      }),
    );
    if (results.some(value => value === false)) {
      throw new Error('Invalid tx detected');
    }
  }

  /** Builds the request/response sub-protocol handlers that serve data from node state (status, tx, block txs). */
  public createReqRespDataHandlers(protocolVersion: string): Partial<ReqRespSubProtocolHandlers> {
    const handlers: Partial<ReqRespSubProtocolHandlers> = {
      [ReqRespSubProtocol.STATUS]: reqRespStatusHandler(protocolVersion, this.worldStateSynchronizer, this.logger),
    };

    if (!this.config.disableTransactions) {
      handlers[ReqRespSubProtocol.BLOCK_TXS] = reqRespBlockTxsHandler(
        this.mempools.attestationPool,
        this.archiver,
        this.mempools.txPool,
      );
      handlers[ReqRespSubProtocol.TX] = reqRespTxHandler(this.mempools);
    }

    return handlers;
  }

  /** Returns the tx validator configuration used by the batch tx requester. */
  public getBatchTxValidatorConfig(): BatchRequestTxValidatorConfig {
    return {
      l1ChainId: this.config.l1ChainId,
      rollupVersion: this.config.rollupVersion,
      proofVerifier: this.proofVerifier,
      txValidationCache: this.txValidationCache,
    };
  }

  private getGasFees(): Promise<GasFees> {
    return this.blockMinFeesProvider.getCurrentMinFees();
  }

  /** Creates the first stage (fast) validators for gossiped transactions. */
  protected async createFirstStageMessageValidators(
    currentBlockNumber: BlockNumber,
    nextSlotTimestamp: UInt64,
  ): Promise<Record<string, TransactionValidator>> {
    const gasFees = await this.getGasFees();
    const allowedInSetup = [
      ...(await getDefaultAllowedSetupFunctions()),
      ...(this.config.txPublicSetupAllowListExtend ?? []),
    ];
    const blockNumber = BlockNumber(currentBlockNumber + 1);
    const l1Constants = await this.archiver.getL1Constants();

    return createFirstStageTxValidationsForGossipedTransactions(
      nextSlotTimestamp,
      blockNumber,
      this.worldStateSynchronizer,
      gasFees,
      this.config.l1ChainId,
      this.config.rollupVersion,
      protocolContractsHash,
      this.archiver,
      !this.config.disableTransactions,
      allowedInSetup,
      this.logger.getBindings(),
      {
        rollupManaLimit: l1Constants.rollupManaLimit,
        maxBlockL2Gas: this.config.validateMaxL2BlockGas,
        maxBlockDAGas: this.config.validateMaxDABlockGas,
      },
    );
  }

  /** Creates the second stage (expensive proof verification) validators for gossiped transactions. */
  protected createSecondStageMessageValidators(): Record<string, TransactionValidator> {
    return createSecondStageTxValidationsForGossipedTransactions(this.proofVerifier, this.logger.getBindings());
  }

  /**
   * Run validations on a tx.
   * @param tx - The tx to validate.
   * @param messageValidators - The message validators to run.
   * @returns The validation outcome.
   */
  private async runValidations(
    tx: Tx,
    messageValidators: Record<string, TransactionValidator>,
  ): Promise<ValidationOutcome> {
    const validationPromises = Object.entries(messageValidators).map(async ([name, { validator, severity }]) => {
      const { result } = await validator.validateTx(tx);
      return { name, isValid: result !== 'invalid', severity };
    });

    // A promise that resolves when all validations have been run
    const allValidations = await Promise.all(validationPromises);
    const failures = allValidations.filter(x => !x.isValid);
    if (failures.length > 0) {
      // Pick the most severe failure (lowest tolerance = harshest penalty)
      const failed = maxBy(failures, f => PeerErrorSeverityByHarshness.indexOf(f.severity))!;
      return {
        allPassed: false,
        failure: {
          isValid: { result: 'invalid' as const, reason: ['Failed validation'] },
          name: failed.name,
          severity: failed.severity,
        },
      };
    } else {
      return {
        allPassed: true,
      };
    }
  }

  /**
   * Handle a double spend failure.
   *
   * Double spend failures are managed on their own because they are a special case.
   * We must check if the double spend is recent or old, if it is past a threshold, then we heavily penalize the peer.
   *
   * @param tx - The tx that failed the double spend validator.
   * @param blockNumber - The block number of the tx.
   * @param peerId - The peer ID of the peer that sent the tx.
   * @returns Severity
   */
  private async handleDoubleSpendFailure(tx: Tx, blockNumber: BlockNumber): Promise<PeerErrorSeverity> {
    if (blockNumber <= this.config.doubleSpendSeverePeerPenaltyWindow) {
      return PeerErrorSeverity.HighToleranceError;
    }

    const snapshotValidator = new DoubleSpendTxValidator(
      {
        nullifiersExist: async (nullifiers: Buffer[]) => {
          const merkleTree = this.worldStateSynchronizer.getSnapshot(
            BlockNumber(blockNumber - this.config.doubleSpendSeverePeerPenaltyWindow),
          );
          const indices = await merkleTree.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, nullifiers);
          return indices.map(index => index !== undefined);
        },
      },
      this.logger.getBindings(),
    );

    const validSnapshot = await snapshotValidator.validateTx(tx);
    if (validSnapshot.result !== 'valid') {
      return PeerErrorSeverity.LowToleranceError;
    }

    return PeerErrorSeverity.HighToleranceError;
  }
}
