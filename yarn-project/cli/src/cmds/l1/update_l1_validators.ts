import { EthCheatCodes } from '@aztec/aztec.js';
import { ETHEREUM_SLOT_DURATION, type EthAddress } from '@aztec/circuits.js';
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
  dualLog(`Funding validator on L1`);
  const cheatCodes = new EthCheatCodes(rpcUrl, debugLogger);
  await cheatCodes.setBalance(validatorAddress, 100000000000000000000n);
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
  const nowSeconds = BigInt(Math.floor(new Date().getTime() / 1000));
  const l2SlotsInEpoch = await rollup.read.EPOCH_DURATION();
  const l2SlotDurationSeconds = await rollup.read.SLOT_DURATION();
  const warpTimeSeconds = nowSeconds + l2SlotsInEpoch * l2SlotDurationSeconds * numEpochs;
  dualLog(`Fast forwarding ${numEpochs} epochs to ${warpTimeSeconds}`);
  try {
    await cheatCodes.warp(Number(warpTimeSeconds));
    dualLog(`Fast forwarded ${numEpochs} epochs to ${warpTimeSeconds}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("is lower than or equal to previous block's timestamp")) {
      dualLog(`Someone else fast forwarded the chain to a point after/equal to the target time`);
    } else {
      // Re-throw other errors
      throw error;
    }
  }
}

export async function debugRollup({
  rpcUrl,
  chainId,
  privateKey,
  mnemonic,
  rollupAddress,
  log,
}: RollupCommandArgs & LoggerArgs) {
  const { publicClient } = getL1Clients(rpcUrl, chainId, privateKey, mnemonic);
  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: publicClient,
  });

  const pendingCount = await rollup.read.pendingBlockCount();
  log(`Pending block count: ${pendingCount}`);
  const provenCount = await rollup.read.provenBlockCount();
  log(`Proven block count: ${provenCount}`);
  const validators = await rollup.read.getValidators();
  log(`Validators: ${validators.map(v => v.toString()).join(', ')}`);
  const committee = await rollup.read.getCurrentEpochCommittee();
  log(`Committee: ${committee.map(v => v.toString()).join(', ')}`);
  const archive = await rollup.read.archive();
  log(`Archive: ${archive}`);
  const epochNum = await rollup.read.getCurrentEpoch();
  log(`Current epoch: ${epochNum}`);
  const epoch = await rollup.read.epochs([epochNum]);
  log(`Epoch Sample Seed: ${epoch[0].toString()}, Next Seed: ${epoch[1].toString()}`);
  const slot = await rollup.read.getCurrentSlot();
  log(`Current slot: ${slot}`);
  const proposerDuringPrevL1Block = await rollup.read.getCurrentProposer();
  log(`Proposer during previous L1 block: ${proposerDuringPrevL1Block}`);
  const nextBlockTS = BigInt((await publicClient.getBlock()).timestamp + BigInt(ETHEREUM_SLOT_DURATION));
  const proposer = await rollup.read.getProposerAt([nextBlockTS]);
  log(`Proposer NOW: ${proposer.toString()}`);
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
