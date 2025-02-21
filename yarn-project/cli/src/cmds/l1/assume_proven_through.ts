import { EthCheatCodes, RollupCheatCodes, createPXEClient, makeFetch } from '@aztec/aztec.js';
import { type LogFn } from '@aztec/foundation/log';

export async function assumeProvenThrough(
  blockNumberOrLatest: number | undefined,
  l1RpcUrl: string,
  rpcUrl: string,
  log: LogFn,
) {
  const pxe = createPXEClient(rpcUrl, {}, makeFetch([], true));
  const rollupAddress = await pxe.getNodeInfo().then(i => i.l1ContractAddresses.rollupAddress);
  const blockNumber = blockNumberOrLatest ?? (await pxe.getBlockNumber());

  const ethCheatCode = new EthCheatCodes(l1RpcUrl);
  const rollupCheatCodes = new RollupCheatCodes(ethCheatCode, { rollupAddress });

  await rollupCheatCodes.markAsProven(blockNumber);
  log(`Assumed proven through block ${blockNumber}`);
}
