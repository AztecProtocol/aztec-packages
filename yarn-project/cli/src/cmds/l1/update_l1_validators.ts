import { EthCheatCodes } from '@aztec/aztec.js';
import { type EthAddress } from '@aztec/circuits.js';
import { createEthereumChain, getL1ContractsConfigEnvVars, isAnvilTestChain } from '@aztec/ethereum';
import { type LogFn, type Logger } from '@aztec/foundation/log';
import { RollupAbi, TestERC20Abi } from '@aztec/l1-artifacts';

import { createPublicClient, createWalletClient, getContract, http } from 'viem';
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

export interface RollupCommandArgs {
  rpcUrl: string;
  chainId: number;
  privateKey?: string;
  mnemonic?: string;
  rollupAddress: EthAddress;
  withdrawerAddress: EthAddress;
}

export interface LoggerArgs {
  log: LogFn;
  debugLogger: Logger;
}

export function generateL1Account() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  account.address;
  return {
    privateKey,
    address: account.address,
  };
}

export async function addL1Validator({
  rpcUrl,
  chainId,
  privateKey,
  mnemonic,
  validatorAddress,
  rollupAddress,
  withdrawerAddress,
  log,
  debugLogger,
}: RollupCommandArgs & LoggerArgs & { validatorAddress: EthAddress }) {
  const config = getL1ContractsConfigEnvVars();
  const dualLog = makeDualLog(log, debugLogger);
  const publicClient = getPublicClient(rpcUrl, chainId);
  const walletClient = getWalletClient(rpcUrl, chainId, privateKey, mnemonic);
  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: walletClient,
  });

  const stakingAsset = getContract({
    address: await rollup.read.STAKING_ASSET(),
    abi: TestERC20Abi,
    client: walletClient,
  });

  await Promise.all(
    [
      await stakingAsset.write.mint([walletClient.account.address, config.minimumStake], {} as any),
      await stakingAsset.write.approve([rollupAddress.toString(), config.minimumStake], {} as any),
    ].map(txHash => publicClient.waitForTransactionReceipt({ hash: txHash })),
  );

  dualLog(`Adding validator ${validatorAddress.toString()} to rollup ${rollupAddress.toString()}`);
  const txHash = await rollup.write.deposit([
    validatorAddress.toString(),
    validatorAddress.toString(),
    withdrawerAddress.toString(),
    config.minimumStake,
  ]);
  dualLog(`Transaction hash: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  if (isAnvilTestChain(chainId)) {
    dualLog(`Funding validator on L1`);
    const cheatCodes = new EthCheatCodes(rpcUrl, debugLogger);
    await cheatCodes.setBalance(validatorAddress, 10n ** 20n);
  } else {
    const balance = await publicClient.getBalance({ address: validatorAddress.toString() });
    const balanceInEth = Number(balance) / 10 ** 18;
    dualLog(`Validator balance: ${balanceInEth.toFixed(6)} ETH`);
    if (balanceInEth === 0) {
      dualLog(`WARNING: Validator has no balance. Remember to fund it!`);
    }
  }
}

export async function removeL1Validator({
  rpcUrl,
  chainId,
  privateKey,
  mnemonic,
  validatorAddress,
  rollupAddress,
  log,
  debugLogger,
}: RollupCommandArgs & LoggerArgs & { validatorAddress: EthAddress }) {
  const dualLog = makeDualLog(log, debugLogger);
  const publicClient = getPublicClient(rpcUrl, chainId);
  const walletClient = getWalletClient(rpcUrl, chainId, privateKey, mnemonic);
  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: walletClient,
  });

  dualLog(`Removing validator ${validatorAddress.toString()} from rollup ${rollupAddress.toString()}`);
  const txHash = await rollup.write.initiateWithdraw([validatorAddress.toString(), validatorAddress.toString()]);
  dualLog(`Transaction hash: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

export async function pruneRollup({
  rpcUrl,
  chainId,
  privateKey,
  mnemonic,
  rollupAddress,
  log,
  debugLogger,
}: RollupCommandArgs & LoggerArgs) {
  const dualLog = makeDualLog(log, debugLogger);
  const publicClient = getPublicClient(rpcUrl, chainId);
  const walletClient = getWalletClient(rpcUrl, chainId, privateKey, mnemonic);
  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: walletClient,
  });

  dualLog(`Trying prune`);
  const txHash = await rollup.write.prune();
  dualLog(`Transaction hash: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

export async function fastForwardEpochs({
  rpcUrl,
  chainId,
  rollupAddress,
  numEpochs,
  log,
  debugLogger,
}: RollupCommandArgs & LoggerArgs & { numEpochs: bigint }) {
  const dualLog = makeDualLog(log, debugLogger);
  const publicClient = getPublicClient(rpcUrl, chainId);
  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: publicClient,
  });

  const cheatCodes = new EthCheatCodes(rpcUrl, debugLogger);
  const currentSlot = await rollup.read.getCurrentSlot();
  const l2SlotsInEpoch = await rollup.read.EPOCH_DURATION();
  const timestamp = await rollup.read.getTimestampForSlot([currentSlot + l2SlotsInEpoch * numEpochs]);
  dualLog(`Fast forwarding ${numEpochs} epochs to ${timestamp}`);
  try {
    await cheatCodes.warp(Number(timestamp));
    dualLog(`Fast forwarded ${numEpochs} epochs to ${timestamp}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("is lower than or equal to previous block's timestamp")) {
      dualLog(`Someone else fast forwarded the chain to a point after/equal to the target time`);
    } else {
      // Re-throw other errors
      throw error;
    }
  }
}

export async function debugRollup({ rpcUrl, chainId, rollupAddress, log }: RollupCommandArgs & LoggerArgs) {
  const config = getL1ContractsConfigEnvVars();
  const publicClient = getPublicClient(rpcUrl, chainId);
  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: publicClient,
  });

  const pendingNum = await rollup.read.getPendingBlockNumber();
  log(`Pending block num: ${pendingNum}`);
  const provenNum = await rollup.read.getProvenBlockNumber();
  log(`Proven block num: ${provenNum}`);
  const validators = await rollup.read.getAttesters();
  log(`Validators: ${validators.map(v => v.toString()).join(', ')}`);
  const committee = await rollup.read.getCurrentEpochCommittee();
  log(`Committee: ${committee.map(v => v.toString()).join(', ')}`);
  const archive = await rollup.read.archive();
  log(`Archive: ${archive}`);
  const epochNum = await rollup.read.getCurrentEpoch();
  log(`Current epoch: ${epochNum}`);
  const slot = await rollup.read.getCurrentSlot();
  log(`Current slot: ${slot}`);
  const proposerDuringPrevL1Block = await rollup.read.getCurrentProposer();
  log(`Proposer during previous L1 block: ${proposerDuringPrevL1Block}`);
  const nextBlockTS = BigInt((await publicClient.getBlock()).timestamp + BigInt(config.ethereumSlotDuration));
  const proposer = await rollup.read.getProposerAt([nextBlockTS]);
  log(`Proposer NOW: ${proposer.toString()}`);
}

function makeDualLog(log: LogFn, debugLogger: Logger) {
  return (msg: string) => {
    log(msg);
    debugLogger.info(msg);
  };
}

function getPublicClient(rpcUrl: string, chainId: number) {
  const chain = createEthereumChain(rpcUrl, chainId);
  return createPublicClient({ chain: chain.chainInfo, transport: http(rpcUrl) });
}

function getWalletClient(
  rpcUrl: string,
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string | undefined,
) {
  if (!privateKey && !mnemonic) {
    throw new Error('Either privateKey or mnemonic must be provided to create a wallet client');
  }

  const chain = createEthereumChain(rpcUrl, chainId);
  const account = !privateKey
    ? mnemonicToAccount(mnemonic!)
    : privateKeyToAccount(`${privateKey.startsWith('0x') ? '' : '0x'}${privateKey}` as `0x${string}`);
  return createWalletClient({ account, chain: chain.chainInfo, transport: http(rpcUrl) });
}
