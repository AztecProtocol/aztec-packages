import { createCompatibleClient } from '@aztec/aztec.js';
import { RollupContract, createEthereumChain, getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import type { LogFn, Logger } from '@aztec/foundation/log';
import { RollupAbi, TestERC20Abi } from '@aztec/l1-artifacts';

import { createPublicClient, createWalletClient, fallback, getContract, http } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

export async function sequencers(opts: {
  command: 'list' | 'add' | 'remove' | 'who-next' | 'flush';
  who?: string;
  mnemonic?: string;
  rpcUrl: string;
  l1RpcUrls: string[];
  chainId: number;
  blockNumber?: number;
  log: LogFn;
  debugLogger: Logger;
}) {
  const { command, who: maybeWho, mnemonic, rpcUrl, l1RpcUrls, chainId, log, debugLogger } = opts;
  const client = await createCompatibleClient(rpcUrl, debugLogger);
  const { l1ContractAddresses } = await client.getNodeInfo();

  const chain = createEthereumChain(l1RpcUrls, chainId);
  const publicClient = createPublicClient({
    chain: chain.chainInfo,
    transport: fallback(l1RpcUrls.map(url => http(url))),
  });

  const walletClient = mnemonic
    ? createWalletClient({
        account: mnemonicToAccount(mnemonic),
        chain: chain.chainInfo,
        transport: fallback(l1RpcUrls.map(url => http(url))),
      })
    : undefined;

  const rollup = new RollupContract(publicClient, l1ContractAddresses.rollupAddress);

  const writeableRollup = walletClient
    ? getContract({
        address: l1ContractAddresses.rollupAddress.toString(),
        abi: RollupAbi,
        client: walletClient,
      })
    : undefined;

  const who = (maybeWho as `0x{string}`) ?? walletClient?.account.address.toString();

  if (command === 'list') {
    const sequencers = await rollup.getAttesters();
    if (sequencers.length === 0) {
      log(`No sequencers registered on rollup`);
    } else {
      log(`Registered sequencers on rollup:`);
      for (const sequencer of sequencers) {
        log(' ' + sequencer.toString());
      }
    }
  } else if (command === 'add') {
    if (!who || !writeableRollup || !walletClient) {
      throw new Error(`Missing sequencer address`);
    }

    log(`Adding ${who} as sequencer`);

    const stakingAsset = getContract({
      address: await rollup.getStakingAsset(),
      abi: TestERC20Abi,
      client: walletClient,
    });

    const config = getL1ContractsConfigEnvVars();

    await Promise.all(
      [
        await stakingAsset.write.mint([walletClient.account.address, config.depositAmount], {} as any),
        await stakingAsset.write.approve([rollup.address, config.depositAmount], {} as any),
      ].map(txHash => publicClient.waitForTransactionReceipt({ hash: txHash })),
    );

    const hash = await writeableRollup.write.deposit([who, who, true]);
    await publicClient.waitForTransactionReceipt({ hash });
    log(`Added in tx ${hash}`);
  } else if (command === 'flush') {
    if (!writeableRollup) {
      throw new Error(`Missing sequencer address`);
    }
    log(`Flushing staking entry queue`);
    const hash = await writeableRollup.write.flushEntryQueue();
    await publicClient.waitForTransactionReceipt({ hash });
    log(`Flushed staking entry queue in tx ${hash}`);
  } else if (command === 'remove') {
    if (!who || !writeableRollup) {
      throw new Error(`Missing sequencer address`);
    }
    log(`Removing ${who} as sequencer`);
    const hash = await writeableRollup.write.initiateWithdraw([who, who]);
    await publicClient.waitForTransactionReceipt({ hash });
    log(`Removed in tx ${hash}`);
  } else if (command === 'who-next') {
    const next = await rollup.getCurrentProposer();
    log(`Sequencer expected to build is ${next}`);
  } else {
    throw new Error(`Unknown command ${command}`);
  }
}
