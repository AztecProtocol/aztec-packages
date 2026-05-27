import { Fr } from '@aztec/foundation/curves/bn254';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { FactStore } from './fact_store.js';
import { FactStoreService } from './fact_store_service.js';

describe('FactStoreService', () => {
  const chain = { isCanonical: () => Promise.resolve(true) };
  const allowed = AztecAddress.fromBigInt(1n);
  const contract = AztecAddress.fromBigInt(9n);

  it('rejects a disallowed scope', async () => {
    const svc = new FactStoreService(new FactStore(await openTmpStore('fss'), chain), [allowed]);
    await expect(
      svc.recordFact(
        contract,
        AztecAddress.fromBigInt(2n),
        new Fr(1n),
        new Fr(5n),
        Buffer.from('c'),
        Buffer.alloc(0),
        null,
      ),
    ).rejects.toThrow(/not in the allowed scopes/);
  });

  it('allows the zero scope and an allowed scope', async () => {
    const svc = new FactStoreService(new FactStore(await openTmpStore('fss2'), chain), [allowed]);
    await svc.recordFact(contract, allowed, new Fr(1n), new Fr(5n), Buffer.from('c'), Buffer.alloc(0), null);
    const active = await svc.activeEntities(contract, allowed, new Fr(1n));
    expect(active).toHaveLength(1);
  });
});
