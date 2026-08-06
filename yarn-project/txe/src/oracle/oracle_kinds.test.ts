import type { Fr } from '@aztec/foundation/curves/bn254';
import type { TypeMapping } from '@aztec/pxe/simulator';

import {
  SCALAR_MAPPINGS,
  UnsynthesizableTypeError,
  registryTreeMappings,
  testValueFor,
} from './test-resolver/default_fixtures.js';
import { TXE_ORACLE_REGISTRY } from './txe_oracle_registry.js';

describe('oracle type-mapping labels', () => {
  it('mappings sharing a label are wire-equivalent', () => {
    // The interface hash treats mappings with equal labels as the same wire type, and the roundtrip resolver serves
    // a label with whichever bidirectional mapping the registry declares for it — so any two mappings sharing a
    // label (e.g. FIELD and TX_HASH, both a Noir `Field`) must serialize the same canonical value for the same seed.
    // The universe is every mapping reachable from the registry tree, plus the scalar test-value table so a scalar
    // registered before any signature uses it is covered too. Mappings the synthesizer cannot build a canonical
    // value for have no comparable wire form and are skipped.
    const universe = new Set([...registryTreeMappings(TXE_ORACLE_REGISTRY), ...SCALAR_MAPPINGS]);
    const byLabel = new Map<string, TypeMapping<any>[]>();
    for (const mapping of [...universe].filter(m => m.serialization !== undefined)) {
      byLabel.set(mapping.label, [...(byLabel.get(mapping.label) ?? []), mapping]);
    }

    let comparedLabels = 0;
    for (const [label, mappings] of byLabel.entries()) {
      const serialized = mappings.map(mapping => tryCanonicalRows(mapping)).filter(rows => rows !== undefined);
      for (const rows of serialized.slice(1)) {
        expect({ label, rows }).toEqual({ label, rows: serialized[0] });
      }
      if (serialized.length > 1) {
        comparedLabels++;
      }
    }
    // If nothing collides the test is vacuous; the registry has several same-label mappings today (e.g. FIELD and
    // its aliases), so a zero count means the walk broke.
    expect(comparedLabels).toBeGreaterThan(0);
  });
});

/** Serialized canonical values, or undefined for types the synthesizer has no impl for. */
function tryCanonicalRows(mapping: TypeMapping<any>): string[][] | undefined {
  try {
    return canonicalRows(mapping);
  } catch (e) {
    if (e instanceof UnsynthesizableTypeError) {
      return undefined;
    }
    throw e;
  }
}

/** Serialized canonical values at a few seeds. */
function canonicalRows(mapping: TypeMapping<any>): string[][] {
  return [10, 11, 12].map(seed =>
    mapping
      .serialization!.fn(testValueFor(mapping, seed))
      .flat()
      .map((f: Fr) => f.toString()),
  );
}
