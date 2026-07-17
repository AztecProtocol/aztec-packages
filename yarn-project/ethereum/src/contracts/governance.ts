import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { GovernanceAbi } from '@aztec/l1-artifacts/GovernanceAbi';

import {
  type EncodeFunctionDataParameters,
  type GetContractReturnType,
  type Hex,
  type Log,
  encodeFunctionData,
  getContract,
  parseEventLogs,
} from 'viem';

import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import { createL1TxUtils } from '../l1_tx_utils/index.js';
import { type ExtendedViemWalletClient, type ViemClient, isExtendedClient } from '../types.js';

// Minimal ABI for IProposerPayload (`l1-contracts/src/governance/interfaces/IProposerPayload.sol`).
// The GovernanceProposer wraps every original payload in a GSEPayload before submitting it to
// Governance, so `Proposal.payload` on the Governance contract is the wrapper address rather than
// the original. We only need `getOriginalPayload` to recover the underlying payload, so we inline
// the ABI here instead of generating a full artifact.
const ProposerPayloadAbi = [
  {
    type: 'function',
    name: 'getOriginalPayload',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
] as const;

export type L1GovernanceContractAddresses = Pick<
  L1ContractAddresses,
  'governanceAddress' | 'rollupAddress' | 'registryAddress' | 'governanceProposerAddress'
>;

// NOTE: Must be kept in sync with IGovernance.ProposalState in l1-contracts
export enum ProposalState {
  Pending,
  Active,
  Queued,
  Executable,
  Rejected,
  Executed,
  Droppable,
  Dropped,
  Expired,
}

/**
 * Outcome of {@link ReadOnlyGovernanceContract.getPayloadProposalStatus} for a queried payload.
 * - `'live'`: a proposal referencing the payload is still progressing (Pending/Active/Queued/
 *   Executable) or is `Droppable`, so signalling for it again is redundant or premature.
 * - `'executed'`: no live proposal references the payload, but one was already executed within the
 *   bounded lookback (or a prior sweep observed the execution and memoized it).
 * - `'none'`: no live or executed proposal references the payload within the bounded lookback.
 */
export type PayloadProposalStatus = 'live' | 'executed' | 'none';

/** Vote tallies on a single proposal. Both fields are mutated by `Governance.vote`. */
export interface Ballot {
  yea: bigint;
  nay: bigint;
}

/**
 * Snapshot of the timing/quorum parameters that govern a single proposal's lifecycle. Each proposal
 * stores its own copy at creation time (see `_propose` in Governance.sol), so this snapshot is
 * immutable for the lifetime of the proposal even if the global `Configuration` changes later.
 */
export interface ProposalConfiguration {
  votingDelay: bigint;
  votingDuration: bigint;
  executionDelay: bigint;
  gracePeriod: bigint;
  quorum: bigint;
  requiredYeaMargin: bigint;
  minimumVotes: bigint;
}

/** Parameters for `Governance.proposeWithLock`. Stored only in the global Configuration, never on a proposal. */
export interface ProposeWithLockConfiguration {
  lockDelay: bigint;
  lockAmount: bigint;
}

/**
 * Live, mutable governance configuration. `proposeConfig` is the lock configuration used by
 * `proposeWithLock`; the remaining fields are the same shape as `ProposalConfiguration` and are
 * snapshotted onto each new proposal at creation time.
 */
export interface GovernanceConfiguration extends ProposalConfiguration {
  proposeConfig: ProposeWithLockConfiguration;
}

/**
 * A governance proposal augmented with its live (computed) state.
 *
 * Mutability:
 * - `config`, `payload`, `proposer`, `creation` are immutable for the lifetime of the proposal.
 * - `cachedState` is the raw value stored on-chain. It is only written when a proposal is explicitly
 *   executed or dropped, so for time-derived terminal states (Rejected, Expired) it remains at the
 *   value that was current when the proposal was created.
 * - `state` is the computed state returned by `Governance.getProposalState`. This is the value
 *   callers almost always want -- it reflects time-derived transitions that `cachedState` does not.
 * - `summedBallot` is mutated by every `Governance.vote` call while the proposal is Active.
 *
 * Once `state` is in a terminal phase (`Executed`/`Rejected`/`Dropped`/`Expired`) the entire struct
 * is provably immutable on-chain (no further votes can be cast and no state-mutating call to
 * `execute`/`dropProposal` can succeed), and the wrapper memoizes it.
 */
export interface Proposal {
  config: ProposalConfiguration;
  cachedState: ProposalState;
  state: ProposalState;
  payload: EthAddress;
  proposer: EthAddress;
  creation: bigint;
  summedBallot: Ballot;
}

/** Set of `ProposalState` values for which a proposal is fully immutable on-chain. */
const TERMINAL_PROPOSAL_STATES: ReadonlySet<ProposalState> = new Set([
  ProposalState.Executed,
  ProposalState.Rejected,
  ProposalState.Dropped,
  ProposalState.Expired,
]);

// Set of `ProposalState` values in which a proposal is still progressing towards execution.
// `Droppable` is deliberately excluded: it is neither live (it cannot progress on its own) nor
// terminal (it can resume its lifecycle if the governanceProposer is restored), so it is handled
// separately and is never memoized as immutable.
const LIVE_PROPOSAL_STATES: ReadonlySet<ProposalState> = new Set([
  ProposalState.Pending,
  ProposalState.Active,
  ProposalState.Queued,
  ProposalState.Executable,
]);

// Hard upper bound on the wall-clock lifetime of any Governance proposal, in seconds.
// Each proposal stores its own snapshot of `ProposalConfiguration` at creation time and progresses
// through Pending -> Active -> Queued -> Executable using those frozen durations
// (see `ProposalLib.{pendingThrough,activeThrough,queuedThrough,executableThrough}`). Each of those
// four durations is bounded by `ConfigurationLib.TIME_UPPER = 90 days` (validated in
// `ConfigurationLib.assertValid`), so no proposal can be live for more than 4 * 90 days regardless
// of what config it was created under. Once past this point, the proposal is guaranteed to be in a
// terminal state (Executed / Rejected / Dropped / Expired).
export const MAX_PROPOSAL_LIFETIME_SECONDS = 4n * 90n * 24n * 3600n;

/**
 * Validates a number returned by an on-chain `ProposalState` enum field and narrows it to the
 * `ProposalState` enum. Throws if the value is out of range.
 */
function asProposalState(raw: number): ProposalState {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
  if (raw < 0 || raw > ProposalState.Expired) {
    throw new Error(`Invalid proposal state: ${raw}`);
  }
  return raw as ProposalState;
}

export function extractProposalIdFromLogs(logs: Log[]): bigint {
  const parsedLogs = parseEventLogs({
    abi: GovernanceAbi,
    logs: logs,
    eventName: 'Proposed',
  });

  if (parsedLogs.length === 0) {
    throw new Error('Proposal log not found');
  }
  return parsedLogs[0].args.proposalId;
}

export class ReadOnlyGovernanceContract {
  protected readonly governanceContract: GetContractReturnType<typeof GovernanceAbi, ViemClient>;

  /**
   * Cache of fully-resolved proposals keyed by id. We populate this lazily and only retain entries
   * whose state is provably terminal -- once `cachedState` is `Executed` or `Dropped` the on-chain
   * proposal struct is frozen and safe to memoize indefinitely. Other state transitions (e.g.
   * Pending -> Active, or accumulating votes) leave the cache untouched and force a fresh fetch.
   */
  private readonly proposalCache: Map<bigint, Proposal> = new Map();

  /**
   * Cache of `IProposerPayload.getOriginalPayload()` results keyed by wrapper address. The wrapper
   * contract's bytecode is immutable, so this mapping never changes -- a value of `undefined`
   * encodes a proposal whose payload doesn't implement `getOriginalPayload` (e.g. proposeWithLock
   * proposals) and should be treated as "no original".
   */
  private readonly originalPayloadCache: Map<Hex, Hex | undefined> = new Map();

  /**
   * Payloads (lowercased hex) observed as the subject of an `Executed` Governance proposal. Execution
   * is immutable on-chain, so this verdict never expires within a process. It restores the
   * `'executed'` classification for payloads whose executed proposal has since aged past the bounded
   * lookback below. Lost on restart, at which point the bounded-lookback limitation applies again.
   */
  private readonly executedPayloads: Set<string> = new Set();

  constructor(
    address: Hex,
    public readonly client: ViemClient,
  ) {
    this.governanceContract = getContract({ address, abi: GovernanceAbi, client: client });
  }

  public get address() {
    return EthAddress.fromString(this.governanceContract.address);
  }

  public async getGovernanceProposerAddress() {
    return EthAddress.fromString(await this.governanceContract.read.governanceProposer());
  }

  public async getConfiguration(): Promise<GovernanceConfiguration> {
    const raw = await this.governanceContract.read.getConfiguration();
    return {
      proposeConfig: {
        lockDelay: raw.proposeConfig.lockDelay,
        lockAmount: raw.proposeConfig.lockAmount,
      },
      votingDelay: raw.votingDelay,
      votingDuration: raw.votingDuration,
      executionDelay: raw.executionDelay,
      gracePeriod: raw.gracePeriod,
      quorum: raw.quorum,
      requiredYeaMargin: raw.requiredYeaMargin,
      minimumVotes: raw.minimumVotes,
    };
  }

  /**
   * Fetches a proposal by id together with its live state, returning the mapped {@link Proposal}
   * type. Issues `getProposal` and `getProposalState` in parallel so the result carries both the
   * raw stored `cachedState` and the time-derived `state` -- callers can use whichever they need
   * without an extra round-trip.
   *
   * Backed by an in-memory cache that retains entries only when `state` is in one of the four
   * terminal phases (`Executed` / `Rejected` / `Dropped` / `Expired`). At that point the entire
   * proposal struct is provably immutable on-chain (no further votes can be cast and no
   * state-mutating call can succeed), so caching is safe forever. Non-terminal states force a
   * fresh fetch on every call so callers always see fresh `state` and `summedBallot` values.
   */
  public async getProposal(proposalId: bigint): Promise<Proposal> {
    const cached = this.proposalCache.get(proposalId);
    if (cached !== undefined) {
      return cached;
    }
    const [raw, rawState] = await Promise.all([
      this.governanceContract.read.getProposal([proposalId]),
      this.governanceContract.read.getProposalState([proposalId]),
    ]);
    const proposal: Proposal = {
      config: {
        votingDelay: raw.config.votingDelay,
        votingDuration: raw.config.votingDuration,
        executionDelay: raw.config.executionDelay,
        gracePeriod: raw.config.gracePeriod,
        quorum: raw.config.quorum,
        requiredYeaMargin: raw.config.requiredYeaMargin,
        minimumVotes: raw.config.minimumVotes,
      },
      cachedState: asProposalState(raw.cachedState),
      state: asProposalState(rawState),
      payload: EthAddress.fromString(raw.payload),
      proposer: EthAddress.fromString(raw.proposer),
      creation: raw.creation,
      summedBallot: { yea: raw.summedBallot.yea, nay: raw.summedBallot.nay },
    };
    if (TERMINAL_PROPOSAL_STATES.has(proposal.state)) {
      this.proposalCache.set(proposalId, proposal);
    }
    return proposal;
  }

  /**
   * Returns the live state of a proposal as computed by `Governance.getProposalState`. Prefer
   * {@link getProposal} when you also need any other proposal data -- it returns this same value
   * via {@link Proposal.state} alongside the rest of the struct in a single round-trip.
   */
  public async getProposalState(proposalId: bigint): Promise<ProposalState> {
    return asProposalState(await this.governanceContract.read.getProposalState([proposalId]));
  }

  public getProposalCount(): Promise<bigint> {
    return this.governanceContract.read.proposalCount();
  }

  /**
   * Classifies the given original payload against the Governance proposal history. Distinguishes a
   * payload that is still the subject of a live proposal (`'live'`) from one whose proposal was
   * already executed (`'executed'`) from one that has no relevant proposal (`'none'`), so callers can
   * stop re-signalling an executed payload while still re-signalling one whose proposal was merely
   * rejected/dropped/expired (each GovernanceProposer round is independent and there is no
   * payload-level uniqueness check on-chain).
   *
   * A proposal matches the payload either directly (its stored `payload` equals the target, as for
   * `proposeWithLock` proposals) or via its `GSEPayload` wrapper unwrapping to the target. `'live'`
   * (including `Droppable`) takes precedence over `'executed'`, so a payload re-submitted while a
   * prior execution is still in the lookback window reads as `'live'`.
   *
   * Implemented as a bounded view-call sweep over `Governance.proposals` rather than an event scan,
   * because `eth_getLogs` over the full deployment history of a long-lived rollup exceeds typical
   * RPC block-range caps. The number of proposals (`proposalCount`) is small in practice, and we
   * walk newest -> oldest with a hard early-stop on the protocol-wide proposal lifetime cap. This
   * makes the `'executed'` verdict a *bounded lookback* rather than permanent suppression: a proposal
   * executed longer ago than the lifetime cap is only reported once it has been observed and
   * memoized in-process (memo is lost on restart).
   */
  public async getPayloadProposalStatus(payload: Hex): Promise<PayloadProposalStatus> {
    const target = payload.toLowerCase() as Hex;

    const proposalCount = await this.getProposalCount();
    if (proposalCount === 0n) {
      return this.executedPayloads.has(target) ? 'executed' : 'none';
    }

    // Anything created before this cutoff is guaranteed terminal regardless of its frozen config.
    const block = await this.client.getBlock();
    const hardCutoff = block.timestamp - MAX_PROPOSAL_LIFETIME_SECONDS;

    let sawExecuted = false;

    // Proposals are append-only with monotonically non-decreasing creation timestamps, so iterating
    // from newest -> oldest lets us early-stop as soon as we cross the lifetime cutoff.
    for (let id = proposalCount - 1n; id >= 0n; id--) {
      const proposal = await this.getProposal(id);

      // Hard early-stop: every older proposal is also older than the cutoff and therefore terminal.
      if (proposal.creation < hardCutoff) {
        break;
      }

      const proposalPayload = proposal.payload.toString().toLowerCase();
      const original = await this.getOriginalPayload(proposal.payload);
      const matches = proposalPayload === target || (original !== undefined && original.toLowerCase() === target);
      if (!matches) {
        continue;
      }

      // A live or Droppable proposal blocks re-signalling and wins over any executed one.
      if (LIVE_PROPOSAL_STATES.has(proposal.state) || proposal.state === ProposalState.Droppable) {
        return 'live';
      }

      if (proposal.state === ProposalState.Executed) {
        sawExecuted = true;
        this.executedPayloads.add(target);
      }
      // Rejected/Dropped/Expired proposals allow re-proposing the same payload; keep scanning.
    }

    if (sawExecuted || this.executedPayloads.has(target)) {
      return 'executed';
    }
    return 'none';
  }

  /**
   * Resolves the original payload behind a `GSEPayload` wrapper. Returns `undefined` if the
   * wrapper does not implement `IProposerPayload.getOriginalPayload` (e.g. proposals created via
   * `Governance.proposeWithLock`, which bypass GSEPayload entirely and store the raw `IPayload`
   * directly). Results are memoized indefinitely because deployed wrapper bytecode is immutable.
   */
  private async getOriginalPayload(wrapper: EthAddress): Promise<Hex | undefined> {
    const key = wrapper.toString();
    if (this.originalPayloadCache.has(key)) {
      return this.originalPayloadCache.get(key);
    }
    let original: Hex | undefined;
    try {
      original = await this.client.readContract({
        address: key,
        abi: ProposerPayloadAbi,
        functionName: 'getOriginalPayload',
      });
    } catch {
      original = undefined;
    }
    this.originalPayloadCache.set(key, original);
    return original;
  }

  public async awaitProposalActive({ proposalId, logger }: { proposalId: bigint; logger: Logger }) {
    const state = await this.getProposalState(proposalId);
    if (state === ProposalState.Active) {
      return;
    } else if (state !== ProposalState.Pending) {
      throw new Error(`Proposal ${proposalId} is in state [${state}]: it will never be active`);
    } else {
      const proposal = await this.getProposal(proposalId);
      const startOfActive = proposal.creation + proposal.config.votingDelay;
      const block = await this.client.getBlock();
      // Add 12 seconds to the time to make sure we don't vote too early
      const secondsToActive = Number(startOfActive - block.timestamp) + 12;
      const now = new Date();
      logger.info(`
        The time is ${now.toISOString()}.
        The proposal will be active at ${new Date(Number(startOfActive) * 1000).toISOString()}.
        Waiting ${secondsToActive} seconds for proposal to be active.
        `);
      await sleep(secondsToActive * 1000);
    }
  }

  public async awaitProposalExecutable({ proposalId, logger }: { proposalId: bigint; logger: Logger }) {
    const state = await this.getProposalState(proposalId);
    if (state === ProposalState.Executable) {
      return;
    } else if (
      ![ProposalState.Pending, ProposalState.Active, ProposalState.Queued, ProposalState.Executable].includes(state)
    ) {
      throw new Error(`Proposal ${proposalId} is in state [${state}]: it will never be executable`);
    } else {
      const proposal = await this.getProposal(proposalId);
      const startOfExecutable =
        proposal.creation +
        proposal.config.votingDelay +
        proposal.config.votingDuration +
        proposal.config.executionDelay;
      const block = await this.client.getBlock();
      const secondsToExecutable = Number(startOfExecutable - block.timestamp) + 12;
      const now = new Date();
      logger.info(`
        The time is ${now.toISOString()}.
        The proposal will be executable at ${new Date(Number(startOfExecutable) * 1000).toISOString()}.
        Waiting ${secondsToExecutable} seconds for proposal to be executable.
        `);
      await sleep(secondsToExecutable * 1000);
    }
  }
}

export class GovernanceContract extends ReadOnlyGovernanceContract {
  protected override readonly governanceContract: GetContractReturnType<typeof GovernanceAbi, ExtendedViemWalletClient>;

  constructor(
    address: Hex | EthAddress,
    public override readonly client: ExtendedViemWalletClient,
  ) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    super(address, client);
    if (!isExtendedClient(client)) {
      throw new Error('GovernanceContract has to be instantiated with a wallet client.');
    }
    this.governanceContract = getContract({ address, abi: GovernanceAbi, client });
  }

  public async deposit(onBehalfOf: Hex, amount: bigint) {
    const depositTx = await this.governanceContract.write.deposit([onBehalfOf, amount]);
    await this.client.waitForTransactionReceipt({ hash: depositTx });
  }

  public async proposeWithLock({
    payloadAddress,
    withdrawAddress,
  }: {
    payloadAddress: Hex;
    withdrawAddress: Hex;
  }): Promise<bigint> {
    const proposeTx = await this.governanceContract.write.proposeWithLock([payloadAddress, withdrawAddress]);
    const receipt = await this.client.waitForTransactionReceipt({ hash: proposeTx });
    if (receipt.status !== 'success') {
      throw new Error(`Proposal failed: ${receipt.status}`);
    }
    return extractProposalIdFromLogs(receipt.logs);
  }

  public async getPower(): Promise<bigint> {
    const now = await this.client.getBlock();
    return this.governanceContract.read.powerAt([this.client.account.address, now.timestamp]);
  }

  /** Returns the user's voting power for a specific proposal, checked at pendingThrough timestamp. */
  public async getPowerForProposal(proposalId: bigint): Promise<bigint> {
    const proposal = await this.getProposal(proposalId);
    const pendingThrough = proposal.creation + proposal.config.votingDelay;
    return this.governanceContract.read.powerAt([this.client.account.address, pendingThrough]);
  }

  public async vote({
    proposalId,
    voteAmount,
    inFavor,
    retries = 10,
    logger,
  }: {
    proposalId: bigint;
    voteAmount: bigint | undefined;
    inFavor: boolean;
    retries: number;
    logger: Logger;
  }) {
    const l1TxUtils = createL1TxUtils(this.client, { logger });
    const retryDelaySeconds = 12;

    voteAmount = voteAmount ?? (await this.getPowerForProposal(proposalId));

    let success = false;
    for (let i = 0; i < retries; i++) {
      try {
        const voteFunctionData: EncodeFunctionDataParameters<typeof GovernanceAbi, 'vote'> = {
          abi: GovernanceAbi,
          functionName: 'vote',
          args: [proposalId, voteAmount, inFavor],
        };
        const encodedVoteData = encodeFunctionData(voteFunctionData);

        const { receipt } = await l1TxUtils.sendAndMonitorTransaction({
          to: this.governanceContract.address,
          abi: GovernanceAbi,
          data: encodedVoteData,
        });

        if (receipt.status === 'success') {
          success = true;
          break;
        } else {
          const args = {
            ...voteFunctionData,
            address: this.governanceContract.address,
          };
          const errorMsg = await l1TxUtils.tryGetErrorFromRevertedTx(encodedVoteData, args, undefined, []);
          logger.error(`Error voting on proposal ${proposalId}: ${errorMsg}`);
        }
      } catch (error) {
        logger.error(`Error voting on proposal ${proposalId}: ${error}`);
      }

      logger.info(`Retrying vote on proposal ${proposalId} in ${retryDelaySeconds} seconds`);
      await sleep(retryDelaySeconds * 1000);
    }
    if (!success) {
      throw new Error(`Failed to vote on proposal ${proposalId} after ${retries} retries`);
    }
    logger.info(`Voted [${inFavor ? 'yea' : 'nay'}] on proposal [${proposalId}]`);
    const proposal = await this.getProposal(proposalId);
    logger.info(`Proposal [${proposalId}] has cached state [${proposal.cachedState}]`);
    logger.info(`Proposal [${proposalId}] has summedBallot yea [${proposal.summedBallot.yea}]`);
    logger.info(`Proposal [${proposalId}] has summedBallot nay [${proposal.summedBallot.nay}]`);
  }

  public async executeProposal({
    proposalId,
    retries = 10,
    logger,
  }: {
    proposalId: bigint;
    retries: number;
    logger: Logger;
  }) {
    const l1TxUtils = createL1TxUtils(this.client, { logger });
    const retryDelaySeconds = 12;
    let success = false;
    for (let i = 0; i < retries; i++) {
      try {
        const executeFunctionData: EncodeFunctionDataParameters<typeof GovernanceAbi, 'execute'> = {
          abi: GovernanceAbi,
          functionName: 'execute',
          args: [proposalId],
        };
        const encodedExecuteData = encodeFunctionData(executeFunctionData);

        const { receipt } = await l1TxUtils.sendAndMonitorTransaction({
          to: this.governanceContract.address,
          abi: GovernanceAbi,
          data: encodedExecuteData,
        });

        if (receipt.status === 'success') {
          success = true;
          break;
        } else {
          const args = {
            ...executeFunctionData,
            address: this.governanceContract.address,
          };
          const errorMsg = await l1TxUtils.tryGetErrorFromRevertedTx(encodedExecuteData, args, undefined, []);
          logger.error(`Error executing proposal ${proposalId}: ${errorMsg}`);
        }
      } catch (error) {
        logger.error(`Error executing proposal ${proposalId}: ${error}`);
      }

      logger.info(`Retrying execute proposal ${proposalId} in ${retryDelaySeconds} seconds`);
      await sleep(retryDelaySeconds * 1000);
    }
    if (!success) {
      throw new Error(`Failed to execute proposal ${proposalId} after ${retries} retries`);
    } else {
      logger.info(`Executed proposal ${proposalId}`);
    }
  }
}
