import { jsonStringify } from '@aztec/foundation/json-rpc';

import { L2BlockHash } from './block_hash.js';
import { TxHash } from './tx_hash.js';
import { TxReceipt, TxStatus } from './tx_receipt.js';

describe('TxReceipt', () => {
  it('serializes and deserializes from json', () => {
    const receipt = new TxReceipt(
      TxHash.random(),
      TxStatus.SUCCESS,
      'error',
      BigInt(1),
      L2BlockHash.random(),
      undefined,
    );

    expect(TxReceipt.schema.parse(JSON.parse(jsonStringify(receipt)))).toEqual(receipt);
  });

  it('serializes and deserializes from json with undefined fields', () => {
    const receipt = new TxReceipt(TxHash.random(), TxStatus.DROPPED, 'error', undefined, undefined, undefined);

    expect(TxReceipt.schema.parse(JSON.parse(jsonStringify(receipt)))).toEqual(receipt);
  });
});
