import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { type FailedL1Tx, FailedL1TxSchema } from './failed_tx_store.js';

describe('FailedL1TxSchema', () => {
  const baseTx: FailedL1Tx = {
    id: '0xdead',
    timestamp: 1_700_000_000_000,
    failureType: 'timeout',
    request: { to: '0xbeef', data: '0xcafe' },
    l1BlockNumber: 42n,
    error: { message: 'timed out' },
    context: { actions: ['propose'], sender: '0xabcd' },
  };

  const feeCaps = { maxFeePerGas: 100n, maxPriorityFeePerGas: 1n };
  const serializedFeeCaps = { maxFeePerGas: '100', maxPriorityFeePerGas: '1' };

  /** Parses a record in its on-disk form, bypassing the typed writer so legacy shapes can be exercised. */
  const parseStored = (gasInfo: object) =>
    jsonParseWithSchema(JSON.stringify({ ...JSON.parse(jsonStringify(baseTx)), gasInfo }), FailedL1TxSchema);

  it('reads back what it wrote', () => {
    const tx: FailedL1Tx = {
      ...baseTx,
      gasInfo: { sentFeeCaps: feeCaps, sentFeeCapsLadder: [feeCaps], attempts: 1, nonce: 5, gasLimit: 21_000n },
    };

    expect(jsonParseWithSchema(jsonStringify(tx), FailedL1TxSchema)).toEqual(tx);
  });

  it('reads fee caps from records written under the legacy gas price keys', () => {
    const record = parseStored({ sentGasPrice: serializedFeeCaps, sentGasPriceLadder: [serializedFeeCaps], nonce: 5 });

    expect(record.gasInfo?.sentFeeCaps).toEqual(feeCaps);
    expect(record.gasInfo?.sentFeeCapsLadder).toEqual([feeCaps]);
    expect(record.gasInfo?.nonce).toBe(5);
  });

  it('prefers the current keys when a record carries both spellings', () => {
    const record = parseStored({
      sentFeeCaps: { maxFeePerGas: '200', maxPriorityFeePerGas: '2' },
      sentGasPrice: serializedFeeCaps,
    });

    expect(record.gasInfo?.sentFeeCaps).toEqual({ maxFeePerGas: 200n, maxPriorityFeePerGas: 2n });
  });
});
