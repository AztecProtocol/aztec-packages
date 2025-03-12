import {
  EthCheatCodes,
  createEthereumChain,
  getExpectedAddress,
  getL1ContractsConfigEnvVars,
  isAnvilTestChain,
} from '@aztec/ethereum';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { ForwarderAbi, ForwarderBytecode, RollupAbi, TestERC20Abi } from '@aztec/l1-artifacts';

import { sleep } from '@aztec/foundation/sleep';

import {
  type EncodeFunctionDataParameters,
  encodeFunctionData,
  createPublicClient,
  createWalletClient,
  fallback,
  getContract,
  http
} from 'viem';
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

import {
  type GasPrice,
  type L1TxRequest,
  L1TxUtils,
  type L1TxUtilsConfig,
  getL1TxUtilsConfigEnvVars,
} from '@aztec/ethereum';

export interface RollupCommandArgs {
  rpcUrls: string[];
  chainId: number;
  privateKey?: string;
  mnemonic?: string;
  rollupAddress: EthAddress;
  withdrawerAddress?: EthAddress;
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
  rpcUrls,
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
  const publicClient = getPublicClient(rpcUrls, chainId);
  const walletClient = getWalletClient(rpcUrls, chainId, privateKey, mnemonic);
  const l1TxUtils = new L1TxUtils(publicClient, walletClient, debugLogger);

  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: walletClient,
  });

  const stakingAsset = getContract({
    address: await rollup.read.getStakingAsset(),
    abi: TestERC20Abi,
    client: walletClient,
  });

  const retries = 10;
  const retryDelaySeconds = 12;
  let success = false;
  for (let i = 0; i < retries; i++) {
    try {
      const mintFunctionData: EncodeFunctionDataParameters<typeof TestERC20Abi, 'mint'> = {
        abi: TestERC20Abi,
        functionName: 'mint',
        args: [walletClient.account.address, config.minimumStake],
      };
      const encodedMintData = encodeFunctionData(mintFunctionData);

      const { receipt: mintReceipt } = await l1TxUtils.sendAndMonitorTransaction({
        to: stakingAsset.address,
        data: encodedMintData,
      });

      if (mintReceipt.status !== 'success') {
        throw new Error(`Mintaing failed for ${walletClient.account.address}`);
      }

      const approveFunctionData: EncodeFunctionDataParameters<typeof TestERC20Abi, `approve`> = {
        abi: TestERC20Abi,
        functionName: `approve`,
        args: [rollup.address, config.minimumStake]
      };
      const encodedApproveData = encodeFunctionData(approveFunctionData);

      const { receipt: approveReceipt } = await l1TxUtils.sendAndMonitorTransaction({
        to: stakingAsset.address,
        data: encodedApproveData,
      });

      if (approveReceipt.status !== `success`) {
        throw new Error(`Failed to approve spend of Staking Asset`);
      }

      dualLog(`Now attempting to add validator ${validatorAddress} to the set`);

      const depositFunctionData:  EncodeFunctionDataParameters<typeof RollupAbi, `deposit`> = {
        abi: RollupAbi,
        functionName: `deposit`,
        args: [validatorAddress.toString(), getExpectedAddress(ForwarderAbi, ForwarderBytecode, [validatorAddress.toString()], validatorAddress.toString())
        .address, withdrawerAddress ? withdrawerAddress.toString() : validatorAddress.toString(), config.minimumStake],
      };
      const encodedDepositData = encodeFunctionData(depositFunctionData);

      const { receipt: depositReceipt } = await l1TxUtils.sendAndMonitorTransaction({
        to: rollup.address,
        data: encodedDepositData,
      });

      if (depositReceipt === `success`) {
        success = true;
        dualLog(`Validator ${validatorAddress} added successfully`);
        break;
      } else {
        throw new Error(`Error adding validator ${validatorAddress} to the validator set`);
      }
    } catch (error) {
      debugLogger.error(`Error adding validator ${validatorAddress} to the validator set`)
    }

    dualLog(`Retrying to add validator ${validatorAddress} in ${retries} seconds.`);
    await sleep(retryDelaySeconds * 1000);
  }

  if (!success) {
    throw new Error(`Failed to add validator ${validatorAddress} after ${retries} retries`)
  }

}

export async function removeL1Validator({
  rpcUrls,
  chainId,
  privateKey,
  mnemonic,
  validatorAddress,
  rollupAddress,
  log,
  debugLogger,
}: RollupCommandArgs & LoggerArgs & { validatorAddress: EthAddress }) {
  const dualLog = makeDualLog(log, debugLogger);
  const publicClient = getPublicClient(rpcUrls, chainId);
  const walletClient = getWalletClient(rpcUrls, chainId, privateKey, mnemonic);
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
  rpcUrls,
  chainId,
  privateKey,
  mnemonic,
  rollupAddress,
  log,
  debugLogger,
}: RollupCommandArgs & LoggerArgs) {
  const dualLog = makeDualLog(log, debugLogger);
  const publicClient = getPublicClient(rpcUrls, chainId);
  const walletClient = getWalletClient(rpcUrls, chainId, privateKey, mnemonic);
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
  rpcUrls,
  chainId,
  rollupAddress,
  numEpochs,
  log,
  debugLogger,
}: RollupCommandArgs & LoggerArgs & { numEpochs: bigint }) {
  const dualLog = makeDualLog(log, debugLogger);
  const publicClient = getPublicClient(rpcUrls, chainId);
  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client: publicClient,
  });

  const cheatCodes = new EthCheatCodes(rpcUrls, debugLogger);
  const currentSlot = await rollup.read.getCurrentSlot();
  const l2SlotsInEpoch = await rollup.read.getEpochDuration();
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

export async function debugRollup({ rpcUrls, chainId, rollupAddress, log }: RollupCommandArgs & LoggerArgs) {
  const config = getL1ContractsConfigEnvVars();
  const publicClient = getPublicClient(rpcUrls, chainId);
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

function getPublicClient(rpcUrls: string[], chainId: number) {
  const chain = createEthereumChain(rpcUrls, chainId);
  return createPublicClient({ chain: chain.chainInfo, transport: fallback(rpcUrls.map(url => http(url))) });
}

function getWalletClient(
  rpcUrls: string[],
  chainId: number,
  privateKey: string | undefined,
  mnemonic: string | undefined,
) {
  if (!privateKey && !mnemonic) {
    throw new Error('Either privateKey or mnemonic must be provided to create a wallet client');
  }

  const chain = createEthereumChain(rpcUrls, chainId);
  const account = !privateKey
    ? mnemonicToAccount(mnemonic!)
    : privateKeyToAccount(`${privateKey.startsWith('0x') ? '' : '0x'}${privateKey}` as `0x${string}`);
  return createWalletClient({ account, chain: chain.chainInfo, transport: fallback(rpcUrls.map(url => http(url))) });
}
