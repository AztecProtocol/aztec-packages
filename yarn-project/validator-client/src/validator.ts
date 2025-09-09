import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import type { KeystoreManager } from '@aztec/node-keystore';
import type { P2P, PeerId } from '@aztec/p2p';
import { AuthRequest, AuthResponse, ReqRespSubProtocol, TxProvider } from '@aztec/p2p';
import { BlockProposalValidator } from '@aztec/p2p/msg_validators';
import { computeInHashFromL1ToL2Messages } from '@aztec/prover-client/helpers';
import {
  OffenseType,
  type SlasherConfig,
  WANT_TO_SLASH_EVENT,
  type Watcher,
  type WatcherEmitter,
} from '@aztec/slasher';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import type { IFullNodeBlockBuilder, Validator, ValidatorClientFullConfig } from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { BlockAttestation, BlockProposal, BlockProposalOptions } from '@aztec/stdlib/p2p';
import { GlobalVariables, type ProposedBlockHeader, type StateReference, type Tx } from '@aztec/stdlib/tx';
import {
  AttestationTimeoutError,
  ReExFailedTxsError,
  ReExStateMismatchError,
  ReExTimeoutError,
  TransactionsNotAvailableError,
} from '@aztec/stdlib/validators';
import { type TelemetryClient, type Tracer, getTelemetryClient } from '@aztec/telemetry-client';

import { EventEmitter } from 'events';
import type { TypedDataDefinition } from 'viem';

import type { ValidatorClientConfig } from './config.js';
import { ValidationService } from './duties/validation_service.js';
import { NodeKeystoreAdapter } from './key_store/node_keystore_adapter.js';
import { ValidatorMetrics } from './metrics.js';

// We maintain a set of proposers who have proposed invalid blocks.
// Just cap the set to avoid unbounded growth.
const MAX_PROPOSERS_OF_INVALID_BLOCKS = 1000;

/**
 * Validator Client
 */
export class ValidatorClient extends (EventEmitter as new () => WatcherEmitter) implements Validator, Watcher {
  public readonly tracer: Tracer;
  private validationService: ValidationService;
  private metrics: ValidatorMetrics;

  // Used to check if we are sending the same proposal twice
  private previousProposal?: BlockProposal;

  private lastEpochForCommitteeUpdateLoop: bigint | undefined;
  private epochCacheUpdateLoop: RunningPromise;

  private blockProposalValidator: BlockProposalValidator;

  private proposersOfInvalidBlocks: Set<string> = new Set();

  protected constructor(
    private blockBuilder: IFullNodeBlockBuilder,
    private keyStore: NodeKeystoreAdapter,
    private epochCache: EpochCache,
    private p2pClient: P2P,
    private blockSource: L2BlockSource,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private txProvider: TxProvider,
    private config: ValidatorClientFullConfig,
    private dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('validator'),
  ) {
    super();
    this.tracer = telemetry.getTracer('Validator');
    this.metrics = new ValidatorMetrics(telemetry);

    this.validationService = new ValidationService(keyStore);

    this.blockProposalValidator = new BlockProposalValidator(epochCache);

    // Refresh epoch cache every second to trigger alert if participation in committee changes
    this.epochCacheUpdateLoop = new RunningPromise(this.handleEpochCommitteeUpdate.bind(this), log, 1000);

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

  static new(
    config: ValidatorClientConfig & Pick<SlasherConfig, 'slashBroadcastedInvalidBlockPenalty'>,
    blockBuilder: IFullNodeBlockBuilder,
    epochCache: EpochCache,
    p2pClient: P2P,
    blockSource: L2BlockSource,
    l1ToL2MessageSource: L1ToL2MessageSource,
    txProvider: TxProvider,
    keyStoreManager: KeystoreManager,
    dateProvider: DateProvider = new DateProvider(),
    telemetry: TelemetryClient = getTelemetryClient(),
  ) {
    const validator = new ValidatorClient(
      blockBuilder,
      NodeKeystoreAdapter.fromKeyStoreManager(keyStoreManager),
      epochCache,
      p2pClient,
      blockSource,
      l1ToL2MessageSource,
      txProvider,
      config,
      dateProvider,
      telemetry,
    );

    // TODO(PhilWindle): This seems like it could/should be done inside start()
    validator.registerBlockProposalHandler();
    return validator;
  }

  public getValidatorAddresses() {
    return this.keyStore
      .getAddresses()
      .filter(addr => !this.config.disabledValidators.some(disabled => disabled.equals(addr)));
  }

  public signWithAddress(addr: EthAddress, msg: TypedDataDefinition) {
    return this.keyStore.signTypedDataWithAddress(addr, msg);
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

  public async start() {
    // Sync the committee from the smart contract
    // https://github.com/AztecProtocol/aztec-packages/issues/7962

    const myAddresses = this.getValidatorAddresses();

    const inCommittee = await this.epochCache.filterInCommittee('now', myAddresses);
    if (inCommittee.length > 0) {
      this.log.info(
        `Started validator with addresses in current validator committee: ${inCommittee
          .map(a => a.toString())
          .join(', ')}`,
      );
    } else {
      this.log.info(`Started validator with addresses: ${myAddresses.map(a => a.toString()).join(', ')}`);
    }
    this.epochCacheUpdateLoop.start();

    this.p2pClient.registerThisValidatorAddresses(myAddresses);
    await this.p2pClient.addReqRespSubProtocol(ReqRespSubProtocol.AUTH, this.handleAuthRequest.bind(this));

    return Promise.resolve();
  }

  public async stop() {
    await this.epochCacheUpdateLoop.stop();
  }

  public registerBlockProposalHandler() {
    const handler = (block: BlockProposal, proposalSender: PeerId): Promise<BlockAttestation[] | undefined> =>
      this.attestToProposal(block, proposalSender);
    this.p2pClient.registerBlockProposalHandler(handler);
  }

  async attestToProposal(proposal: BlockProposal, proposalSender: PeerId): Promise<BlockAttestation[] | undefined> {
    const slotNumber = proposal.slotNumber.toBigInt();
    const blockNumber = proposal.blockNumber;
    const proposer = proposal.getSender();

    // Check that I have any address in current committee before attesting
    const inCommittee = await this.epochCache.filterInCommittee(slotNumber, this.getValidatorAddresses());
    const partOfCommittee = inCommittee.length > 0;

    const proposalInfo = {
      ...proposal.toBlockInfo(),
      proposer: proposer.toString(),
    };

    this.log.info(`Received proposal for slot ${slotNumber}`, {
      ...proposalInfo,
      txHashes: proposal.txHashes.map(txHash => txHash.toString()),
    });

    // Collect txs from the proposal. Note that we do this before checking if we have an address in the
    // current committee, since we want to collect txs anyway to facilitate propagation.
    const { txs, missingTxs } = await this.txProvider.getTxsForBlockProposal(proposal, {
      pinnedPeer: proposalSender,
      deadline: this.getReexecutionDeadline(proposal, this.blockBuilder.getConfig()),
    });

    // Check that I have any address in current committee before attesting
    if (!partOfCommittee) {
      this.log.verbose(`No validator in the current committee, skipping attestation`, proposalInfo);
      return undefined;
    }

    // Check that the proposal is from the current proposer, or the next proposer.
    // Q: Should this be moved to the block proposal validator, so we disregard proposals from anyone?
    const invalidProposal = await this.blockProposalValidator.validate(proposal);
    if (invalidProposal) {
      this.log.warn(`Proposal is not valid, skipping attestation`, proposalInfo);
      if (partOfCommittee) {
        this.metrics.incFailedAttestations(1, 'invalid_proposal');
      }
      return undefined;
    }

    // Check that the parent proposal is a block we know, otherwise reexecution would fail.
    // Q: Should we move this to the block proposal validator? If there, then p2p would check it
    // before re-broadcasting it. This means that proposals built on top of an L1-reorg'ed-out block
    // would not be rebroadcasted. But it also means that nodes that have not fully synced would
    // not rebroadcast the proposal.
    if (blockNumber > INITIAL_L2_BLOCK_NUM) {
      const config = this.blockBuilder.getConfig();
      const deadline = this.getReexecutionDeadline(proposal, config);
      const currentTime = this.dateProvider.now();
      const timeoutDurationMs = deadline.getTime() - currentTime;
      const parentBlock =
        timeoutDurationMs <= 0
          ? undefined
          : await retryUntil(
              async () => {
                const block = await this.blockSource.getBlock(blockNumber - 1);
                if (block) {
                  return block;
                }
                await this.blockSource.syncImmediate();
                return await this.blockSource.getBlock(blockNumber - 1);
              },
              'Force Archiver Sync',
              timeoutDurationMs / 1000, // Continue retrying until the deadline
              0.5, // Retry every 500ms
            );

      if (parentBlock === undefined) {
        this.log.warn(`Parent block for ${blockNumber} not found, skipping attestation`, proposalInfo);
        if (partOfCommittee) {
          this.metrics.incFailedAttestations(1, 'parent_block_not_found');
        }
        return undefined;
      }

      if (!proposal.payload.header.lastArchiveRoot.equals(parentBlock.archive.root)) {
        this.log.warn(`Parent block archive root for proposal does not match, skipping attestation`, {
          proposalLastArchiveRoot: proposal.payload.header.lastArchiveRoot.toString(),
          parentBlockArchiveRoot: parentBlock.archive.root.toString(),
          ...proposalInfo,
        });
        if (partOfCommittee) {
          this.metrics.incFailedAttestations(1, 'parent_block_does_not_match');
        }
        return undefined;
      }
    }

    // Check that I have the same set of l1ToL2Messages as the proposal
    // Q: Same as above, should this be part of p2p validation?
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(blockNumber);
    const computedInHash = await computeInHashFromL1ToL2Messages(l1ToL2Messages);
    const proposalInHash = proposal.payload.header.contentCommitment.inHash;
    if (!computedInHash.equals(proposalInHash)) {
      this.log.warn(`L1 to L2 messages in hash mismatch, skipping attestation`, {
        proposalInHash: proposalInHash.toString(),
        computedInHash: computedInHash.toString(),
        ...proposalInfo,
      });
      if (partOfCommittee) {
        this.metrics.incFailedAttestations(1, 'in_hash_mismatch');
      }
      return undefined;
    }

    // Check that all of the transactions in the proposal are available in the tx pool before attesting
    if (missingTxs.length > 0) {
      this.log.warn(`Missing ${missingTxs.length} txs to attest to proposal`, { ...proposalInfo, missingTxs });
      if (partOfCommittee) {
        this.metrics.incFailedAttestations(1, 'TransactionsNotAvailableError');
      }
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
      if (error instanceof ReExStateMismatchError && this.config.slashBroadcastedInvalidBlockPenalty > 0n) {
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
    const { header } = proposal.payload;
    const { txHashes } = proposal;

    // If we do not have all of the transactions, then we should fail
    if (txs.length !== txHashes.length) {
      const foundTxHashes = txs.map(tx => tx.getTxHash());
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

    this.proposersOfInvalidBlocks.add(proposer.toString());

    this.emit(WANT_TO_SLASH_EVENT, [
      {
        validator: proposer,
        amount: this.config.slashBroadcastedInvalidBlockPenalty,
        offenseType: OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL,
        epochOrSlot: proposal.slotNumber.toBigInt(),
      },
    ]);
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

  async collectOwnAttestations(proposal: BlockProposal): Promise<BlockAttestation[]> {
    const slot = proposal.payload.header.slotNumber.toBigInt();
    const inCommittee = await this.epochCache.filterInCommittee(slot, this.getValidatorAddresses());
    this.log.debug(`Collecting ${inCommittee.length} self-attestations for slot ${slot}`, { inCommittee });
    return this.doAttestToProposal(proposal, inCommittee);
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

    await this.collectOwnAttestations(proposal);

    const proposalId = proposal.archive.toString();
    const myAddresses = this.getValidatorAddresses();

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
    const signature = await this.keyStore.signMessageWithAddress(addressToUse, payloadToSign);
    const authResponse = new AuthResponse(statusMessage, signature);
    return authResponse.toBuffer();
  }
}

// Conversion helpers moved into NodeKeystoreAdapter.
