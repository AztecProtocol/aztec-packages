import { mockTx, mockTxForRollup } from '@aztec/stdlib/testing';
import type { AnyTx, Tx } from '@aztec/stdlib/tx';
import { TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP } from '@aztec/stdlib/tx';

import { TimestampTxValidator } from './timestamp_validator.js';

describe('TimestampTxValidator', () => {
  let timestamp: bigint;
  let seed = 1;
  let validator: TimestampTxValidator<AnyTx>;

  const setValidatorAtBlock = (blockNumber: number) => {
    timestamp = 10n;
    validator = new TimestampTxValidator({
      timestamp,
      blockNumber,
    });
  };

  beforeEach(() => {
    setValidatorAtBlock(3);
  });

  const expectValid = async (tx: Tx) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'valid' });
  };

  const expectInvalid = async (tx: Tx, reason: string) => {
    await expect(validator.validateTx(tx)).resolves.toEqual({ result: 'invalid', reason: [reason] });
  };

  const makeTxs = async () => {
    const opts = {};
    const tx1 = await mockTx(seed++, opts);
    const tx2 = await mockTxForRollup(seed++, opts);

    return [tx1, tx2];
  };

  it.each([10n, 11n])('allows txs with valid expiration timestamp', async includeByTimestamp => {
    const [goodTx] = await makeTxs();
    goodTx.data.includeByTimestamp = includeByTimestamp;

    await expectValid(goodTx);
  });

  it('allows txs with equal or greater expiration timestamp', async () => {
    const [goodTx1, goodTx2] = await makeTxs();
    goodTx1.data.includeByTimestamp = timestamp;
    goodTx2.data.includeByTimestamp = timestamp + 1n;

    await expectValid(goodTx1);
    await expectValid(goodTx2);
  });

  it('rejects txs with lower expiration timestamp', async () => {
    const [badTx] = await makeTxs();
    badTx.data.includeByTimestamp = timestamp - 1n;

    await expectInvalid(badTx, TX_ERROR_INVALID_INCLUDE_BY_TIMESTAMP);
  });

  it('accept txs with lower expiration timestamp when building block 1', async () => {
    // Since at block 1, we skip the expiration check, we expect the tx to be valid even if the expiration timestamp
    // is lower than the current timestamp. For details on why the check is disable for block 1 see the
    // `validate_include_by_timestamp` function in
    // `noir-projects/noir-protocol-circuits/crates/rollup-lib/src/base/components/validation_requests.nr`.
    setValidatorAtBlock(1);

    const [badTx] = await makeTxs();
    badTx.data.includeByTimestamp = timestamp - 1n;

    await expectValid(badTx);
  });
});
