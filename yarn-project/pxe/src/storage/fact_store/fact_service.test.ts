import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { FactService } from './fact_service.js';
import { FactStore } from './fact_store.js';

describe('FactService', () => {
  const chain = { isCanonical: () => Promise.resolve(true) };
  const allowed = AztecAddress.fromBigInt(1n);
  const contract = AztecAddress.fromBigInt(9n);
  const JOB = 'fact-store-service-test-job';

  it('rejects a disallowed scope', async () => {
    const svc = new FactService(new FactStore(await openTmpStore('fss'), chain), [allowed]);
    expect(() =>
      svc.recordFact(
        contract,
        AztecAddress.fromBigInt(2n),
        new Fr(1n),
        new Fr(5n),
        Buffer.from('c'),
        Buffer.alloc(0),
        null,
        JOB,
      ),
    ).toThrow(/not in the allowed scopes/);
  });

  it('allows the zero scope and an allowed scope', async () => {
    const svc = new FactService(new FactStore(await openTmpStore('fss2'), chain), [allowed]);
    await svc.recordFact(contract, allowed, new Fr(1n), new Fr(5n), Buffer.from('c'), Buffer.alloc(0), null, JOB);
    expect(await svc.activeEntities(contract, allowed, new Fr(1n), JOB)).toHaveLength(1);

    // The zero scope bypasses the guard.
    await svc.recordFact(
      contract,
      AztecAddress.ZERO,
      new Fr(1n),
      new Fr(5n),
      Buffer.from('z'),
      Buffer.alloc(0),
      null,
      JOB,
    );
    expect(await svc.activeEntities(contract, AztecAddress.ZERO, new Fr(1n), JOB)).toHaveLength(1);
  });
});
