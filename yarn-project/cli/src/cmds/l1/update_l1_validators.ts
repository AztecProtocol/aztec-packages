import {
  L1TxUtils,
  RollupContract,
  createEthereumChain,
  createExtendedL1Client,
  getL1ContractsConfigEnvVars,
  getPublicClient,
  isAnvilTestChain,
} from '@aztec/ethereum';
import { EthCheatCodes } from '@aztec/ethereum/test';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { RollupAbi, StakingAssetHandlerAbi } from '@aztec/l1-artifacts';
import { ZkPassportProofParams } from '@aztec/stdlib/zkpassport';

import { encodeFunctionData, formatEther, getContract } from 'viem';
import { generatePrivateKey, mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';

import { addLeadingHex } from '../../utils/aztec.js';

export interface RollupCommandArgs {
  rpcUrls: string[];
  chainId: number;
  privateKey?: string;
  mnemonic?: string;
  rollupAddress: EthAddress;
  withdrawerAddress?: EthAddress;
}

export interface StakingAssetHandlerCommandArgs {
  rpcUrls: string[];
  chainId: number;
  privateKey?: string;
  mnemonic?: string;
  stakingAssetHandlerAddress: EthAddress;
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
  attesterAddress,
  stakingAssetHandlerAddress,
  merkleProof,
  proofParams,
  log,
  debugLogger,
}: StakingAssetHandlerCommandArgs &
  LoggerArgs & { attesterAddress: EthAddress; proofParams: Buffer; merkleProof: string[] }) {
  const dualLog = makeDualLog(log, debugLogger);
  const account = getAccount(privateKey, mnemonic);
  const chain = createEthereumChain(rpcUrls, chainId);
  const l1Client = createExtendedL1Client(rpcUrls, account, chain.chainInfo);

  const stakingAssetHandler = getContract({
    address: stakingAssetHandlerAddress.toString(),
    abi: StakingAssetHandlerAbi,
    client: l1Client,
  });

  const rollup = await stakingAssetHandler.read.getRollup();
  dualLog(`Adding validator ${attesterAddress} to rollup ${rollup.toString()}`);

  const l1TxUtils = new L1TxUtils(l1Client, debugLogger);
  const proofParamsObj = ZkPassportProofParams.fromBuffer(proofParams);
  const merkleProofArray = merkleProof.map(proof => addLeadingHex(proof));

  const { receipt } = await l1TxUtils.sendAndMonitorTransaction({
    to: stakingAssetHandlerAddress.toString(),
    data: encodeFunctionData({
      abi: StakingAssetHandlerAbi,
      functionName: 'addValidator',
      args: [attesterAddress.toString(), merkleProofArray, proofParamsObj.toViem()],
    }),
    abi: StakingAssetHandlerAbi,
  });
  dualLog(`Transaction hash: ${receipt.transactionHash}`);
  await l1Client.waitForTransactionReceipt({ hash: receipt.transactionHash });
  if (isAnvilTestChain(chainId)) {
    dualLog(`Funding validator on L1`);
    const cheatCodes = new EthCheatCodes(rpcUrls, debugLogger);
    await cheatCodes.setBalance(attesterAddress, 10n ** 20n);
  } else {
    const balance = await l1Client.getBalance({ address: attesterAddress.toString() });
    dualLog(`Validator balance: ${formatEther(balance)} ETH`);
    if (balance === 0n) {
      dualLog(`WARNING: Proposer has no balance. Remember to fund it!`);
    }
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
  const account = getAccount(privateKey, mnemonic);
  const chain = createEthereumChain(rpcUrls, chainId);
  const l1Client = createExtendedL1Client(rpcUrls, account, chain.chainInfo);
  const l1TxUtils = new L1TxUtils(l1Client, debugLogger);

  dualLog(`Removing validator ${validatorAddress.toString()} from rollup ${rollupAddress.toString()}`);
  const { receipt } = await l1TxUtils.sendAndMonitorTransaction({
    to: rollupAddress.toString(),
    data: encodeFunctionData({
      abi: RollupAbi,
      functionName: 'initiateWithdraw',
      args: [validatorAddress.toString(), validatorAddress.toString()],
    }),
  });
  dualLog(`Transaction hash: ${receipt.transactionHash}`);
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
  const account = getAccount(privateKey, mnemonic);
  const chain = createEthereumChain(rpcUrls, chainId);
  const l1Client = createExtendedL1Client(rpcUrls, account, chain.chainInfo);
  const l1TxUtils = new L1TxUtils(l1Client, debugLogger);

  dualLog(`Trying prune`);
  const { receipt } = await l1TxUtils.sendAndMonitorTransaction({
    to: rollupAddress.toString(),
    data: encodeFunctionData({
      abi: RollupAbi,
      functionName: 'prune',
    }),
  });
  dualLog(`Transaction hash: ${receipt.transactionHash}`);
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
  const publicClient = getPublicClient({ l1RpcUrls: rpcUrls, l1ChainId: chainId });
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
    await cheatCodes.warp(Number(timestamp), { resetBlockInterval: true });
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
  const publicClient = getPublicClient({ l1RpcUrls: rpcUrls, l1ChainId: chainId });
  const rollup = new RollupContract(publicClient, rollupAddress);

  const pendingNum = await rollup.getBlockNumber();
  log(`Pending block num: ${pendingNum}`);
  const provenNum = await rollup.getProvenBlockNumber();
  log(`Proven block num: ${provenNum}`);
  const validators = await rollup.getAttesters();
  log(`Validators: ${validators.map(v => v.toString()).join(', ')}`);
  const committee = await rollup.getCurrentEpochCommittee();
  log(`Committee: ${committee?.map(v => v.toString()).join(', ')}`);
  const archive = await rollup.archive();
  log(`Archive: ${archive}`);
  const epochNum = await rollup.getEpochNumber();
  log(`Current epoch: ${epochNum}`);
  const slot = await rollup.getSlotNumber();
  log(`Current slot: ${slot}`);
  const proposerDuringPrevL1Block = await rollup.getCurrentProposer();
  log(`Proposer during previous L1 block: ${proposerDuringPrevL1Block}`);
  const nextBlockTS = BigInt((await publicClient.getBlock()).timestamp + BigInt(config.ethereumSlotDuration));
  const proposer = await rollup.getProposerAt(nextBlockTS);
  log(`Proposer NOW: ${proposer.toString()}`);
}

function makeDualLog(log: LogFn, debugLogger: Logger) {
  return (msg: string) => {
    log(msg);
    debugLogger.info(msg);
  };
}

function getAccount(privateKey: string | undefined, mnemonic: string | undefined) {
  if (!privateKey && !mnemonic) {
    throw new Error('Either privateKey or mnemonic must be provided to create a wallet client');
  }
  const account = !privateKey
    ? mnemonicToAccount(mnemonic!)
    : privateKeyToAccount(`${privateKey.startsWith('0x') ? '' : '0x'}${privateKey}` as `0x${string}`);
  return account;
}
