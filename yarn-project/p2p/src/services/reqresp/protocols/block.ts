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
    try {
      const blockNumber = Fr.fromBuffer(msg);
      const foundBlock = await l2BlockSource.getBlock(Number(blockNumber));
      return foundBlock ? foundBlock.toBuffer() : Buffer.alloc(0);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e: any) {
      // This is ok, because the only thing that can go wrong is block number parsing
      throw new ReqRespStatusError(ReqRespStatus.BADLY_FORMED_REQUEST);
    }
  };
}
