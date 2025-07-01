import { createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import type { LogFn } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import { getContract } from 'viem';

import type { RollupCommandArgs } from './update_l1_validators.js';

export async function triggerSeedSnapshot({
  rpcUrls,
  chainId,
  privateKey,
  mnemonic,
  rollupAddress,
  log,
}: RollupCommandArgs & { log: LogFn }) {
  const chain = createEthereumChain(rpcUrls, chainId);
  const client = createExtendedL1Client(rpcUrls, privateKey ?? mnemonic!, chain.chainInfo);

  const rollup = getContract({
    address: rollupAddress.toString(),
    abi: RollupAbi,
    client,
  });

  log('Triggering seed snapshot for next epoch');
  const txHash = await rollup.write.setupSeedSnapshotForNextEpoch();
  log(`Sent! | Seed snapshot setup for next epoch | tx hash: ${txHash}`);
  const receipt = await client.waitForTransactionReceipt({ hash: txHash });
  log(`Done! | Seed snapshot setup for next epoch | tx hash: ${txHash} | status: ${receipt.status}`);
}
