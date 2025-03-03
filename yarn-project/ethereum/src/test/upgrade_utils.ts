import type { Logger } from '@aztec/foundation/log';
import { TestERC20Abi as FeeJuiceAbi } from '@aztec/l1-artifacts';
import { GovernanceAbi } from '@aztec/l1-artifacts/GovernanceAbi';

import { type GetContractReturnType, type PrivateKeyAccount, getContract } from 'viem';

import { EthCheatCodes } from '../eth_cheat_codes.js';
import type { L1ContractAddresses } from '../l1_contract_addresses.js';
import type { L1Clients } from '../types.js';

export async function executeGovernanceProposal(
  proposalId: bigint,
  governance: GetContractReturnType<typeof GovernanceAbi, L1Clients['publicClient']>,
  voteAmount: bigint,
  privateKey: PrivateKeyAccount,
  publicClient: L1Clients['publicClient'],
  walletClient: L1Clients['walletClient'],
  rpcUrls: string[],
  logger: Logger,
) {
  const proposal = await governance.read.getProposal([proposalId]);

  const waitL1Block = async () => {
    await publicClient.waitForTransactionReceipt({
      hash: await walletClient.sendTransaction({
        to: privateKey.address,
        value: 1n,
        account: privateKey,
      }),
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
  await publicClient.waitForTransactionReceipt({ hash: voteTx });
  logger.info(`Voted`);

  const timeToExecutable = timeToActive + proposal.config.votingDuration + proposal.config.executionDelay + 1n;
  logger.info(`Warping to ${timeToExecutable}`);
  await cheatCodes.warp(Number(timeToExecutable));
  logger.info(`Warped to ${timeToExecutable}`);
  await waitL1Block();

  const executeTx = await governance.write.execute([proposalId], { account: privateKey });
  await publicClient.waitForTransactionReceipt({ hash: executeTx });
  logger.info(`Executed proposal`);
}

export async function createGovernanceProposal(
  payloadAddress: `0x${string}`,
  addresses: L1ContractAddresses,
  privateKey: PrivateKeyAccount,
  publicClient: L1Clients['publicClient'],
  logger: Logger,
): Promise<{ governance: GetContractReturnType<typeof GovernanceAbi, L1Clients['publicClient']>; voteAmount: bigint }> {
  const token = getContract({
    address: addresses.feeJuiceAddress.toString(),
    abi: FeeJuiceAbi,
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

  await governance.write.proposeWithLock([payloadAddress, privateKey.address], {
    account: privateKey,
  });

  return { governance, voteAmount };
}
