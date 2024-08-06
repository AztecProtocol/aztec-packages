import { createCompatibleClient } from '@aztec/aztec.js';
import { createEthereumChain } from '@aztec/ethereum';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import { createPublicClient, createWalletClient, getContract, http } from 'viem';
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
  debugLogger: DebugLogger;
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

  if (command === 'list') {
    const sequencers = await rollup.read.getValidators();
    if (sequencers.length === 0) {
      log(`No sequencers registered on rollup`);
    } else {
      log(`Registered sequencers on rollup:`);
      for (const sequencer of sequencers) {
        log(' ' + sequencer.toString());
      }
    }
  } else if (command === 'add') {
    if (!who || !writeableRollup) {
      throw new Error(`Missing sequencer address`);
    }
    log(`Adding ${who} as sequencer`);
    const hash = await writeableRollup.write.addValidator([who]);
    await publicClient.waitForTransactionReceipt({ hash });
    log(`Added in tx ${hash}`);
  } else if (command === 'remove') {
    if (!who || !writeableRollup) {
      throw new Error(`Missing sequencer address`);
    }
    log(`Removing ${who} as sequencer`);
    const hash = await writeableRollup.write.removeValidator([who]);
    await publicClient.waitForTransactionReceipt({ hash });
    log(`Removed in tx ${hash}`);
  } else if (command === 'who-next') {
    const next = await rollup.read.getCurrentProposer();
    log(`Sequencer expected to build is ${next}`);
  } else {
    throw new Error(`Unknown command ${command}`);
  }
}
