import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { FactScope } from './fact_scope.js';
import { FactCollectionKey } from './fact_store_keys.js';
import { StoredFact, factKeyStrOf } from './stored_fact.js';

describe('StoredFact', () => {
  const contract = AztecAddress.fromBigIntUnsafe(100n);
  const account = AztecAddress.fromBigIntUnsafe(1n);
  const scope: FactScope = { type: 'account', account };
  const collectionType = new Fr(7n);
  const collectionId = new Fr(42n);
  const factType = new Fr(3n);
  const key = FactCollectionKey.from({
    contractAddress: contract,
    scope,
    factCollectionTypeId: collectionType,
    factCollectionId: collectionId,
  });
  const publicKey = FactCollectionKey.from({
    contractAddress: contract,
    scope: { type: 'public' },
    factCollectionTypeId: collectionType,
    factCollectionId: collectionId,
  });

  it('round-trips a retractable fact through buffer serialization', () => {
    const fact = new StoredFact(key, factType, [new Fr(9n), new Fr(10n)], {
      blockNumber: 12,
      blockHash: new Fr(0xabcn),
    });
    const back = StoredFact.fromBuffer(fact.toBuffer());
    expect(back).toEqual(fact);
    expect(back.isRetractable).toBe(true);
  });

  it('round-trips a non-retractable fact (no origin block)', () => {
    const fact = new StoredFact(key, factType, [new Fr(9n)], undefined);
    const back = StoredFact.fromBuffer(fact.toBuffer());
    expect(back).toEqual(fact);
    expect(back.isRetractable).toBe(false);
  });

  it('round-trips a public fact through buffer serialization', () => {
    const fact = new StoredFact(publicKey, factType, [new Fr(9n)], { blockNumber: 12, blockHash: new Fr(0xabcn) });
    expect(StoredFact.fromBuffer(fact.toBuffer())).toEqual(fact);
  });

  it('serializes a public fact as the account record layout plus a trailing marker', () => {
    const publicFact = new StoredFact(publicKey, factType, [new Fr(9n)], undefined);
    const accountLayout = new StoredFact(
      FactCollectionKey.from({ ...key, scope: { type: 'account', account: AztecAddress.ZERO } }),
      factType,
      [new Fr(9n)],
      undefined,
    );

    expect(publicFact.toBuffer()).toEqual(Buffer.concat([accountLayout.toBuffer(), Buffer.from([1])]));
  });

  it('rejects malformed public scope markers', () => {
    const publicRecord = new StoredFact(publicKey, factType, [new Fr(9n)], undefined).toBuffer();
    const accountRecord = new StoredFact(key, factType, [new Fr(9n)], undefined).toBuffer();
    const malformed = `Malformed public scope marker in stored fact of contract ${contract}`;

    const falseMarker = Buffer.concat([publicRecord.subarray(0, -1), Buffer.from([0])]);
    expect(() => StoredFact.fromBuffer(falseMarker)).toThrow(`${malformed}: marker is false`);

    const trailingBytes = Buffer.concat([publicRecord, Buffer.from([0])]);
    expect(() => StoredFact.fromBuffer(trailingBytes)).toThrow(`${malformed}: trailing bytes after the marker`);

    const markedAccount = Buffer.concat([accountRecord, Buffer.from([1])]);
    expect(() => StoredFact.fromBuffer(markedAccount)).toThrow(`${malformed}: record names account ${account}`);
  });

  it('derives stable composite keys including the origin block', () => {
    const nonRetractable = new StoredFact(key, factType, [new Fr(9n)], undefined);
    expect(nonRetractable.factCollectionKey.factCollectionTypeKey().toString()).toBe(
      `${contract}:${account}:${collectionType}`,
    );
    expect(nonRetractable.factCollectionKey.toString()).toBe(
      `${contract}:${account}:${collectionType}:${collectionId}`,
    );
    expect(factKeyStrOf(nonRetractable)).toBe(
      nonRetractable.factCollectionKey.toString() + `:${factType}:${nonRetractable.payloadHash()}:none`,
    );

    const blockHash = new Fr(0xabcn);
    const retractable = new StoredFact(key, factType, [new Fr(9n)], { blockNumber: 5, blockHash });
    expect(factKeyStrOf(retractable)).toBe(
      retractable.factCollectionKey.toString() + `:${factType}:${retractable.payloadHash()}:5:${blockHash}`,
    );
  });

  it('keys the same payload at different origin blocks as distinct facts', () => {
    const noOrigin = new StoredFact(key, factType, [new Fr(9n)], undefined);
    const atBlock5 = new StoredFact(key, factType, [new Fr(9n)], { blockNumber: 5, blockHash: new Fr(1n) });
    const atBlock10 = new StoredFact(key, factType, [new Fr(9n)], { blockNumber: 10, blockHash: new Fr(2n) });
    expect(factKeyStrOf(noOrigin)).not.toBe(factKeyStrOf(atBlock5));
    expect(factKeyStrOf(atBlock5)).not.toBe(factKeyStrOf(atBlock10));
  });

  it('derives distinct payload hashes for distinct payloads', () => {
    const a = new StoredFact(key, factType, [new Fr(1n)], undefined);
    const b = new StoredFact(key, factType, [new Fr(2n)], undefined);
    const c = new StoredFact(key, factType, [new Fr(1n)], undefined);
    expect(a.payloadHash()).not.toEqual(b.payloadHash());
    expect(a.payloadHash()).toEqual(c.payloadHash());
  });
});
