import { Fr } from '@aztec/foundation/fields';
import type { L2BlockSource } from '@aztec/stdlib/block';

import type { PeerId } from '@libp2p/interface';

import type { ReqRespSubProtocolHandler } from '../interface.js';
import { ReqRespStatus, ReqRespStatusError } from '../status.js';

/**
 * Handler for L2 Block requests
 * @param l2BlockSource - source for L2 blocks
 * @returns the Block request handler
 * */
export function reqRespBlockHandler(l2BlockSource: L2BlockSource): ReqRespSubProtocolHandler {
  /**
   * @param peerId - the peer ID of the requester
   * @param msg - the block request message, which is expected to contain valid block number as a Buffer
   * @returns a Buffer containing the requested block data, or an empty Buffer if the block is not found
   * @throws  ReqRespStatusError if the input msg is not a valid block number
   * */
  return async (_peerId: PeerId, msg: Buffer) => {
    let blockNumber: Fr;
    try {
      blockNumber = Fr.fromBuffer(msg);
    } catch (err: any) {
      throw new ReqRespStatusError(ReqRespStatus.BADLY_FORMED_REQUEST, { cause: err });
    }

    try {
      const foundBlock = await l2BlockSource.getBlock(Number(blockNumber));
      return foundBlock ? foundBlock.toBuffer() : Buffer.alloc(0);
    } catch (err: any) {
      throw new ReqRespStatusError(ReqRespStatus.INTERNAL_ERROR, { cause: err });
    }
  };
}
