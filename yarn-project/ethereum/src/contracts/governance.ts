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
import { L1TxUtils } from '../l1_tx_utils.js';
import { type ExtendedViemWalletClient, type ViemClient, isExtendedClient } from '../types.js';

export type L1GovernanceContractAddresses = Pick<
  L1ContractAddresses,
  'governanceAddress' | 'rollupAddress' | 'registryAddress' | 'governanceProposerAddress'
>;

// NOTE: Must be kept in sync with DataStructures.ProposalState in l1-contracts
export enum ProposalState {
  Pending,
  Active,
  Queued,
  Executable,
  Rejected,
  Executed,
  Dropped,
  Expired,
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

  public getConfiguration() {
    return this.governanceContract.read.getConfiguration();
  }

  public getProposal(proposalId: bigint) {
    return this.governanceContract.read.getProposal([proposalId]);
  }

  public async getProposalState(proposalId: bigint): Promise<ProposalState> {
    const state = await this.governanceContract.read.getProposalState([proposalId]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (state < 0 || state > ProposalState.Expired) {
      throw new Error(`Invalid proposal state: ${state}`);
    }
    return state as ProposalState;
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
    address: Hex,
    public override readonly client: ExtendedViemWalletClient,
  ) {
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
    const l1TxUtils = new L1TxUtils(this.client, logger);
    const retryDelaySeconds = 12;

    voteAmount = voteAmount ?? (await this.getPower());

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
    logger.info(`Proposal [${proposalId}] has state [${proposal.state}]`);
    logger.info(`Proposal [${proposalId}] has summedBallot yea [${proposal.summedBallot.yea}]`);
    logger.info(`Proposal [${proposalId}] has summedBallot nea [${proposal.summedBallot.nea}]`);
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
    const l1TxUtils = new L1TxUtils(this.client, logger);
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
