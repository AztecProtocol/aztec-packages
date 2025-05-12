import type { Logger } from '@aztec/foundation/log';
import { GovernanceAbi } from '@aztec/l1-artifacts/GovernanceAbi';
import { TestERC20Abi as StakingAssetAbi } from '@aztec/l1-artifacts/TestERC20Abi';

import { type GetContractReturnType, type PrivateKeyAccount, getContract } from 'viem';

import { extractProposalIdFromLogs } from '../contracts/governance.js';
import { EthCheatCodes } from '../eth_cheat_codes.js';
import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import { L1TxUtils } from '../l1_tx_utils.js';
import type { ExtendedViemWalletClient, ViemPublicClient } from '../types.js';

export async function executeGovernanceProposal(
  proposalId: bigint,
  governance: GetContractReturnType<typeof GovernanceAbi, ViemPublicClient>,
  voteAmount: bigint,
  privateKey: PrivateKeyAccount,
  l1Client: ExtendedViemWalletClient,
  rpcUrls: string[],
  logger: Logger,
) {
  const proposal = await governance.read.getProposal([proposalId]);

  const l1TxUtils = new L1TxUtils(l1Client);

  const waitL1Block = async () => {
    await l1TxUtils.sendAndMonitorTransaction({
      to: l1Client.account.address,
      value: 1n,
    });
  };

  const cheatCodes = new EthCheatCodes(rpcUrls, logger);

  const timeToActive = proposal.creation + proposal.config.votingDelay;
  logger.info(`Warping to ${timeToActive + 1n}`);
  await cheatCodes.warp(Number(timeToActive + 1n));
  logger.info(`Warped to ${timeToActive + 1n}`);
  await waitL1Block();

  logger.info(`Voting`);
  const voteTx = await governance.write.vote([proposalId, voteAmount, true], { account: privateKey });
  await l1Client.waitForTransactionReceipt({ hash: voteTx });
  logger.info(`Voted`);

  const timeToExecutable = timeToActive + proposal.config.votingDuration + proposal.config.executionDelay + 1n;
  logger.info(`Warping to ${timeToExecutable}`);
  await cheatCodes.warp(Number(timeToExecutable));
  logger.info(`Warped to ${timeToExecutable}`);
  await waitL1Block();

  const executeTx = await governance.write.execute([proposalId], { account: privateKey });
  await l1Client.waitForTransactionReceipt({ hash: executeTx });
  logger.info(`Executed proposal`);
}

export async function createGovernanceProposal(
  payloadAddress: `0x${string}`,
  addresses: L1ContractAddresses,
  privateKey: PrivateKeyAccount,
  publicClient: ViemPublicClient,
  logger: Logger,
): Promise<{
  governance: GetContractReturnType<typeof GovernanceAbi, ViemPublicClient>;
  voteAmount: bigint;
  proposalId: bigint;
}> {
  const token = getContract({
    address: addresses.stakingAssetAddress.toString(),
    abi: StakingAssetAbi,
    client: publicClient,
  });

  const governance = getContract({
    address: addresses.governanceAddress.toString(),
    abi: GovernanceAbi,
    client: publicClient,
  });

  const lockAmount = 10000n * 10n ** 18n;
  const voteAmount = 10000n * 10n ** 18n;

  const mintTx = await token.write.mint([privateKey.address, lockAmount + voteAmount], { account: privateKey });
  await publicClient.waitForTransactionReceipt({ hash: mintTx });
  logger.info(`Minted tokens`);

  const approveTx = await token.write.approve([addresses.governanceAddress.toString(), lockAmount + voteAmount], {
    account: privateKey,
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  logger.info(`Approved tokens`);

  const depositTx = await governance.write.deposit([privateKey.address, lockAmount + voteAmount], {
    account: privateKey,
  });
  await publicClient.waitForTransactionReceipt({ hash: depositTx });
  logger.info(`Deposited tokens`);

  const proposeTx = await governance.write.proposeWithLock([payloadAddress, privateKey.address], {
    account: privateKey,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: proposeTx });
  logger.info(`Proposed upgrade`);

  const proposalId = extractProposalIdFromLogs(receipt.logs);

  return { governance, voteAmount, proposalId };
}
