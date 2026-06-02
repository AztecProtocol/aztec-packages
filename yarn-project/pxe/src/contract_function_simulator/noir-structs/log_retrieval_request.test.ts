import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Tag } from '@aztec/stdlib/logs';

import { LogRetrievalRequest, LogSource } from './log_retrieval_request.js';

describe('LogRetrievalRequest', () => {
  it('output of Noir serialization with defaults deserializes as expected', () => {
    const serialized = [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    ].map(Fr.fromHexString);

    const request = LogRetrievalRequest.fromFields(serialized);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.tag).toEqual(new Tag(new Fr(2)));
    expect(request.source).toEqual(LogSource.PUBLIC_AND_PRIVATE);
    expect(request.fromBlock).toBeUndefined();
    expect(request.toBlock).toBeUndefined();
  });

  it('output of Noir serialization with values deserializes as expected', () => {
    const serialized = [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x000000000000000000000000000000000000000000000000000000000000000a',
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000014',
    ].map(Fr.fromHexString);

    const request = LogRetrievalRequest.fromFields(serialized);

    expect(request.contractAddress).toEqual(AztecAddress.fromBigInt(1n));
    expect(request.tag).toEqual(new Tag(new Fr(2)));
    expect(request.source).toEqual(LogSource.PUBLIC);
    expect(request.fromBlock).toEqual(BlockNumber(10));
    expect(request.toBlock).toEqual(BlockNumber(20));
  });

  it('rejects an invalid LogSource value', () => {
    const serialized = [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
      '0x000000000000000000000000000000000000000000000000000000000000002a', // 42 — invalid
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000000000000000000000000000',
    ].map(Fr.fromHexString);

    expect(() => LogRetrievalRequest.fromFields(serialized)).toThrow(/Invalid LogSource value 42/);
  });

  it('accepts all valid LogSource values', () => {
    for (const source of [LogSource.PRIVATE, LogSource.PUBLIC, LogSource.PUBLIC_AND_PRIVATE]) {
      const fields = new LogRetrievalRequest(AztecAddress.fromBigInt(1n), new Tag(new Fr(2)), source).toFields();
      const restored = LogRetrievalRequest.fromFields(fields);
      expect(restored.source).toEqual(source);
    }
  });

  it('round-trips through toFields and fromFields', () => {
    const original = new LogRetrievalRequest(
      AztecAddress.fromBigInt(42n),
      new Tag(new Fr(99)),
      LogSource.PRIVATE,
      BlockNumber(5),
      BlockNumber(100),
    );

    const restored = LogRetrievalRequest.fromFields(original.toFields());

    expect(restored.contractAddress).toEqual(original.contractAddress);
    expect(restored.tag).toEqual(original.tag);
    expect(restored.source).toEqual(original.source);
    expect(restored.fromBlock).toEqual(original.fromBlock);
    expect(restored.toBlock).toEqual(original.toBlock);
  });
});
