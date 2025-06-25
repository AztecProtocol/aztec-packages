import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import type { P2P, PeerId } from '@aztec/p2p';
import { ReqRespSubProtocol, TxCollector } from '@aztec/p2p';
import { BlockProposalValidator } from '@aztec/p2p/msg_validators';
import { computeInHashFromL1ToL2Messages } from '@aztec/prover-client/helpers';
import {
  Offense,
  type SlasherConfig,
  WANT_TO_SLASH_EVENT,
  type WantToSlashArgs,
  type Watcher,
  type WatcherEmitter,
} from '@aztec/slasher/config';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import type { IFullNodeBlockBuilder, ITxCollector, SequencerConfig } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { BlockAttestation, BlockProposal, BlockProposalOptions } from '@aztec/stdlib/p2p';
import { GlobalVariables, type ProposedBlockHeader, type StateReference, type Tx } from '@aztec/stdlib/tx';
import {
  AttestationTimeoutError,
  InvalidValidatorPrivateKeyError,
  ReExFailedTxsError,
  ReExStateMismatchError,
  ReExTimeoutError,
  TransactionsNotAvailableError,
} from '@aztec/stdlib/validators';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';

import type { ValidatorClientConfig } from './config.js';
import { ValidationService } from './duties/validation_service.js';
import type { ValidatorKeyStore } from './key_store/interface.js';
import { LocalKeyStore } from './key_store/local_key_store.js';
import { ValidatorMetrics } from './metrics.js';

// We maintain a set of proposers who have proposed invalid blocks.
// Just cap the set to avoid unbounded growth.
const MAX_PROPOSERS_OF_INVALID_BLOCKS = 1000;

export interface Validator {
  start(): Promise<void>;
  registerBlockProposalHandler(): void;

  // Block validation responsibilities
  createBlockProposal(
    blockNumber: number,
    header: ProposedBlockHeader,
    archive: Fr,
    stateReference: StateReference,
    txs: Tx[],
    proposerAddress: EthAddress | undefined,
    options: BlockProposalOptions,
  ): Promise<BlockProposal | undefined>;
  attestToProposal(proposal: BlockProposal, sender: PeerId): Promise<BlockAttestation[] | undefined>;

  broadcastBlockProposal(proposal: BlockProposal): Promise<void>;
  collectAttestations(proposal: BlockProposal, required: number, deadline: Date): Promise<BlockAttestation[]>;
}

/**
 * Validator Client
 */
export class ValidatorClient extends (EventEmitter as new () => WatcherEmitter) implements Validator, Watcher {
  public readonly tracer: Tracer;
  private validationService: ValidationService;
  private metrics: ValidatorMetrics;

  // Used to check if we are sending the same proposal twice
  private previousProposal?: BlockProposal;

  private myAddresses: EthAddress[];
  private lastEpoch: bigint | undefined;
  private epochCacheUpdateLoop: RunningPromise;

  private blockProposalValidator: BlockProposalValidator;
  private txCollector: ITxCollector;
  private proposersOfInvalidBlocks: Set<EthAddress> = new Set();

  constructor(
    private blockBuilder: IFullNodeBlockBuilder,
    private keyStore: ValidatorKeyStore,
    private epochCache: EpochCache,
    private p2pClient: P2P,
    private blockSource: L2BlockSource,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private config: ValidatorClientConfig &
      Pick<SequencerConfig, 'txPublicSetupAllowList'> &
      Pick<SlasherConfig, 'slashInvalidBlockEnabled' | 'slashInvalidBlockPenalty' | 'slashInvalidBlockMaxPenalty'>,
    private dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('validator'),
  ) {
    super();
    this.tracer = telemetry.getTracer('Validator');
    this.metrics = new ValidatorMetrics(telemetry);

    this.validationService = new ValidationService(keyStore);

    this.blockProposalValidator = new BlockProposalValidator(epochCache);

    this.txCollector = new TxCollector(p2pClient, this.log);

    // Refresh epoch cache every second to trigger alert if participation in committee changes
    this.myAddresses = this.keyStore.getAddresses();
    this.epochCacheUpdateLoop = new RunningPromise(this.handleEpochCommitteeUpdate.bind(this), log, 1000);

    this.log.verbose(`Initialized validator with addresses: ${this.myAddresses.map(a => a.toString()).join(', ')}`);
  }

  private async handleEpochCommitteeUpdate() {
    try {
      const { committee, epoch } = await this.epochCache.getCommittee('now');
      if (!committee) {
        this.log.trace(`No committee found for slot`);
        return;
      }
      if (epoch !== this.lastEpoch) {
        const me = this.myAddresses;
        const committeeSet = new Set(committee.map(v => v.toString()));
        const inCommittee = me.filter(a => committeeSet.has(a.toString()));
        if (inCommittee.length > 0) {
          inCommittee.forEach(a =>
            this.log.info(`Validator ${a.toString()} is on the validator committee for epoch ${epoch}`),
          );
        } else {
          this.log.verbose(
            `Validators ${me.map(a => a.toString()).join(', ')} are not on the validator committee for epoch ${epoch}`,
          );
        }
        this.lastEpoch = epoch;
      }
    } catch (err) {
      this.log.error(`Error updating epoch committee`, err);
    }
  }

  static new(
    config: ValidatorClientConfig &
      Pick<SlasherConfig, 'slashInvalidBlockEnabled' | 'slashInvalidBlockPenalty' | 'slashInvalidBlockMaxPenalty'>,
    blockBuilder: IFullNodeBlockBuilder,
    epochCache: EpochCache,
    p2pClient: P2P,
    blockSource: L2BlockSource,
    l1ToL2MessageSource: L1ToL2MessageSource,
    dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    if (!config.validatorPrivateKeys.getValue().length) {
      throw new InvalidValidatorPrivateKeyError();
    }

    const privateKeys = config.validatorPrivateKeys.getValue().map(validatePrivateKey);
    const localKeyStore = new LocalKeyStore(privateKeys);

    const validator = new ValidatorClient(
      blockBuilder,
      localKeyStore,
      epochCache,
      p2pClient,
      blockSource,
      l1ToL2MessageSource,
      config,
      dateProvider,
      telemetry,
    );

    // TODO(PhilWindle): This seems like it could/should be done inside start()
    validator.registerBlockProposalHandler();
    return validator;
  }

  public getValidatorAddresses() {
    return this.keyStore.getAddresses();
  }

  public configureSlashing(
    config: Partial<
      Pick<SlasherConfig, 'slashInvalidBlockEnabled' | 'slashInvalidBlockPenalty' | 'slashInvalidBlockMaxPenalty'>
    >,
  ) {
    this.config.slashInvalidBlockEnabled = config.slashInvalidBlockEnabled ?? this.config.slashInvalidBlockEnabled;
    this.config.slashInvalidBlockPenalty = config.slashInvalidBlockPenalty ?? this.config.slashInvalidBlockPenalty;
    this.config.slashInvalidBlockMaxPenalty =
      config.slashInvalidBlockMaxPenalty ?? this.config.slashInvalidBlockMaxPenalty;
  }

  public async start() {
    // Sync the committee from the smart contract
    // https://github.com/AztecProtocol/aztec-packages/issues/7962

    const myAddresses = this.keyStore.getAddresses();

    const inCommittee = await this.epochCache.filterInCommittee(myAddresses);
    if (inCommittee.length > 0) {
      this.log.info(
        `Started validator with addresses in current validator committee: ${inCommittee.map(a => a.toString()).join(', ')}`,
      );
    } else {
      this.log.info(`Started validator with addresses: ${myAddresses.map(a => a.toString()).join(', ')}`);
    }
    this.epochCacheUpdateLoop.start();
    await this.p2pClient.addReqRespSubProtocol(ReqRespSubProtocol.AUTH, this.handleAuthRequest.bind(this));
    return Promise.resolve();
  }

  public async stop() {
    await this.epochCacheUpdateLoop.stop();
  }

  public registerBlockProposalHandler() {
    const handler = (block: BlockProposal, proposalSender: PeerId): Promise<BlockAttestation[] | undefined> => {
      return this.attestToProposal(block, proposalSender);
    };
    this.p2pClient.registerBlockProposalHandler(handler);
  }

  async attestToProposal(proposal: BlockProposal, proposalSender: PeerId): Promise<BlockAttestation[] | undefined> {
    const slotNumber = proposal.slotNumber.toNumber();
    const blockNumber = proposal.blockNumber;
    const proposer = proposal.getSender();

    const proposalInfo = {
      slotNumber,
      blockNumber,
      proposer: proposer.toString(),
      archive: proposal.payload.archive.toString(),
      txCount: proposal.payload.txHashes.length,
      txHashes: proposal.payload.txHashes.map(txHash => txHash.toString()),
    };
    this.log.info(`Received request to attest for slot ${slotNumber}`, proposalInfo);

    // Check that the proposal is from the current proposer, or the next proposer.
    // Q: Should this be moved to the block proposal validator, so we disregard proposals from anyone?
    const invalidProposal = await this.blockProposalValidator.validate(proposal);
    if (invalidProposal) {
      this.log.warn(`Proposal is not valid, skipping attestation`);
      this.metrics.incFailedAttestations(1, 'invalid_proposal');
      return undefined;
    }

    // Check that the parent proposal is a block we know, otherwise reexecution would fail.
    // Q: Should we move this to the block proposal validator? If there, then p2p would check it
    // before re-broadcasting it. This means that proposals built on top of an L1-reorg'ed-out block
    // would not be rebroadcasted. But it also means that nodes that have not fully synced would
    // not rebroadcast the proposal.
    if (blockNumber > INITIAL_L2_BLOCK_NUM) {
      const parentBlock = await this.blockSource.getBlock(blockNumber - 1);
      if (parentBlock === undefined) {
        this.log.warn(`Parent block for ${blockNumber} not found, skipping attestation`);
        this.metrics.incFailedAttestations(1, 'parent_block_not_found');
        return undefined;
      }
      if (!proposal.payload.header.lastArchiveRoot.equals(parentBlock.archive.root)) {
        this.log.warn(`Parent block archive root for proposal does not match, skipping attestation`, {
          proposalLastArchiveRoot: proposal.payload.header.lastArchiveRoot.toString(),
          parentBlockArchiveRoot: parentBlock.archive.root.toString(),
          ...proposalInfo,
        });
        this.metrics.incFailedAttestations(1, 'parent_block_does_not_match');
        return undefined;
      }
    }

    // Collect txs from the proposal
    const { missing, txs } = await this.txCollector.collectForBlockProposal(proposal, proposalSender);

    // Check that I have any address in current committee before attesting
    const inCommittee = await this.epochCache.filterInCommittee(this.keyStore.getAddresses());
    if (inCommittee.length === 0) {
      this.log.verbose(`No validator in the committee, skipping attestation`);
      return undefined;
    }

    // Check that all of the transactions in the proposal are available in the tx pool before attesting
    if (missing && missing.length > 0) {
      this.log.warn(`Missing ${missing.length}/${proposal.payload.txHashes.length} txs to attest to proposal`, {
        ...proposalInfo,
        missing,
      });
      this.metrics.incFailedAttestations(1, 'TransactionsNotAvailableError');
      return undefined;
    }

    // Check that I have the same set of l1ToL2Messages as the proposal
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(blockNumber);
    const computedInHash = await computeInHashFromL1ToL2Messages(l1ToL2Messages);
    const proposalInHash = proposal.payload.header.contentCommitment.inHash;
    if (!computedInHash.equals(proposalInHash)) {
      this.log.warn(`L1 to L2 messages in hash mismatch, skipping attestation`, {
        proposalInHash: proposalInHash.toString(),
        computedInHash: computedInHash.toString(),
        ...proposalInfo,
      });
      this.metrics.incFailedAttestations(1, 'in_hash_mismatch');
      return undefined;
    }

    // Try re-executing the transactions in the proposal
    try {
      this.log.verbose(`Processing attestation for slot ${slotNumber}`, proposalInfo);
      if (this.config.validatorReexecute) {
        this.log.verbose(`Re-executing transactions in the proposal before attesting`);
        await this.reExecuteTransactions(proposal, txs, l1ToL2Messages);
      }
    } catch (error: any) {
      this.metrics.incFailedAttestations(1, error instanceof Error ? error.name : 'unknown');
      this.log.error(`Error reexecuting txs while processing block proposal`, error, proposalInfo);
      if (error instanceof ReExStateMismatchError && this.config.slashInvalidBlockEnabled) {
        this.log.warn(`Slashing proposer for invalid block proposal`, proposalInfo);
        this.slashInvalidBlock(proposal);
      }
      return undefined;
    }

    // Provided all of the above checks pass, we can attest to the proposal
    this.log.info(`Attesting to proposal for slot ${slotNumber}`, proposalInfo);
    this.metrics.incAttestations(inCommittee.length);

    // If the above function does not throw an error, then we can attest to the proposal
    return this.doAttestToProposal(proposal, inCommittee);
  }

  private getReexecutionDeadline(
    proposal: BlockProposal,
    config: { l1GenesisTime: bigint; slotDuration: number },
  ): Date {
    const nextSlotTimestampSeconds = Number(getTimestampForSlot(proposal.slotNumber.toBigInt() + 1n, config));
    const msNeededForPropagationAndPublishing = this.config.validatorReexecuteDeadlineMs;
    return new Date(nextSlotTimestampSeconds * 1000 - msNeededForPropagationAndPublishing);
  }

  /**
   * Re-execute the transactions in the proposal and check that the state updates match the header state
   * @param proposal - The proposal to re-execute
   */
  async reExecuteTransactions(proposal: BlockProposal, txs: Tx[], l1ToL2Messages: Fr[]): Promise<void> {
    const { header, txHashes } = proposal.payload;

    // If we do not have all of the transactions, then we should fail
    if (txs.length !== txHashes.length) {
      const foundTxHashes = await Promise.all(txs.map(async tx => await tx.getTxHash()));
      const missingTxHashes = txHashes.filter(txHash => !foundTxHashes.includes(txHash));
      throw new TransactionsNotAvailableError(missingTxHashes);
    }

    // Use the sequencer's block building logic to re-execute the transactions
    const timer = new Timer();
    const config = this.blockBuilder.getConfig();
    const globalVariables = GlobalVariables.from({
      ...proposal.payload.header,
      blockNumber: proposal.blockNumber,
      timestamp: header.timestamp,
      chainId: new Fr(config.l1ChainId),
      version: new Fr(config.rollupVersion),
    });

    const { block, failedTxs } = await this.blockBuilder.buildBlock(txs, l1ToL2Messages, globalVariables, {
      deadline: this.getReexecutionDeadline(proposal, config),
    });

    this.log.verbose(`Transaction re-execution complete`);
    const numFailedTxs = failedTxs.length;

    if (numFailedTxs > 0) {
      this.metrics.recordFailedReexecution(proposal);
      throw new ReExFailedTxsError(numFailedTxs);
    }

    if (block.body.txEffects.length !== txHashes.length) {
      this.metrics.recordFailedReexecution(proposal);
      throw new ReExTimeoutError();
    }

    // This function will throw an error if state updates do not match
    if (!block.archive.root.equals(proposal.archive)) {
      this.metrics.recordFailedReexecution(proposal);
      throw new ReExStateMismatchError(
        proposal.archive,
        block.archive.root,
        proposal.payload.stateReference,
        block.header.state,
      );
    }

    this.metrics.recordReex(timer.ms(), txs.length, block.header.totalManaUsed.toNumber() / 1e6);
  }

  private slashInvalidBlock(proposal: BlockProposal) {
    const proposer = proposal.getSender();

    // Trim the set if it's too big.
    if (this.proposersOfInvalidBlocks.size > MAX_PROPOSERS_OF_INVALID_BLOCKS) {
      // remove oldest proposer. `values` is guaranteed to be in insertion order.
      this.proposersOfInvalidBlocks.delete(this.proposersOfInvalidBlocks.values().next().value!);
    }

    this.proposersOfInvalidBlocks.add(proposer);

    this.emit(WANT_TO_SLASH_EVENT, [
      {
        validator: proposer,
        amount: this.config.slashInvalidBlockPenalty,
        offense: Offense.INVALID_BLOCK,
      },
    ]);
  }

  /**
   * Ask this client if we should slash the validator specified in the args.
   * @param args - The validator/amount/offence triple to check
   * @returns True if this validator client re-executed a proposal and found it invalid.
   *
   * NOTE: this will return true even if the validator proposed the invalid block a "long" time ago.
   * Thus, the onus is on the caller to ensure we aren't digging to far in the past.
   *
   * That is fine though, since the only caller is the slasher client, and it is designed to call
   * `shouldSlash` on each of its watchers "very close" to the point in time when the slashable offence occurred;
   * i.e. either we just created the slashing payload, or someone else did and we saw the event on L1.
   */
  public shouldSlash(args: WantToSlashArgs): Promise<boolean> {
    // note we don't check the offence here: we know this person is bad and we're willing to slash up to the max penalty.
    return Promise.resolve(
      args.amount <= this.config.slashInvalidBlockMaxPenalty && this.proposersOfInvalidBlocks.has(args.validator),
    );
  }

  async createBlockProposal(
    blockNumber: number,
    header: ProposedBlockHeader,
    archive: Fr,
    stateReference: StateReference,
    txs: Tx[],
    proposerAddress: EthAddress | undefined,
    options: BlockProposalOptions,
  ): Promise<BlockProposal | undefined> {
    if (this.previousProposal?.slotNumber.equals(header.slotNumber)) {
      this.log.verbose(`Already made a proposal for the same slot, skipping proposal`);
      return Promise.resolve(undefined);
    }

    const newProposal = await this.validationService.createBlockProposal(
      blockNumber,
      header,
      archive,
      stateReference,
      txs,
      proposerAddress,
      options,
    );
    this.previousProposal = newProposal;
    return newProposal;
  }

  async broadcastBlockProposal(proposal: BlockProposal): Promise<void> {
    await this.p2pClient.broadcastProposal(proposal);
  }

  async collectAttestations(proposal: BlockProposal, required: number, deadline: Date): Promise<BlockAttestation[]> {
    // Wait and poll the p2pClient's attestation pool for this block until we have enough attestations
    const slot = proposal.payload.header.slotNumber.toBigInt();
    this.log.debug(`Collecting ${required} attestations for slot ${slot} with deadline ${deadline.toISOString()}`);

    if (+deadline < this.dateProvider.now()) {
      this.log.error(
        `Deadline ${deadline.toISOString()} for collecting ${required} attestations for slot ${slot} is in the past`,
      );
      throw new AttestationTimeoutError(0, required, slot);
    }

    const proposalId = proposal.archive.toString();
    // adds attestations for all of my addresses locally
    const inCommittee = await this.epochCache.filterInCommittee(this.keyStore.getAddresses());
    await this.doAttestToProposal(proposal, inCommittee);

    const myAddresses = this.keyStore.getAddresses();

    let attestations: BlockAttestation[] = [];
    while (true) {
      const collectedAttestations = await this.p2pClient.getAttestationsForSlot(slot, proposalId);
      const oldSenders = attestations.map(attestation => attestation.getSender());
      for (const collected of collectedAttestations) {
        const collectedSender = collected.getSender();
        if (
          !myAddresses.some(address => address.equals(collectedSender)) &&
          !oldSenders.some(sender => sender.equals(collectedSender))
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

      this.log.debug(`Collected ${attestations.length} attestations so far`);
      await sleep(this.config.attestationPollingIntervalMs);
    }
  }

  private async doAttestToProposal(proposal: BlockProposal, attestors: EthAddress[] = []): Promise<BlockAttestation[]> {
    const attestations = await this.validationService.attestToProposal(proposal, attestors);
    await this.p2pClient.addAttestations(attestations);
    return attestations;
  }

  private handleAuthRequest(_peer: PeerId, _msg: Buffer): Promise<Buffer> {
    if (this.p2pClient.shouldTrustWithIdentity(_peer)) {
      this.log.debug(`Received auth request from trusted peer ${_peer.toString()}`);
      return Promise.resolve(Buffer.from('trusted'));
    }
    return Promise.reject();
  }
}

function validatePrivateKey(privateKey: string): Buffer32 {
  try {
    return Buffer32.fromString(privateKey);
  } catch {
    throw new InvalidValidatorPrivateKeyError();
  }
}
