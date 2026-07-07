import type { Logger } from '@aztec/foundation/log';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  CheckpointProposalCore,
  Gossipable,
} from '@aztec/stdlib/p2p';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { Attributes, type TelemetryClient, type Tracer, trackSpan } from '@aztec/telemetry-client';

import { type PeerId, TopicValidatorResult } from '@libp2p/interface';

import { CheckpointProposalReceivedCallbackNotRegisteredError } from '../../errors/p2p-service.error.js';
import type { MemPools } from '../../mem_pools/interface.js';
import type {
  BlockProposalValidator,
  CheckpointAttestationValidator,
  CheckpointProposalValidator,
} from '../../msg_validators/index.js';
import type { P2PProposalHandler, P2PServiceEvents } from '../service.js';

// REFACTOR: Unify with ValidationOutcome in libp2p_service.ts
export type ReceivedMessageValidationResult<T, M = undefined> =
  | { obj: T; result: Exclude<TopicValidatorResult, TopicValidatorResult.Reject>; metadata?: M }
  | { obj?: T; result: TopicValidatorResult.Reject; metadata?: M; severity: PeerErrorSeverity };

/** The message validators used by the gossip message processor. */
export interface GossipMessageValidators {
  blockProposal: BlockProposalValidator;
  checkpointProposal: CheckpointProposalValidator;
  checkpointAttestation: CheckpointAttestationValidator;
}

/** The subset of the p2p service the gossip message processor calls back into. */
export interface GossipMessageHost {
  propagate<T extends Gossipable>(message: T): Promise<void>;
}

/**
 * Domain-side processing of gossiped consensus messages (block proposals, checkpoint proposals, and
 * checkpoint attestations): validation, mempool storage, equivocation detection, and invocation of
 * the proposal handler fulfilled by the validator client. Called inline from LibP2PService's gossip
 * topic validators, which stay in the transport layer since gossipsub requires an Accept/Reject/Ignore
 * verdict within the message-cache window.
 */
export class GossipMessageProcessor {
  public readonly tracer: Tracer;

  /** Handler invoked on block and checkpoint proposals received from peers. */
  private proposalHandler: P2PProposalHandler;

  constructor(
    private readonly mempools: MemPools,
    private readonly validators: GossipMessageValidators,
    private readonly events: TypedEventEmitter<P2PServiceEvents>,
    private readonly host: GossipMessageHost,
    telemetry: TelemetryClient,
    private readonly logger: Logger,
  ) {
    this.tracer = telemetry.getTracer('GossipMessageProcessor');

    this.proposalHandler = {
      onBlockProposal: async (block: BlockProposal): Promise<boolean> => {
        this.logger.warn(
          `Handler for block received not yet registered on P2P service. Received block ${block.blockNumber} for slot ${block.slotNumber} from peer.`,
          { p2pMessageIdentifier: await block.p2pMessageLoggingIdentifier() },
        );
        return true;
      },
      onAllNodesCheckpointProposal: (
        _checkpoint: CheckpointProposalCore,
      ): Promise<CheckpointAttestation[] | undefined> => {
        throw new CheckpointProposalReceivedCallbackNotRegisteredError();
      },
      onValidatorCheckpointProposal: (
        _checkpoint: CheckpointProposalCore,
      ): Promise<CheckpointAttestation[] | undefined> => {
        return Promise.resolve(undefined);
      },
    };
  }

  /** Merges the provided handlers over the current ones. */
  public setProposalHandler(handler: Partial<P2PProposalHandler>): void {
    this.proposalHandler = { ...this.proposalHandler, ...handler };
  }

  /** Validates a checkpoint attestation and adds it to the pool. Penalizes the peer if validation fails. */
  @trackSpan('Libp2pService.validateAndStoreCheckpointAttestation', (_peerId, attestation) => ({
    [Attributes.SLOT_NUMBER]: attestation.payload.header.slotNumber.toString(),
  }))
  public async validateAndStoreCheckpointAttestation(
    peerId: PeerId,
    attestation: CheckpointAttestation,
  ): Promise<ReceivedMessageValidationResult<CheckpointAttestation>> {
    const validationResult = await this.validators.checkpointAttestation.validate(attestation);

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
        this.events.emit('duplicateAttestation', { slot, attester });
      }
    }

    // Attestation was added successfully - accept it so other nodes can also detect the equivocation
    this.events.emit('checkpointAttestation', attestation);
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
    const validationResult = await this.validators.blockProposal.validate(block);

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
        this.events.emit('duplicateProposal', { slot: block.slotNumber, proposer, type: 'block' });
      }
      return { result: TopicValidatorResult.Accept, obj: block, metadata: { isEquivocated } };
    }

    // Otherwise, we're good to go!
    return { result: TopicValidatorResult.Accept, obj: block };
  }

  /** Marks the proposal txs as protected and invokes the block proposal handler. */
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
    const isValid = await this.proposalHandler.onBlockProposal(block, sender);
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
    const validationResult = await this.validators.checkpointProposal.validate(checkpoint);

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
        this.events.emit('duplicateProposal', { slot: checkpoint.slotNumber, proposer, type: 'checkpoint' });
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

    await this.proposalHandler.onAllNodesCheckpointProposal(checkpoint, sender);

    // Call the checkpoint received callback with the core version (without lastBlock)
    // to validate and potentially generate attestations
    const attestations = await this.proposalHandler.onValidatorCheckpointProposal(checkpoint, sender);
    if (attestations && attestations.length > 0) {
      // If the callback returned attestations, add them to the pool and propagate them
      await this.mempools.attestationPool.addOwnCheckpointAttestations(attestations);
      for (const attestation of attestations) {
        await this.host.propagate(attestation);
      }
    }
  }
}
