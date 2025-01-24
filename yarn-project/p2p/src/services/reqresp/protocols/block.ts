import { type L2BlockSource } from '@aztec/circuit-types';
import { Fr } from '@aztec/foundation/fields';

import { type PeerId } from '@libp2p/interface';

import { type ReqRespSubProtocolHandler } from '../interface.js';

export function reqRespBlockHandler(l2BlockSource: L2BlockSource): ReqRespSubProtocolHandler {
  return async (_peerId: PeerId, msg: Buffer) => {
    const blockNumber = Fr.fromBuffer(msg);

    const foundBlock = await l2BlockSource.getBlock(Number(blockNumber));
    return foundBlock ? foundBlock.toBuffer() : Buffer.alloc(0);
  };
}
