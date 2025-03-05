import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { GovernanceAbi } from '@aztec/l1-artifacts';

import {
  type EncodeFunctionDataParameters,
  type GetContractReturnType,
  type Hex,
  encodeFunctionData,
  getContract,
} from 'viem';

import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import { L1TxUtils } from '../l1_tx_utils.js';
import type { ViemPublicClient, ViemWalletClient } from '../types.js';
import { GovernanceProposerContract } from './governance_proposer.js';

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

export class GovernanceContract {
  private readonly publicGovernance: GetContractReturnType<typeof GovernanceAbi, ViemPublicClient>;
  private readonly walletGovernance: GetContractReturnType<typeof GovernanceAbi, ViemWalletClient> | undefined;

  constructor(
    address: Hex,
    public readonly publicClient: ViemPublicClient,
    public readonly walletClient: ViemWalletClient | undefined,
  ) {
    this.publicGovernance = getContract({ address, abi: GovernanceAbi, client: publicClient });
    this.walletGovernance = walletClient
      ? getContract({ address, abi: GovernanceAbi, client: walletClient })
      : undefined;
  }

  public get address() {
    return EthAddress.fromString(this.publicGovernance.address);
  }

  public async getProposer() {
    const governanceProposerAddress = EthAddress.fromString(await this.publicGovernance.read.governanceProposer());
    return new GovernanceProposerContract(this.publicClient, governanceProposerAddress.toString());
  }

  public async getGovernanceAddresses(): Promise<L1GovernanceContractAddresses> {
    const governanceProposer = await this.getProposer();
    const [rollupAddress, registryAddress] = await Promise.all([
      governanceProposer.getRollupAddress(),
      governanceProposer.getRegistryAddress(),
    ]);
    return {
      governanceAddress: this.address,
      rollupAddress,
      registryAddress,
      governanceProposerAddress: governanceProposer.address,
    };
  }

  public getProposal(proposalId: bigint) {
    return this.publicGovernance.read.getProposal([proposalId]);
  }

  public async getProposalState(proposalId: bigint): Promise<ProposalState> {
    const state = await this.publicGovernance.read.getProposalState([proposalId]);
    if (state < 0 || state > ProposalState.Expired) {
      throw new Error(`Invalid proposal state: ${state}`);
    }
    return state as ProposalState;
  }

  private assertWalletGovernance(): NonNullable<typeof this.walletGovernance> {
    if (!this.walletGovernance) {
      throw new Error('Wallet client is required for this operation');
    }
    return this.walletGovernance;
  }

  public async deposit(onBehalfOf: Hex, amount: bigint) {
    const walletGovernance = this.assertWalletGovernance();
    const depositTx = await walletGovernance.write.deposit([onBehalfOf, amount]);
    await this.publicClient.waitForTransactionReceipt({ hash: depositTx });
  }

  public async proposeWithLock({
    payloadAddress,
    withdrawAddress,
  }: {
    payloadAddress: Hex;
    withdrawAddress: Hex;
  }): Promise<number> {
    const walletGovernance = this.assertWalletGovernance();
    const proposeTx = await walletGovernance.write.proposeWithLock([payloadAddress, withdrawAddress]);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: proposeTx });
    if (receipt.status !== 'success') {
      throw new Error(`Proposal failed: ${receipt.status}`);
    }

    const proposalId = Number(receipt.logs[1].topics[1]);
    return proposalId;
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
      const block = await this.publicClient.getBlock();
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
      const block = await this.publicClient.getBlock();
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

  public async getPower(): Promise<bigint> {
    const walletGovernance = this.assertWalletGovernance();
    const now = await this.publicClient.getBlock();
    return walletGovernance.read.powerAt([this.walletClient!.account.address, now.timestamp]);
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
    const walletGovernance = this.assertWalletGovernance();
    const l1TxUtils = new L1TxUtils(this.publicClient, this.walletClient!, logger);
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
          to: walletGovernance.address,
          data: encodedVoteData,
        });

        if (receipt.status === 'success') {
          success = true;
          break;
        } else {
          const args = {
            ...voteFunctionData,
            address: walletGovernance.address,
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
    const walletGovernance = this.assertWalletGovernance();
    const l1TxUtils = new L1TxUtils(this.publicClient, this.walletClient!, logger);
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
          to: walletGovernance.address,
          data: encodedExecuteData,
        });

        if (receipt.status === 'success') {
          success = true;
          break;
        } else {
          const args = {
            ...executeFunctionData,
            address: walletGovernance.address,
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
