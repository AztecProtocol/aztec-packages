import type { PrivateEventFilter } from '@aztec/aztec.js/wallet';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';

import { AnchorBlockDataProvider } from '../storage/anchor_block_data_provider/anchor_block_data_provider.js';
import type { PrivateEventDataProviderFilter } from '../storage/private_event_data_provider/private_event_data_provider.js';

export class PrivateEventFilterValidator {
  constructor(private anchorBlockDataProvider: AnchorBlockDataProvider) {}

  async validate(filter: PrivateEventFilter): Promise<PrivateEventDataProviderFilter> {
    let { fromBlock, toBlock } = filter;

    // Block range filters in Aztec Node are defined as closed-open intervals [fromBlock, toBlock), so
    // we respect that convention here for consistency.
    // We then default to [INITIAL_L2_BLOCK_NUM, latestKnownBlock + 1), ie: by default return events from
    // the first block to the latest known block.
    if (!fromBlock || !toBlock) {
      const lastKnownBlock = (await this.anchorBlockDataProvider.getBlockHeader()).getBlockNumber();
      fromBlock = fromBlock ?? BlockNumber(INITIAL_L2_BLOCK_NUM);
      toBlock = toBlock ?? BlockNumber(lastKnownBlock + 1);
    }

    if (filter.scopes.length === 0) {
      throw new Error('At least one scope is required to get private events');
    }

    if (fromBlock < 1) {
      throw new Error('fromBlock must be greater than or equal to 1');
    }

    if (toBlock < 1) {
      throw new Error('toBlock must be greater than or equal to 1');
    }

    if (fromBlock >= toBlock) {
      throw new Error('toBlock must be strictly greater than fromBlock');
    }

    return {
      contractAddress: filter.contractAddress,
      scopes: filter.scopes,
      txHash: filter.txHash,
      toBlock,
      fromBlock,
    };
  }
}
