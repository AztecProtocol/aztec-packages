import type { BlobClientInterface } from '@aztec/blob-client/client';
import { type Blob, getBlobsPerL1Block } from '@aztec/blob-lib';
import type { EpochCache } from '@aztec/epoch-cache';
import { CheckpointNumber, EpochNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';
import { type LogData, type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import type { DuplicateAttestationInfo, DuplicateProposalInfo, P2P, PeerId } from '@aztec/p2p';
import { AuthRequest, AuthResponse, BlockProposalValidator, ReqRespSubProtocol } from '@aztec/p2p';
import { OffenseType, WANT_TO_SLASH_EVENT, type Watcher, type WatcherEmitter } from '@aztec/slasher';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CommitteeAttestationsAndSigners, L2BlockSink, L2BlockSource } from '@aztec/stdlib/block';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import type {
  ITxProvider,
  Validator,
  ValidatorClientFullConfig,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import {
  type BlockProposal,
  type BlockProposalOptions,
  type CheckpointAttestation,
  CheckpointProposal,
  type CheckpointProposalCore,
  type CheckpointProposalOptions,
} from '@aztec/stdlib/p2p';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { BlockHeader, Tx } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';
import {
  createHASigner,
  createLocalSignerWithProtection,
  createSignerFromSharedDb,
} from '@aztec/validator-ha-signer/factory';
import { DutyType, type SigningContext, type SlashingProtectionDatabase } from '@aztec/validator-ha-signer/types';
import type { ValidatorHASigner } from '@aztec/validator-ha-signer/validator-ha-signer';

import { EventEmitter } from 'events';
import type { TypedDataDefinition } from 'viem';

import type { FullNodeCheckpointsBuilder } from './checkpoint_builder.js';
import { ValidationService } from './duties/validation_service.js';
import { HAKeyStore } from './key_store/ha_key_store.js';
import type { ExtendedValidatorKeyStore } from './key_store/interface.js';
import { NodeKeystoreAdapter } from './key_store/node_keystore_adapter.js';
import { ValidatorMetrics } from './metrics.js';
import { type BlockProposalValidationFailureReason, ProposalHandler } from './proposal_handler.js';

// We maintain a set of proposers who have proposed invalid blocks.
// Just cap the set to avoid unbounded growth.
const MAX_PROPOSERS_OF_INVALID_BLOCKS = 1000;

// What errors from the block proposal handler result in slashing
const SLASHABLE_BLOCK_PROPOSAL_VALIDATION_RESULT: BlockProposalValidationFailureReason[] = [
  'state_mismatch',
  'failed_txs',
];

/**
 * Validator Client
 */
export class ValidatorClient extends (EventEmitter as new () => WatcherEmitter) implements Validator, Watcher {
  public readonly tracer: Tracer;
  private validationService: ValidationService;
  private metrics: ValidatorMetrics;
  private log: Logger;
  // Whether it has already registered handlers on the p2p client
  private hasRegisteredHandlers = false;

  /** Tracks the last block proposal we created, to detect duplicate proposal attempts. */
  private lastProposedBlock?: BlockProposal;

  /** Tracks the last checkpoint proposal we created. */
  private lastProposedCheckpoint?: CheckpointProposal;

  private lastEpochForCommitteeUpdateLoop: EpochNumber | undefined;
  private epochCacheUpdateLoop: RunningPromise;
  /** Tracks the last epoch in which each attester successfully submitted at least one attestation. */
  private lastAttestedEpochByAttester: Map<string, EpochNumber> = new Map();

  private proposersOfInvalidBlocks: Set<string> = new Set();

  /** Tracks the last checkpoint proposal we attested to, to prevent equivocation. */
  private lastAttestedProposal?: CheckpointProposalCore;

  protected constructor(
    private keyStore: ExtendedValidatorKeyStore,
    private epochCache: EpochCache,
    private p2pClient: P2P,
    private proposalHandler: ProposalHandler,
    private blockSource: L2BlockSource,
    private checkpointsBuilder: FullNodeCheckpointsBuilder,
    private worldState: WorldStateSynchronizer,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private config: ValidatorClientFullConfig,
    private blobClient: BlobClientInterface,
    private slashingProtectionSigner: ValidatorHASigner,
    private dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    log = createLogger('validator'),
  ) {
    super();

    // Create child logger with fisherman prefix if in fisherman mode
    this.log = config.fishermanMode ? log.createChild('[FISHERMAN]') : log;

    this.tracer = telemetry.getTracer('Validator');
    this.metrics = new ValidatorMetrics(telemetry);

    this.validationService = new ValidationService(keyStore, this.log.createChild('validation-service'));

    // Refresh epoch cache every second to trigger alert if participation in committee changes
    this.epochCacheUpdateLoop = new RunningPromise(this.handleEpochCommitteeUpdate.bind(this), this.log, 1000);

    const myAddresses = this.getValidatorAddresses();
    this.log.verbose(`Initialized validator with addresses: ${myAddresses.map(a => a.toString()).join(', ')}`);
  }

  public static validateKeyStoreConfiguration(keyStoreManager: KeystoreManager, logger?: Logger) {
    const validatorKeyStore = NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager);
    const validatorAddresses = validatorKeyStore.getAddresses();
    // Verify that we can retrieve all required data from the key store
    for (const address of validatorAddresses) {
      // Functions throw if required data is not available
      let coinbase: EthAddress;
      let feeRecipient: AztecAddress;
      try {
        coinbase = validatorKeyStore.getCoinbaseAddress(address);
        feeRecipient = validatorKeyStore.getFeeRecipient(address);
      } catch (error) {
        throw new Error(`Failed to retrieve required data for validator address ${address}, error: ${error}`);
      }

      const publisherAddresses = validatorKeyStore.getPublisherAddresses(address);
      if (!publisherAddresses.length) {
        throw new Error(`No publisher addresses found for validator address ${address}`);
      }
      logger?.debug(
        `Validator ${address.toString()} configured with coinbase ${coinbase.toString()}, feeRecipient ${feeRecipient.toString()} and publishers ${publisherAddresses.map(x => x.toString()).join()}`,
      );
    }
  }

  private async handleEpochCommitteeUpdate() {
    try {
      const { committee, epoch } = await this.epochCache.getCommittee('next');
      if (!committee) {
        this.log.trace(`No committee found for slot`);
        return;
      }
      this.metrics.setCurrentEpoch(epoch);
      if (epoch !== this.lastEpochForCommitteeUpdateLoop) {
        const me = this.getValidatorAddresses();
        const committeeSet = new Set(committee.map(v => v.toString()));
        const inCommittee = me.filter(a => committeeSet.has(a.toString()));
        if (inCommittee.length > 0) {
          this.log.info(
            `Validators ${inCommittee.map(a => a.toString()).join(',')} are on the validator committee for epoch ${epoch}`,
          );
        } else {
          this.log.verbose(
            `Validators ${me.map(a => a.toString()).join(', ')} are not on the validator committee for epoch ${epoch}`,
          );
        }
        this.lastEpochForCommitteeUpdateLoop = epoch;
      }
    } catch (err) {
      this.log.error(`Error updating epoch committee`, err);
    }
  }

  static async new(
    config: ValidatorClientFullConfig,
    checkpointsBuilder: FullNodeCheckpointsBuilder,
    worldState: WorldStateSynchronizer,
    epochCache: EpochCache,
    p2pClient: P2P,
    blockSource: L2BlockSource & L2BlockSink,
    l1ToL2MessageSource: L1ToL2MessageSource,
    txProvider: ITxProvider,
    keyStoreManager: KeystoreManager,
    blobClient: BlobClientInterface,
    dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    slashingProtectionDb?: SlashingProtectionDatabase,
  ) {
    const metrics = new ValidatorMetrics(telemetry);
    const blockProposalValidator = new BlockProposalValidator(epochCache, {
      txsPermitted: !config.disableTransactions,
      maxTxsPerBlock: config.validateMaxTxsPerBlock,
    });
    const proposalHandler = new ProposalHandler(
      checkpointsBuilder,
      worldState,
      blockSource,
      l1ToL2MessageSource,
      txProvider,
      blockProposalValidator,
      epochCache,
      config,
      blobClient,
      metrics,
      dateProvider,
      telemetry,
      undefined,
    );

    const nodeKeystoreAdapter = NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager);
    let slashingProtectionSigner: ValidatorHASigner;
    if (slashingProtectionDb) {
      // Shared database mode: use a pre-existing database (e.g. for testing HA setups).
      ({ signer: slashingProtectionSigner } = createSignerFromSharedDb(slashingProtectionDb, config, {
        telemetryClient: telemetry,
        dateProvider,
      }));
    } else if (config.haSigningEnabled) {
      // Multi-node HA mode: use PostgreSQL-backed distributed locking.
      // If maxStuckDutiesAgeMs is not explicitly set, compute it from Aztec slot duration
      const haConfig = {
        ...config,
        maxStuckDutiesAgeMs: config.maxStuckDutiesAgeMs ?? epochCache.getL1Constants().slotDuration * 2 * 1000,
      };
      ({ signer: slashingProtectionSigner } = await createHASigner(haConfig, {
        telemetryClient: telemetry,
        dateProvider,
      }));
    } else {
      // Single-node mode: use LMDB-backed local signing protection.
      // This prevents double-signing if the node crashes and restarts mid-proposal.
      ({ signer: slashingProtectionSigner } = await createLocalSignerWithProtection(config, {
        telemetryClient: telemetry,
        dateProvider,
      }));
    }
    const validatorKeyStore: ExtendedValidatorKeyStore = new HAKeyStore(nodeKeystoreAdapter, slashingProtectionSigner);

    const validator = new ValidatorClient(
      validatorKeyStore,
      epochCache,
      p2pClient,
      proposalHandler,
      blockSource,
      checkpointsBuilder,
      worldState,
      l1ToL2MessageSource,
      config,
      blobClient,
      slashingProtectionSigner,
      dateProvider,
      telemetry,
    );

    return validator;
  }

  public getValidatorAddresses() {
    return this.keyStore
      .getAddresses()
      .filter(addr => !this.config.disabledValidators.some(disabled => disabled.equals(addr)));
  }

  public getProposalHandler() {
    return this.proposalHandler;
  }

  public signWithAddress(addr: EthAddress, msg: TypedDataDefinition, context: SigningContext) {
    return this.keyStore.signTypedDataWithAddress(addr, msg, context);
  }

  public getCoinbaseForAttestor(attestor: EthAddress): EthAddress {
    return this.keyStore.getCoinbaseAddress(attestor);
  }

  public getFeeRecipientForAttestor(attestor: EthAddress): AztecAddress {
    return this.keyStore.getFeeRecipient(attestor);
  }

  public getConfig(): ValidatorClientFullConfig {
    return this.config;
  }

  public updateConfig(config: Partial<ValidatorClientFullConfig>) {
    this.config = { ...this.config, ...config };
  }

  public reloadKeystore(newManager: KeystoreManager): void {
    const newAdapter = NodeKeystoreAdapter.fromKeyStoreManager(newManager);
    this.keyStore = new HAKeyStore(newAdapter, this.slashingProtectionSigner);
    this.validationService = new ValidationService(this.keyStore, this.log.createChild('validation-service'));
  }

  public async start() {
    if (this.epochCacheUpdateLoop.isRunning()) {
      this.log.warn(`Validator client already started`);
      return;
    }

    await this.keyStore.start();

    await this.registerHandlers();

    const myAddresses = this.getValidatorAddresses();
    const inCommittee = await this.epochCache.filterInCommittee('now', myAddresses);
    this.log.info(`Started validator with addresses: ${myAddresses.map(a => a.toString()).join(', ')}`);
    if (inCommittee.length > 0) {
      this.log.info(`Addresses in current validator committee: ${inCommittee.map(a => a.toString()).join(', ')}`);
    }
    this.epochCacheUpdateLoop.start();

    return Promise.resolve();
  }

  public async stop() {
    await this.epochCacheUpdateLoop.stop();
    await this.keyStore.stop();
  }

  /** Register handlers on the p2p client */
  public async registerHandlers() {
    if (!this.hasRegisteredHandlers) {
      this.hasRegisteredHandlers = true;
      this.log.debug(`Registering validator handlers for p2p client`);

      // Block proposal handler - validates but does NOT attest (validators only attest to checkpoints)
      const blockHandler = (block: BlockProposal, proposalSender: PeerId): Promise<boolean> =>
        this.validateBlockProposal(block, proposalSender);
      this.p2pClient.registerBlockProposalHandler(blockHandler);

      // Checkpoint proposal handler - validates and creates attestations
      // The checkpoint is received as CheckpointProposalCore since the lastBlock is extracted
      // and processed separately via the block handler above.
      const checkpointHandler = (
        checkpoint: CheckpointProposalCore,
        proposalSender: PeerId,
      ): Promise<CheckpointAttestation[] | undefined> => this.attestToCheckpointProposal(checkpoint, proposalSender);
      this.p2pClient.registerValidatorCheckpointProposalHandler(checkpointHandler);

      // Duplicate proposal handler - triggers slashing for equivocation
      this.p2pClient.registerDuplicateProposalCallback((info: DuplicateProposalInfo) => {
        this.handleDuplicateProposal(info);
      });

      // Duplicate attestation handler - triggers slashing for attestation equivocation
      this.p2pClient.registerDuplicateAttestationCallback((info: DuplicateAttestationInfo) => {
        this.handleDuplicateAttestation(info);
      });

      const myAddresses = this.getValidatorAddresses();
      this.p2pClient.registerThisValidatorAddresses(myAddresses);

      await this.p2pClient.addReqRespSubProtocol(ReqRespSubProtocol.AUTH, this.handleAuthRequest.bind(this));
    }
  }

  /**
   * Validate a block proposal from a peer.
   * Note: Validators do NOT attest to individual blocks - attestations are only for checkpoint proposals.
   * @returns true if the proposal is valid, false otherwise
   */
  async validateBlockProposal(proposal: BlockProposal, proposalSender: PeerId): Promise<boolean> {
    const slotNumber = proposal.slotNumber;

    // Note: During escape hatch, we still want to "validate" proposals for observability,
    // but we intentionally reject them and disable slashing invalid block and attestation flow.
    const escapeHatchOpen = await this.epochCache.isEscapeHatchOpenAtSlot(slotNumber);

    const proposer = proposal.getSender();

    // Reject proposals with invalid signatures
    if (!proposer) {
      this.log.warn(`Received block proposal with invalid signature for slot ${slotNumber}`);
      return false;
    }

    // Log self-proposals from HA peers (same validator key on different nodes)
    if (this.getValidatorAddresses().some(addr => addr.equals(proposer))) {
      this.log.verbose(`Processing block proposal from HA peer for slot ${slotNumber}`, {
        proposer: proposer.toString(),
        slotNumber,
      });
    }

    // Check if we're in the committee (for metrics purposes)
    const inCommittee = await this.epochCache.filterInCommittee(slotNumber, this.getValidatorAddresses());
    const partOfCommittee = inCommittee.length > 0;

    const proposalInfo = { ...proposal.toBlockInfo(), proposer: proposer.toString() };
    this.log.info(`Received block proposal for slot ${slotNumber}`, {
      ...proposalInfo,
      txHashes: proposal.txHashes.map(t => t.toString()),
      fishermanMode: this.config.fishermanMode || false,
    });

    // Reexecute txs if we are part of the committee, or if slashing is enabled, or if we are configured to always reexecute.
    // In fisherman mode, we always reexecute to validate proposals.
    const { slashBroadcastedInvalidBlockPenalty, alwaysReexecuteBlockProposals, fishermanMode } = this.config;
    const shouldReexecute =
      fishermanMode ||
      slashBroadcastedInvalidBlockPenalty > 0n ||
      partOfCommittee ||
      alwaysReexecuteBlockProposals ||
      this.blobClient.canUpload();

    const validationResult = await this.proposalHandler.handleBlockProposal(
      proposal,
      proposalSender,
      !!shouldReexecute && !escapeHatchOpen,
    );

    if (!validationResult.isValid) {
      const reason = validationResult.reason || 'unknown';

      this.log.warn(`Block proposal validation failed: ${reason}`, proposalInfo);

      // Classify failure reason: bad proposal vs node issue
      const badProposalReasons: BlockProposalValidationFailureReason[] = [
        'invalid_proposal',
        'state_mismatch',
        'failed_txs',
        'in_hash_mismatch',
        'parent_block_wrong_slot',
      ];

      if (badProposalReasons.includes(reason as BlockProposalValidationFailureReason)) {
        this.metrics.incFailedAttestationsBadProposal(1, reason, partOfCommittee);
      } else {
        // Node issues so we can't validate
        this.metrics.incFailedAttestationsNodeIssue(1, reason, partOfCommittee);
      }

      // Slash invalid block proposals (can happen even when not in committee)
      if (
        !escapeHatchOpen &&
        validationResult.reason &&
        SLASHABLE_BLOCK_PROPOSAL_VALIDATION_RESULT.includes(validationResult.reason) &&
        slashBroadcastedInvalidBlockPenalty > 0n
      ) {
        this.log.warn(`Slashing proposer for invalid block proposal`, proposalInfo);
        this.slashInvalidBlock(proposal);
      }
      return false;
    }

    this.log.info(`Validated block proposal for slot ${slotNumber}`, {
      ...proposalInfo,
      inCommittee: partOfCommittee,
      fishermanMode: this.config.fishermanMode || false,
      escapeHatchOpen,
    });

    if (escapeHatchOpen) {
      this.log.warn(`Escape hatch open for slot ${slotNumber}, rejecting block proposal`, proposalInfo);
      return false;
    }

    return true;
  }

  /**
   * Validate and attest to a checkpoint proposal from a peer.
   * The proposal is received as CheckpointProposalCore (without lastBlock) since
   * the lastBlock is extracted and processed separately via the block handler.
   * @returns Checkpoint attestations if valid, undefined otherwise
   */
  async attestToCheckpointProposal(
    proposal: CheckpointProposalCore,
    _proposalSender: PeerId,
  ): Promise<CheckpointAttestation[] | undefined> {
    const proposalSlotNumber = proposal.slotNumber;
    const proposer = proposal.getSender();

    // If escape hatch is open for this slot's epoch, do not attest.
    if (await this.epochCache.isEscapeHatchOpenAtSlot(proposalSlotNumber)) {
      this.log.warn(`Escape hatch open for slot ${proposalSlotNumber}, skipping checkpoint attestation handling`);
      return undefined;
    }

    // Ignore proposals from ourselves (may happen in HA setups)
    if (proposer && this.getValidatorAddresses().some(addr => addr.equals(proposer))) {
      this.log.debug(`Ignoring block proposal from self for slot ${proposalSlotNumber}`, {
        proposer: proposer.toString(),
        proposalSlotNumber,
      });
      return undefined;
    }

    // Check that I have any address in the committee where this checkpoint will land before attesting
    const inCommittee = await this.epochCache.filterInCommittee(proposalSlotNumber, this.getValidatorAddresses());
    const partOfCommittee = inCommittee.length > 0;

    const proposalInfo = {
      proposalSlotNumber,
      archive: proposal.archive.toString(),
      proposer: proposer?.toString(),
    };
    this.log.info(`Received checkpoint proposal for slot ${proposalSlotNumber}`, {
      ...proposalInfo,
      fishermanMode: this.config.fishermanMode || false,
    });

    // Validate the checkpoint proposal before attesting (unless skipCheckpointProposalValidation is set).
    // Uses the cached result from the all-nodes callback if available (avoids double validation).
    let checkpointNumber: CheckpointNumber;
    if (this.config.skipCheckpointProposalValidation) {
      this.log.warn(`Skipping checkpoint proposal validation for slot ${proposalSlotNumber}`, proposalInfo);
      checkpointNumber = CheckpointNumber(0);
    } else {
      const validationResult = await this.proposalHandler.handleCheckpointProposal(proposal, proposalInfo);
      if (!validationResult.isValid) {
        this.log.warn(`Checkpoint proposal validation failed: ${validationResult.reason}`, proposalInfo);
        return undefined;
      }
      checkpointNumber = validationResult.checkpointNumber;
    }

    // Check that I have any address in current committee before attesting
    // In fisherman mode, we still create attestations for validation even if not in committee
    if (!partOfCommittee && !this.config.fishermanMode) {
      this.log.verbose(`No validator in the current committee, skipping attestation`, proposalInfo);
      return undefined;
    }

    // Provided all of the above checks pass, we can attest to the proposal
    this.log.info(
      `${partOfCommittee ? 'Attesting to' : 'Validated'} checkpoint proposal for slot ${proposalSlotNumber}`,
      {
        ...proposalInfo,
        inCommittee: partOfCommittee,
        fishermanMode: this.config.fishermanMode || false,
      },
    );

    this.metrics.incSuccessfulAttestations(inCommittee.length);

    // Track epoch participation per attester: count each (attester, epoch) pair at most once
    const proposalEpoch = getEpochAtSlot(proposalSlotNumber, this.epochCache.getL1Constants());
    for (const attester of inCommittee) {
      const key = attester.toString();
      const lastEpoch = this.lastAttestedEpochByAttester.get(key);
      if (lastEpoch === undefined || proposalEpoch > lastEpoch) {
        this.lastAttestedEpochByAttester.set(key, proposalEpoch);
        this.metrics.incAttestedEpochCount(attester);
      }
    }

    // Determine which validators should attest
    let attestors: EthAddress[];
    if (partOfCommittee) {
      attestors = inCommittee;
    } else if (this.config.fishermanMode) {
      // In fisherman mode, create attestations for validation purposes even if not in committee. These won't be broadcast.
      attestors = this.getValidatorAddresses();
    } else {
      attestors = [];
    }

    // Only create attestations if we have attestors
    if (attestors.length === 0) {
      return undefined;
    }

    if (this.config.fishermanMode) {
      // bail out early and don't save attestations to the pool in fisherman mode
      this.log.info(`Creating checkpoint attestations for slot ${proposalSlotNumber}`, {
        ...proposalInfo,
        attestors: attestors.map(a => a.toString()),
      });
      return undefined;
    }

    return await this.createCheckpointAttestationsFromProposal(proposal, attestors, checkpointNumber);
  }

  /**
   * Checks if we should attest to a slot based on equivocation prevention rules.
   * @returns true if we should attest, false if we should skip
   */
  private shouldAttestToSlot(slotNumber: SlotNumber): boolean {
    // If attestToEquivocatedProposals is true, always allow
    if (this.config.attestToEquivocatedProposals) {
      return true;
    }

    // Check if incoming slot is strictly greater than last attested
    if (this.lastAttestedProposal && slotNumber <= this.lastAttestedProposal.slotNumber) {
      this.log.warn(
        `Refusing to process a proposal for slot ${slotNumber} given we already attested to a proposal for slot ${this.lastAttestedProposal.slotNumber}`,
      );
      return false;
    }

    return true;
  }

  private async createCheckpointAttestationsFromProposal(
    proposal: CheckpointProposalCore,
    attestors: EthAddress[] = [],
    checkpointNumber: CheckpointNumber,
  ): Promise<CheckpointAttestation[] | undefined> {
    // Equivocation check: must happen right before signing to minimize the race window
    if (!this.shouldAttestToSlot(proposal.slotNumber)) {
      return undefined;
    }

    const attestations = await this.validationService.attestToCheckpointProposal(proposal, attestors, checkpointNumber);

    // Track the proposal we attested to (to prevent equivocation)
    this.lastAttestedProposal = proposal;

    await this.p2pClient.addOwnCheckpointAttestations(attestations);
    return attestations;
  }

  /**
   * Uploads blobs for a checkpoint to the filestore (fire and forget).
   */
  protected async uploadBlobsForCheckpoint(proposal: CheckpointProposalCore, proposalInfo: LogData): Promise<void> {
    try {
      const lastBlockHeader = await this.blockSource.getBlockHeaderByArchive(proposal.archive);
      if (!lastBlockHeader) {
        this.log.warn(`Failed to get last block header for blob upload`, proposalInfo);
        return;
      }

      const blocks = await this.blockSource.getBlocksForSlot(proposal.slotNumber);
      if (blocks.length === 0) {
        this.log.warn(`No blocks found for blob upload`, proposalInfo);
        return;
      }

      const blobFields = blocks.flatMap(b => b.toBlobFields());
      const blobs: Blob[] = await getBlobsPerL1Block(blobFields);
      await this.blobClient.sendBlobsToFilestore(blobs);
      this.log.debug(`Uploaded ${blobs.length} blobs to filestore for checkpoint at slot ${proposal.slotNumber}`, {
        ...proposalInfo,
        numBlobs: blobs.length,
      });
    } catch (err) {
      this.log.warn(`Failed to upload blobs for checkpoint: ${err}`, proposalInfo);
    }
  }

  private slashInvalidBlock(proposal: BlockProposal) {
    const proposer = proposal.getSender();

    // Skip if signature is invalid (shouldn't happen since we validate earlier)
    if (!proposer) {
      this.log.warn(`Cannot slash proposal with invalid signature`);
      return;
    }

    // Trim the set if it's too big.
    if (this.proposersOfInvalidBlocks.size > MAX_PROPOSERS_OF_INVALID_BLOCKS) {
      // remove oldest proposer. `values` is guaranteed to be in insertion order.
      this.proposersOfInvalidBlocks.delete(this.proposersOfInvalidBlocks.values().next().value!);
    }

    this.proposersOfInvalidBlocks.add(proposer.toString());

    this.emit(WANT_TO_SLASH_EVENT, [
      {
        validator: proposer,
        amount: this.config.slashBroadcastedInvalidBlockPenalty,
        offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
        epochOrSlot: BigInt(proposal.slotNumber),
      },
    ]);
  }

  /**
   * Handle detection of a duplicate proposal (equivocation).
   * Emits a slash event when a proposer sends multiple proposals for the same position.
   */
  private handleDuplicateProposal(info: DuplicateProposalInfo): void {
    const { slot, proposer, type } = info;

    this.log.warn(`Triggering slash event for duplicate ${type} proposal from ${proposer.toString()} at slot ${slot}`, {
      proposer: proposer.toString(),
      slot,
      type,
    });

    // Emit slash event
    this.emit(WANT_TO_SLASH_EVENT, [
      {
        validator: proposer,
        amount: this.config.slashDuplicateProposalPenalty,
        offenseType: OffenseType.DUPLICATE_PROPOSAL,
        epochOrSlot: BigInt(slot),
      },
    ]);
  }

  /**
   * Handle detection of a duplicate attestation (equivocation).
   * Emits a slash event when an attester signs attestations for different proposals at the same slot.
   */
  private handleDuplicateAttestation(info: DuplicateAttestationInfo): void {
    const { slot, attester } = info;

    this.log.warn(`Triggering slash event for duplicate attestation from ${attester.toString()} at slot ${slot}`, {
      attester: attester.toString(),
      slot,
    });

    this.emit(WANT_TO_SLASH_EVENT, [
      {
        validator: attester,
        amount: this.config.slashDuplicateAttestationPenalty,
        offenseType: OffenseType.DUPLICATE_ATTESTATION,
        epochOrSlot: BigInt(slot),
      },
    ]);
  }

  async createBlockProposal(
    blockHeader: BlockHeader,
    checkpointNumber: CheckpointNumber,
    indexWithinCheckpoint: IndexWithinCheckpoint,
    inHash: Fr,
    archive: Fr,
    txs: Tx[],
    proposerAddress: EthAddress | undefined,
    options: BlockProposalOptions = {},
  ): Promise<BlockProposal> {
    // Validate that we're not creating a proposal for an older or equal position
    if (this.lastProposedBlock) {
      const lastSlot = this.lastProposedBlock.slotNumber;
      const lastIndex = this.lastProposedBlock.indexWithinCheckpoint;
      const newSlot = blockHeader.globalVariables.slotNumber;

      if (newSlot < lastSlot || (newSlot === lastSlot && indexWithinCheckpoint <= lastIndex)) {
        throw new Error(
          `Cannot create block proposal for slot ${newSlot} index ${indexWithinCheckpoint}: ` +
            `already proposed block for slot ${lastSlot} index ${lastIndex}`,
        );
      }
    }

    this.log.info(
      `Assembling block proposal for block ${blockHeader.globalVariables.blockNumber} slot ${blockHeader.globalVariables.slotNumber}`,
    );
    const newProposal = await this.validationService.createBlockProposal(
      blockHeader,
      checkpointNumber,
      indexWithinCheckpoint,
      inHash,
      archive,
      txs,
      proposerAddress,
      {
        ...options,
        broadcastInvalidBlockProposal: this.config.broadcastInvalidBlockProposal,
      },
    );
    this.lastProposedBlock = newProposal;
    return newProposal;
  }

  async createCheckpointProposal(
    checkpointHeader: CheckpointHeader,
    archive: Fr,
    checkpointNumber: CheckpointNumber,
    feeAssetPriceModifier: bigint,
    lastBlockProposal: BlockProposal | undefined,
    proposerAddress: EthAddress | undefined,
    options: CheckpointProposalOptions = {},
  ): Promise<CheckpointProposal> {
    // Validate that we're not creating a proposal for an older or equal slot
    if (this.lastProposedCheckpoint) {
      const lastSlot = this.lastProposedCheckpoint.slotNumber;
      const newSlot = checkpointHeader.slotNumber;

      if (newSlot <= lastSlot) {
        throw new Error(
          `Cannot create checkpoint proposal for slot ${newSlot}: ` +
            `already proposed checkpoint for slot ${lastSlot}`,
        );
      }
    }

    this.log.info(`Assembling checkpoint proposal for slot ${checkpointHeader.slotNumber}`);
    const newProposal = await this.validationService.createCheckpointProposal(
      checkpointHeader,
      archive,
      checkpointNumber,
      feeAssetPriceModifier,
      lastBlockProposal,
      proposerAddress,
      options,
    );
    this.lastProposedCheckpoint = newProposal;
    return newProposal;
  }

  async broadcastBlockProposal(proposal: BlockProposal): Promise<void> {
    await this.p2pClient.broadcastProposal(proposal);
  }

  async signAttestationsAndSigners(
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    proposer: EthAddress,
    slot: SlotNumber,
    checkpointNumber: CheckpointNumber,
  ): Promise<Signature> {
    return await this.validationService.signAttestationsAndSigners(
      attestationsAndSigners,
      proposer,
      slot,
      checkpointNumber,
    );
  }

  async collectOwnAttestations(
    proposal: CheckpointProposal,
    checkpointNumber: CheckpointNumber,
  ): Promise<CheckpointAttestation[]> {
    const slot = proposal.slotNumber;
    const inCommittee = await this.epochCache.filterInCommittee(slot, this.getValidatorAddresses());
    this.log.debug(`Collecting ${inCommittee.length} self-attestations for slot ${slot}`, { inCommittee });
    const attestations = await this.createCheckpointAttestationsFromProposal(proposal, inCommittee, checkpointNumber);

    if (!attestations) {
      return [];
    }

    // We broadcast our own attestations to our peers so, in case our block does not get mined on L1,
    // other nodes can see that our validators did attest to this block proposal, and do not slash us
    // due to inactivity for missed attestations.
    void this.p2pClient.broadcastCheckpointAttestations(attestations).catch(err => {
      this.log.error(`Failed to broadcast self-attestations for slot ${slot}`, err);
    });
    return attestations;
  }

  async collectAttestations(
    proposal: CheckpointProposal,
    required: number,
    deadline: Date,
    checkpointNumber: CheckpointNumber,
  ): Promise<CheckpointAttestation[]> {
    // Wait and poll the p2pClient's attestation pool for this checkpoint until we have enough attestations
    const slot = proposal.slotNumber;
    this.log.debug(`Collecting ${required} attestations for slot ${slot} with deadline ${deadline.toISOString()}`);

    if (+deadline < this.dateProvider.now()) {
      this.log.error(
        `Deadline ${deadline.toISOString()} for collecting ${required} attestations for slot ${slot} is in the past`,
      );
      throw new AttestationTimeoutError(0, required, slot);
    }

    await this.collectOwnAttestations(proposal, checkpointNumber);

    const proposalId = proposal.archive.toString();
    const myAddresses = this.getValidatorAddresses();

    let attestations: CheckpointAttestation[] = [];
    while (true) {
      // Filter out attestations with a mismatching archive. This should NOT happen since we have verified
      // the proposer signature (ie our own) before accepting the attestation into the pool via the p2p client.
      const collectedAttestations = (await this.p2pClient.getCheckpointAttestationsForSlot(slot, proposalId)).filter(
        attestation => {
          if (!attestation.archive.equals(proposal.archive)) {
            this.log.warn(
              `Received attestation for slot ${slot} with mismatched archive from ${attestation.getSender()?.toString()}`,
              { attestationArchive: attestation.archive.toString(), proposalArchive: proposal.archive.toString() },
            );
            return false;
          }
          return true;
        },
      );

      // Log new attestations we collected
      const oldSenders = attestations.map(attestation => attestation.getSender());
      for (const collected of collectedAttestations) {
        const collectedSender = collected.getSender();
        // Skip attestations with invalid signatures
        if (!collectedSender) {
          this.log.warn(`Skipping attestation with invalid signature for slot ${slot}`);
          continue;
        }
        if (
          !myAddresses.some(address => address.equals(collectedSender)) &&
          !oldSenders.some(sender => sender?.equals(collectedSender))
        ) {
          this.log.debug(`Received attestation for slot ${slot} from ${collectedSender.toString()}`);
        }
      }
      attestations = collectedAttestations;

      if (attestations.length >= required) {
        this.log.verbose(`Collected all ${required} attestations for slot ${slot}`);
        return attestations;
      }

      if (+deadline < this.dateProvider.now()) {
        this.log.error(`Timeout ${deadline.toISOString()} waiting for ${required} attestations for slot ${slot}`);
        throw new AttestationTimeoutError(attestations.length, required, slot);
      }

      this.log.debug(`Collected ${attestations.length} of ${required} attestations so far`);
      await sleep(this.config.attestationPollingIntervalMs);
    }
  }

  private async handleAuthRequest(peer: PeerId, msg: Buffer): Promise<Buffer> {
    const authRequest = AuthRequest.fromBuffer(msg);
    const statusMessage = await this.p2pClient.handleAuthRequestFromPeer(authRequest, peer).catch(_ => undefined);
    if (statusMessage === undefined) {
      return Buffer.alloc(0);
    }

    // Find a validator address that is in the set
    const allRegisteredValidators = await this.epochCache.getRegisteredValidators();
    const addressToUse = this.getValidatorAddresses().find(
      address => allRegisteredValidators.find(v => v.equals(address)) !== undefined,
    );
    if (addressToUse === undefined) {
      // We don't have a registered address
      return Buffer.alloc(0);
    }

    const payloadToSign = authRequest.getPayloadToSign();
    // AUTH_REQUEST doesn't require HA protection - multiple signatures are safe
    const context: SigningContext = { dutyType: DutyType.AUTH_REQUEST };
    const signature = await this.keyStore.signMessageWithAddress(addressToUse, payloadToSign, context);
    const authResponse = new AuthResponse(statusMessage, signature);
    return authResponse.toBuffer();
  }
}
