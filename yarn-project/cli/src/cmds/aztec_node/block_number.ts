import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { defaultFetch } from '@aztec/foundation/json-rpc/client';
import type { LogFn } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';

export async function blockNumber(nodeUrl: string, log: LogFn) {
  const aztecNode = createAztecNodeClient(
    nodeUrl,
    {
      l2CircuitsVkTreeRoot: getVKTreeRoot().toString(),
      l2ProtocolContractsHash: protocolContractsHash.toString(),
    },
    defaultFetch,
  );
  const [latestNum, provenNum] = await Promise.all([aztecNode.getBlockNumber(), aztecNode.getProvenBlockNumber()]);
  log(`Latest block: ${latestNum}`);
  log(`Proven block: ${provenNum}`);
}
