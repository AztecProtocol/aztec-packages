import { createLogger } from '@aztec/foundation/log';
import {
  type AnyTx,
  TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP,
  type TxValidationResult,
  type TxValidator,
  getTxHash,
} from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

export class TimestampTxValidator<T extends AnyTx> implements TxValidator<T> {
  #log = createLogger('p2p:tx_validator:timestamp');

  constructor(
    private values: {
      // Timestamp at which we will validate that the tx is not expired. This is typically the timestamp of the block
      // being built.
      timestamp: UInt64;
      // Block number in which the tx is considered to be included.
      blockNumber: number;
    },
  ) {}

  validateTx(tx: T): Promise<TxValidationResult> {
    const includeByTimestamp = tx.data.includeByTimestamp;
    // If building block 1, we skip the expiration check. For details on why see the `validate_include_by_timestamp`
    // function in `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/validation_requests.nr`.
    const buildingBlock1 = this.values.blockNumber === 1;

    if (!buildingBlock1 && includeByTimestamp < this.values.timestamp) {
      if (tx.data.constants.anchorBlockHeader.globalVariables.blockNumber === 0) {
        this.#log.warn(
          `A tx built against a genesis block failed to be included in block 1 which is the only block in which txs built against a genesis block are allowed to be included.`,
        );
      }
      this.#log.verbose(
        `Rejecting tx ${getTxHash(tx)} for low expiration timestamp. Tx expiration timestamp: ${includeByTimestamp}, timestamp: ${
          this.values.timestamp
        }.`,
      );
      return Promise.resolve({ result: 'invalid', reason: [TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP] });
    } else {
      return Promise.resolve({ result: 'valid' });
    }
  }
}
