import type { Fr } from '@aztec/foundation/curves/bn254';
import type { TypeMapping } from '@aztec/pxe/simulator';

import { SCALAR_MAPPINGS, testValueFor } from './test-resolver/default_fixtures.js';

describe('oracle type-mapping labels', () => {
  it('mappings sharing a label are wire-equivalent', () => {
    // The interface hash treats mappings with equal labels as the same wire type, so two scalar mappings sharing a
    // label (e.g. FIELD and TX_HASH, both a Noir `Field`) must serialize the same canonical value for the same seed.
    const byLabel = new Map<string, TypeMapping<any>[]>();
    // A deserialize-only mapping has no wire form to compare.
    for (const mapping of SCALAR_MAPPINGS.filter(m => m.serialization !== undefined)) {
      byLabel.set(mapping.label, [...(byLabel.get(mapping.label) ?? []), mapping]);
    }

    for (const [label, mappings] of byLabel.entries()) {
      const serialized = mappings.map(mapping => canonicalRows(mapping));
      for (const rows of serialized.slice(1)) {
        expect({ label, rows }).toEqual({ label, rows: serialized[0] });
      }
    }
  });
});

/** Serialized canonical values at a few seeds. */
function canonicalRows(mapping: TypeMapping<any>): string[][] {
  return [10, 11, 12].map(seed =>
    mapping
      .serialization!.fn(testValueFor(mapping, seed))
      .flat()
      .map((f: Fr) => f.toString()),
  );
}
