import { createCompatibleClient } from '@aztec/aztec.js';
import { L1TxUtils, MINIMUM_STAKE, createEthereumChain } from '@aztec/ethereum';
import { type LogFn, type Logger } from '@aztec/foundation/log';
import { RollupAbi, TestERC20Abi } from '@aztec/l1-artifacts';

import { createPublicClient, createWalletClient, getContract, http } from 'viem';
import { encodeFunctionData } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

export async function sequencers(opts: {
  command: 'list' | 'add' | 'remove' | 'who-next';
  who?: string;
  mnemonic?: string;
  rpcUrl: string;
  l1RpcUrl: string;
  chainId: number;
  blockNumber?: number;
  log: LogFn;
  debugLogger: Logger;
}) {
  const { command, who: maybeWho, mnemonic, rpcUrl, l1RpcUrl, chainId, log, debugLogger } = opts;
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const { l1ContractAddresses } = await client.getNodeInfo();

  const chain = createEthereumChain(l1RpcUrl, chainId);
  const publicClient = createPublicClient({ chain: chain.chainInfo, transport: http(chain.rpcUrl) });

  const walletClient = mnemonic
    ? createWalletClient({
        account: mnemonicToAccount(mnemonic),
        chain: chain.chainInfo,
        transport: http(chain.rpcUrl),
      })
    : undefined;

  const rollup = getContract({
    address: l1ContractAddresses.rollupAddress.toString(),
    abi: RollupAbi,
    client: publicClient,
  });

  const writeableRollup = walletClient
    ? getContract({
        address: l1ContractAddresses.rollupAddress.toString(),
        abi: RollupAbi,
        client: walletClient,
      })
    : undefined;

  const who = (maybeWho as `0x{string}`) ?? walletClient?.account.address.toString();

  const l1TxUtils = walletClient ? new L1TxUtils(publicClient, walletClient, debugLogger) : undefined;

  if (command === 'list') {
    const sequencers = await rollup.read.getAttesters();
    if (sequencers.length === 0) {
      log(`No sequencers registered on rollup`);
    } else {
      log(`Registered sequencers on rollup:`);
      for (const sequencer of sequencers) {
        log(' ' + sequencer.toString());
      }
    }
  } else if (command === 'add') {
    if (!who || !writeableRollup || !walletClient || !l1TxUtils) {
      throw new Error(`Missing sequencer address or wallet configuration`);
    }

    log(`Adding ${who} as sequencer`);

    const stakingAsset = getContract({
      address: await rollup.read.STAKING_ASSET(),
      abi: TestERC20Abi,
      client: walletClient,
    });

    const mintRequest = {
      to: stakingAsset.address,
      data: encodeFunctionData({
        abi: stakingAsset.abi,
        functionName: 'mint',
        args: [walletClient.account.address, MINIMUM_STAKE],
      }),
    };
    const approveRequest = {
      to: stakingAsset.address,
      data: encodeFunctionData({
        abi: stakingAsset.abi,
        functionName: 'approve',
        args: [rollup.address, MINIMUM_STAKE],
      }),
    };

    await Promise.all([
      l1TxUtils.sendAndMonitorTransaction(mintRequest),
      l1TxUtils.sendAndMonitorTransaction(approveRequest),
    ]);

    // send and monitor deposit transaction
    const depositReceipt = await l1TxUtils.sendAndMonitorTransaction({
      to: writeableRollup.address,
      data: encodeFunctionData({
        abi: writeableRollup.abi,
        functionName: 'deposit',
        args: [who, who, who, MINIMUM_STAKE],
      }),
    });

    log(`Added in tx ${depositReceipt.transactionHash}`);
  } else if (command === 'remove') {
    if (!who || !writeableRollup || !l1TxUtils) {
      throw new Error(`Missing sequencer address or wallet configuration`);
    }
    log(`Removing ${who} as sequencer`);

    const receipt = await l1TxUtils.sendAndMonitorTransaction({
      to: writeableRollup.address,
      data: encodeFunctionData({
        abi: writeableRollup.abi,
        functionName: 'initiateWithdraw',
        args: [who, who],
      }),
    });

    log(`Removed in tx ${receipt.transactionHash}`);
  } else if (command === 'who-next') {
    const next = await rollup.read.getCurrentProposer();
    log(`Sequencer expected to build is ${next}`);
  } else {
    throw new Error(`Unknown command ${command}`);
  }
}
