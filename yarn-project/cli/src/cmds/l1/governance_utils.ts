import {
  FeeJuiceContract,
  GovernanceContract,
  ProposalState,
  RegistryContract,
  createEthereumChain,
  createL1Clients,
} from '@aztec/ethereum';
import type { Logger } from '@aztec/foundation/log';

export async function depositGovernanceTokens({
  registryAddress,
  rpcUrl,
  chainId,
  privateKey,
  mnemonic,
  mnemonicIndex,
  recipient,
  amount,
  logger,
  mint,
}: {
  registryAddress: `0x${string}`;
  rpcUrl: string;
  chainId: number;
  privateKey: string | undefined;
  mnemonic: string;
  mnemonicIndex: number;
  recipient: `0x${string}`;
  amount: bigint;
  logger: Logger;
  mint: boolean;
}) {
  logger.info(`Depositing ${amount} governance tokens to ${recipient}`);
  const chain = createEthereumChain(rpcUrl, chainId);
  const { publicClient, walletClient } = createL1Clients(
    rpcUrl,
    privateKey ?? mnemonic,
    chain.chainInfo,
    mnemonicIndex,
  );

  const addresses = await RegistryContract.collectAddresses(publicClient, registryAddress, 'canonical');
  const governanceAddress = addresses.governanceAddress.toString();
  const tokenAddress = addresses.feeJuiceAddress.toString();

  const feeJuice = new FeeJuiceContract(tokenAddress, publicClient, walletClient);
  const governance = new GovernanceContract(governanceAddress, publicClient, walletClient);
  if (mint) {
    await feeJuice.mint(recipient, amount);
    logger.info(`Minted ${amount} tokens to ${recipient}`);
  }

  await feeJuice.approve(governanceAddress, amount);
  logger.info(`Approved ${amount} tokens for governance`);

  await governance.deposit(recipient, amount);
  logger.info(`Deposited ${amount} tokens to ${recipient}`);
}

export async function proposeWithLock({
  payloadAddress,
  registryAddress,
  rpcUrl,
  chainId,
  privateKey,
  mnemonic,
  mnemonicIndex,
  logger,
}: {
  payloadAddress: `0x${string}`;
  registryAddress: `0x${string}`;
  rpcUrl: string;
  chainId: number;
  privateKey: string | undefined;
  mnemonic: string;
  mnemonicIndex: number;
  logger: Logger;
}) {
  logger.info(`Proposing with lock from ${payloadAddress} to ${registryAddress}`);
  const chain = createEthereumChain(rpcUrl, chainId);
  const clients = createL1Clients(rpcUrl, privateKey ?? mnemonic, chain.chainInfo, mnemonicIndex);

  const addresses = await RegistryContract.collectAddresses(clients.publicClient, registryAddress, 'canonical');
  const governanceAddress = addresses.governanceAddress.toString();

  const governance = new GovernanceContract(governanceAddress, clients.publicClient, clients.walletClient);

  const receipt = await governance.proposeWithLock({
    payloadAddress,
    withdrawAddress: clients.walletClient.account.address,
  });
  logger.info(`Proposed with lock`);
  logger.info('Receipt Logs', receipt.logs);
}

export async function voteOnGovernanceProposal({
  proposalId,
  voteAmount,
  inFavor,
  waitTilActive,
  registryAddress,
  rpcUrl,
  chainId,
  privateKey,
  mnemonic,
  mnemonicIndex,
  logger,
}: {
  proposalId: bigint;
  voteAmount: bigint | undefined;
  inFavor: boolean;
  waitTilActive: boolean;
  registryAddress: `0x${string}`;
  rpcUrl: string;
  chainId: number;
  privateKey: string | undefined;
  mnemonic: string;
  mnemonicIndex: number;
  logger: Logger;
}) {
  logger.info(`Voting on proposal ${proposalId} with ${voteAmount ? voteAmount : 'all'} tokens in favor: ${inFavor}`);
  const chain = createEthereumChain(rpcUrl, chainId);
  const clients = createL1Clients(rpcUrl, privateKey ?? mnemonic, chain.chainInfo, mnemonicIndex);

  const addresses = await RegistryContract.collectAddresses(clients.publicClient, registryAddress, 'canonical');
  const governanceAddress = addresses.governanceAddress.toString();

  const governance = new GovernanceContract(governanceAddress, clients.publicClient, clients.walletClient);
  const state = await governance.getProposalState(proposalId);
  if (state !== ProposalState.Active && !waitTilActive) {
    logger.warn(`Proposal is not active, but waitTilActive is false. Not voting.`);
    return;
  }

  await governance.awaitProposalActive({ proposalId, logger });
  await governance.vote({ proposalId, voteAmount, inFavor, retries: 10, logger });
}

export async function executeGovernanceProposal({
  proposalId,
  waitTilExecutable,
  registryAddress,
  rpcUrl,
  chainId,
  privateKey,
  mnemonic,
  mnemonicIndex,
  logger,
}: {
  proposalId: bigint;
  waitTilExecutable: boolean;
  registryAddress: `0x${string}`;
  rpcUrl: string;
  chainId: number;
  privateKey: string | undefined;
  mnemonic: string;
  mnemonicIndex: number;
  logger: Logger;
}) {
  logger.info(`Executing proposal ${proposalId}`);
  const chain = createEthereumChain(rpcUrl, chainId);
  const clients = createL1Clients(rpcUrl, privateKey ?? mnemonic, chain.chainInfo, mnemonicIndex);

  const addresses = await RegistryContract.collectAddresses(clients.publicClient, registryAddress, 'canonical');
  const governanceAddress = addresses.governanceAddress.toString();

  const governance = new GovernanceContract(governanceAddress, clients.publicClient, clients.walletClient);
  const state = await governance.getProposalState(proposalId);
  if (state !== ProposalState.Executable && !waitTilExecutable) {
    logger.warn(`Proposal is not executable, but waitTilExecutable is false. Not executing.`);
    return;
  }

  await governance.awaitProposalExecutable({ proposalId, logger });
  await governance.executeProposal({ proposalId, retries: 10, logger });
}
