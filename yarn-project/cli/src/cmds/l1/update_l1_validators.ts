import { EthCheatCodes } from '@aztec/aztec.js';
import { type EthAddress } from '@aztec/circuits.js';
import { createEthereumChain } from '@aztec/ethereum';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import { createPublicClient, createWalletClient, getContract, http } from 'viem';
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

export interface RollupCommandArgs {
  rpcUrl: string;
  chainId: number;
  privateKey: string | undefined;
  mnemonic: string;
  rollupAddress: EthAddress;
}

export interface LoggerArgs {
  log: LogFn;
  debugLogger: DebugLogger;
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
  log,
  debugLogger,
}: RollupCommandArgs & LoggerArgs & { validatorAddress: EthAddress }) {
  const dualLog = makeDualLog(log, debugLogger);
  const { walletClient, publicClient } = getL1Clients(rpcUrl, chainId, privateKey, mnemonic);
  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: walletClient,
  });

  dualLog(`Adding validator ${validatorAddress.toString()} to rollup ${rollupAddress.toString()}`);
  const txHash = await rollup.write.addValidator([validatorAddress.toString()]);
  dualLog(`Transaction hash: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}

export async function fastForwardEpochs({
  rpcUrl,
  chainId,
  privateKey,
  mnemonic,
  rollupAddress,
  numEpochs,
  log,
  debugLogger,
}: RollupCommandArgs & LoggerArgs & { numEpochs: bigint }) {
  const dualLog = makeDualLog(log, debugLogger);
  const { walletClient } = getL1Clients(rpcUrl, chainId, privateKey, mnemonic);
  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: walletClient,
  });

  const cheatCodes = new EthCheatCodes(rpcUrl, debugLogger);
  const genesisTs = await rollup.read.GENESIS_TIME();
  const slotsInEpoch = await rollup.read.EPOCH_DURATION();
  const slotDuration = await rollup.read.SLOT_DURATION();
  const epochDuration = slotsInEpoch * slotDuration;
  const warpTime = genesisTs + numEpochs * epochDuration;
  await cheatCodes.warp(Number(warpTime));
  dualLog(`Fast forwarded ${numEpochs} epochs to ${warpTime}`);
}

function makeDualLog(log: LogFn, debugLogger: DebugLogger) {
  return (msg: string) => {
    log(msg);
    debugLogger.info(msg);
  };
}

function getL1Clients(rpcUrl: string, chainId: number, privateKey: string | undefined, mnemonic: string) {
  const chain = createEthereumChain(rpcUrl, chainId);
  const account = !privateKey
    ? mnemonicToAccount(mnemonic!)
    : privateKeyToAccount(`${privateKey.startsWith('0x') ? '' : '0x'}${privateKey}` as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: chain.chainInfo, transport: http(rpcUrl) });
  const publicClient = createPublicClient({ chain: chain.chainInfo, transport: http(rpcUrl) });
  return {
    walletClient,
    publicClient,
  };
}
