import {
  FeeJuiceContract,
  GovernanceContract,
  ProposalState,
  RegistryContract,
  createEthereumChain,
  createExtendedL1Client,
} from '@aztec/ethereum';
import type { LogFn, Logger } from '@aztec/foundation/log';

export async function depositGovernanceTokens({
  registryAddress,
  rpcUrls,
  chainId,
  privateKey,
  mnemonic,
  mnemonicIndex,
  recipient,
  amount,
  debugLogger,
  mint,
}: {
  registryAddress: `0x${string}`;
  rpcUrls: string[];
  chainId: number;
  privateKey: string | undefined;
  mnemonic: string;
  mnemonicIndex: number;
  recipient: `0x${string}`;
  amount: bigint;
  debugLogger: Logger;
  mint: boolean;
}) {
  debugLogger.info(`Depositing ${amount} governance tokens to ${recipient}`);
  const chain = createEthereumChain(rpcUrls, chainId);
  const extendedClient = createExtendedL1Client(
    rpcUrls,
    privateKey ?? mnemonic,
    chain.chainInfo,
    undefined,
    mnemonicIndex,
  );

  const addresses = await RegistryContract.collectAddresses(extendedClient, registryAddress, 'canonical');
  const governanceAddress = addresses.governanceAddress.toString();
  const tokenAddress = addresses.stakingAssetAddress.toString();

  const feeJuice = new FeeJuiceContract(tokenAddress, extendedClient);
  const governance = new GovernanceContract(governanceAddress, extendedClient);
  if (mint) {
    await feeJuice.mint(recipient, amount);
    debugLogger.info(`Minted ${amount} tokens to ${recipient}`);
  }

  await feeJuice.approve(governanceAddress, amount);
  debugLogger.info(`Approved ${amount} tokens for governance`);

  await governance.deposit(recipient, amount);
  debugLogger.info(`Deposited ${amount} tokens to ${recipient}`);
}

export async function proposeWithLock({
  payloadAddress,
  registryAddress,
  rpcUrls,
  chainId,
  privateKey,
  mnemonic,
  mnemonicIndex,
  json,
  debugLogger,
  log,
}: {
  payloadAddress: `0x${string}`;
  registryAddress: `0x${string}`;
  rpcUrls: string[];
  chainId: number;
  privateKey: string | undefined;
  mnemonic: string;
  mnemonicIndex: number;
  debugLogger: Logger;
  log: LogFn;
  json: boolean;
}) {
  debugLogger.info(`Proposing with lock from ${payloadAddress} to ${registryAddress}`);
  const chain = createEthereumChain(rpcUrls, chainId);
  const client = createExtendedL1Client(rpcUrls, privateKey ?? mnemonic, chain.chainInfo, undefined, mnemonicIndex);

  const addresses = await RegistryContract.collectAddresses(client, registryAddress, 'canonical');
  const governanceAddress = addresses.governanceAddress.toString();

  const governance = new GovernanceContract(governanceAddress, client);

  const proposalId = await governance.proposeWithLock({
    payloadAddress,
    withdrawAddress: client.account.address,
  });
  if (json) {
    log(JSON.stringify({ proposalId: Number(proposalId) }, null, 2));
  } else {
    log(`Proposed with lock`);
    log(`Proposal ID: ${proposalId}`);
  }
}

export async function voteOnGovernanceProposal({
  proposalId,
  voteAmount,
  inFavor,
  waitTilActive,
  registryAddress,
  rpcUrls,
  chainId,
  privateKey,
  mnemonic,
  mnemonicIndex,
  debugLogger,
}: {
  proposalId: bigint;
  voteAmount: bigint | undefined;
  inFavor: boolean;
  waitTilActive: boolean;
  registryAddress: `0x${string}`;
  rpcUrls: string[];
  chainId: number;
  privateKey: string | undefined;
  mnemonic: string;
  mnemonicIndex: number;
  debugLogger: Logger;
}) {
  debugLogger.info(
    `Voting on proposal ${proposalId} with ${voteAmount ? voteAmount : 'all'} tokens in favor: ${inFavor}`,
  );
  const chain = createEthereumChain(rpcUrls, chainId);
  const client = createExtendedL1Client(rpcUrls, privateKey ?? mnemonic, chain.chainInfo, undefined, mnemonicIndex);

  const addresses = await RegistryContract.collectAddresses(client, registryAddress, 'canonical');
  const governanceAddress = addresses.governanceAddress.toString();

  const governance = new GovernanceContract(governanceAddress, client);
  const state = await governance.getProposalState(proposalId);
  if (state !== ProposalState.Active && !waitTilActive) {
    debugLogger.warn(`Proposal is not active, but waitTilActive is false. Not voting.`);
    return;
  }

  await governance.awaitProposalActive({ proposalId, logger: debugLogger });
  await governance.vote({ proposalId, voteAmount, inFavor, retries: 10, logger: debugLogger });
}

export async function executeGovernanceProposal({
  proposalId,
  waitTilExecutable,
  registryAddress,
  rpcUrls,
  chainId,
  privateKey,
  mnemonic,
  mnemonicIndex,
  debugLogger,
}: {
  proposalId: bigint;
  waitTilExecutable: boolean;
  registryAddress: `0x${string}`;
  rpcUrls: string[];
  chainId: number;
  privateKey: string | undefined;
  mnemonic: string;
  mnemonicIndex: number;
  debugLogger: Logger;
}) {
  debugLogger.info(`Executing proposal ${proposalId}`);
  const chain = createEthereumChain(rpcUrls, chainId);
  const client = createExtendedL1Client(rpcUrls, privateKey ?? mnemonic, chain.chainInfo, undefined, mnemonicIndex);

  const addresses = await RegistryContract.collectAddresses(client, registryAddress, 'canonical');
  const governanceAddress = addresses.governanceAddress.toString();

  const governance = new GovernanceContract(governanceAddress, client);
  const state = await governance.getProposalState(proposalId);
  if (state !== ProposalState.Executable && !waitTilExecutable) {
    debugLogger.warn(`Proposal is not executable, but waitTilExecutable is false. Not executing.`);
    return;
  }

  await governance.awaitProposalExecutable({ proposalId, logger: debugLogger });
  await governance.executeProposal({ proposalId, retries: 10, logger: debugLogger });
}
