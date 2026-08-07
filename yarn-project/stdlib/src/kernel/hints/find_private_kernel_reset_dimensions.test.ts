import type { FieldsOf } from '@aztec/foundation/types';

import {
  type DimensionName,
  PrivateKernelResetDimensions,
  type PrivateKernelResetDimensionsConfig,
  type ResetCatalogEntry,
  privateKernelResetDimensionNames,
} from '../private_kernel_reset_dimensions.js';
import { findPrivateKernelResetDimensions } from './find_private_kernel_reset_dimensions.js';

const sampleCosts: { [K in DimensionName]: number } = {
  NOTE_HASH_PENDING_READ: 100,
  NOTE_HASH_SETTLED_READ: 3000,
  NULLIFIER_PENDING_READ: 100,
  NULLIFIER_SETTLED_READ: 3000,
  KEY_VALIDATION: 2500,
  TRANSIENT_DATA_SQUASHING: 100,
  NOTE_HASH_SILOING: 250,
  NULLIFIER_SILOING: 150,
  PRIVATE_LOG_SILOING: 150,
};

// The production catalog carries a measured `circuit_size` on each entry. In the tests we
// synthesize a cost via a linear formula (sum of dim × per-dim weight) so the selector ranks
// entries in the order the tests expect.
const synthesizeCost = (dimensions: number[], weights: { [K in DimensionName]: number }) =>
  privateKernelResetDimensionNames.reduce((accum, name, i) => accum + dimensions[i] * weights[name], 0);

const withCosts = (
  entries: { name: string; dimensions: number[] }[],
  weights: { [K in DimensionName]: number } = sampleCosts,
): ResetCatalogEntry[] => entries.map(e => ({ ...e, cost: synthesizeCost(e.dimensions, weights) }));

const sampleInnerCatalog: ResetCatalogEntry[] = withCosts([
  { name: 'inner_settled_reads_lg', dimensions: [0, 64, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'inner_pending_reads_lg', dimensions: [32, 0, 32, 0, 0, 0, 0, 0, 0] },
  { name: 'inner_read_combo_md', dimensions: [8, 8, 8, 8, 4, 0, 0, 0, 0] },
  { name: 'inner_validation_combo_md', dimensions: [0, 4, 0, 4, 16, 16, 0, 0, 0] },
  { name: 'inner_iter_checkpoint_sm', dimensions: [4, 4, 4, 4, 4, 4, 0, 0, 0] },
  { name: 'inner_universal_lg', dimensions: [32, 16, 32, 16, 16, 16, 0, 0, 0] },
]);

const sampleFinalCatalog: ResetCatalogEntry[] = withCosts([
  { name: 'final_xs_bare', dimensions: [0, 2, 0, 2, 0, 0, 1, 2, 1] },
  { name: 'final_xs_pay', dimensions: [2, 2, 0, 1, 1, 0, 2, 3, 3] },
  { name: 'final_xs_pfee', dimensions: [2, 4, 0, 2, 2, 0, 2, 6, 4] },
  { name: 'final_s_pay', dimensions: [2, 6, 0, 2, 3, 0, 3, 8, 5] },
  { name: 'final_s_partial', dimensions: [2, 6, 0, 3, 3, 0, 3, 9, 6] },
  { name: 'final_md_pay', dimensions: [2, 12, 0, 3, 4, 1, 4, 13, 6] },
  { name: 'final_md_partial', dimensions: [2, 12, 0, 4, 4, 1, 4, 16, 8] },
  { name: 'final_lg_pay', dimensions: [4, 20, 0, 4, 5, 1, 5, 20, 8] },
  { name: 'final_lg_partial', dimensions: [4, 24, 0, 6, 6, 2, 6, 24, 12] },
  { name: 'final_xl_universal', dimensions: [16, 32, 16, 16, 16, 16, 16, 32, 16] },
]);

describe('findPrivateKernelResetDimensions', () => {
  describe('selector logic', () => {
    let config: PrivateKernelResetDimensionsConfig;
    let mode: 'inner' | 'finalTail' | 'finalTailToPublic' = 'finalTail';
    let allowRemainder = false;

    // Equal per-dim weights so the synthesized cost is just sum(dimensions).
    const equalWeights = Object.fromEntries(privateKernelResetDimensionNames.map(name => [name, 100])) as {
      [K in DimensionName]: number;
    };

    beforeEach(() => {
      const finalEntries = withCosts(
        [
          { name: 'final_sm', dimensions: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
          { name: 'final_lg', dimensions: [10, 10, 10, 10, 10, 10, 10, 10, 10] },
          { name: 'final_xl', dimensions: [99, 99, 99, 99, 99, 99, 99, 99, 99] },
        ],
        equalWeights,
      );
      config = {
        inner: withCosts(
          [
            { name: 'inner_sm', dimensions: [4, 4, 4, 4, 4, 4, 0, 0, 0] },
            { name: 'inner_lg', dimensions: [16, 16, 16, 16, 16, 16, 0, 0, 0] },
          ],
          equalWeights,
        ),
        // For selector-logic tests we use the same set of finalTail / finalTailToPublic entries;
        // path differentiation is tested separately at the orchestrator layer.
        finalTail: finalEntries,
        finalTailToPublic: finalEntries,
      };

      mode = 'finalTail';
      allowRemainder = false;
    });

    const getDimensions = (requestedDimensions: Partial<FieldsOf<PrivateKernelResetDimensions>> = {}) =>
      findPrivateKernelResetDimensions(
        PrivateKernelResetDimensions.from(requestedDimensions),
        config,
        mode,
        allowRemainder,
      );

    const expectMatchEntry = (dimensions: PrivateKernelResetDimensions, entry: ResetCatalogEntry) => {
      expect(dimensions.toValues()).toEqual(entry.dimensions);
    };

    it('returns the smallest finalTail entry by default', () => {
      const dimensions = getDimensions();
      expectMatchEntry(dimensions, config.finalTail[0]);
    });

    it('picks the cheapest finalTail entry that covers the request', () => {
      const dimensions = getDimensions({
        NULLIFIER_PENDING_READ: 5,
        KEY_VALIDATION: 6,
        NULLIFIER_SILOING: 8,
      });
      expectMatchEntry(dimensions, config.finalTail[1]); // final_lg
    });

    it('falls back to the catch-all when nothing smaller covers the request', () => {
      const dimensions = getDimensions({
        NULLIFIER_PENDING_READ: 50,
        KEY_VALIDATION: 50,
      });
      expectMatchEntry(dimensions, config.finalTail[2]); // final_xl
    });

    it('throws if no finalTail entry can cover and remainder is not allowed', () => {
      config.finalTail = withCosts([{ name: 'tiny', dimensions: [1, 1, 1, 1, 1, 1, 1, 1, 1] }]);
      expect(() => getDimensions({ NULLIFIER_PENDING_READ: 99 })).toThrow();
    });

    it('returns the inner catalog when mode is inner', () => {
      mode = 'inner';
      const dimensions = getDimensions({ KEY_VALIDATION: 4 });
      expectMatchEntry(dimensions, config.inner[0]); // inner_sm
    });

    it('inner entries never carry siloing slots', () => {
      mode = 'inner';
      const dimensions = getDimensions({ KEY_VALIDATION: 8 });
      expect(dimensions.NOTE_HASH_SILOING).toBe(0);
      expect(dimensions.NULLIFIER_SILOING).toBe(0);
      expect(dimensions.PRIVATE_LOG_SILOING).toBe(0);
    });

    it('returns the entry with the smallest remainder when allowRemainder is true', () => {
      config.finalTail = withCosts([
        { name: 'tiny', dimensions: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
        { name: 'mid', dimensions: [50, 50, 50, 50, 50, 50, 50, 50, 50] },
      ]);
      allowRemainder = true;
      const dimensions = getDimensions({ NULLIFIER_PENDING_READ: 200, KEY_VALIDATION: 200 });
      expectMatchEntry(dimensions, config.finalTail[1]); // mid leaves the smallest remainder
    });
  });

  describe('with named-entry catalog', () => {
    const config: PrivateKernelResetDimensionsConfig = {
      inner: sampleInnerCatalog,
      finalTail: sampleFinalCatalog,
      finalTailToPublic: sampleFinalCatalog,
    };

    const pickFinal = (request: Partial<FieldsOf<PrivateKernelResetDimensions>>) =>
      findPrivateKernelResetDimensions(PrivateKernelResetDimensions.from(request), config, 'finalTail', false);

    const pickInner = (request: Partial<FieldsOf<PrivateKernelResetDimensions>>) =>
      findPrivateKernelResetDimensions(PrivateKernelResetDimensions.from(request), config, 'inner', true);

    const entry = (name: string) => {
      const all = [...sampleInnerCatalog, ...sampleFinalCatalog];
      return all.find(e => e.name === name)!;
    };

    it('picks final_xs_bare for a small bare flow', () => {
      const dimensions = pickFinal({
        NOTE_HASH_SETTLED_READ: 1,
        NULLIFIER_SETTLED_READ: 1,
        NOTE_HASH_SILOING: 1,
        NULLIFIER_SILOING: 1,
        PRIVATE_LOG_SILOING: 1,
      });
      expect(dimensions.toValues()).toEqual(entry('final_xs_bare').dimensions);
    });

    it('picks final_xs_pfee for the smallest private-fee shape', () => {
      const dimensions = pickFinal({
        NOTE_HASH_PENDING_READ: 2,
        NOTE_HASH_SETTLED_READ: 4,
        NULLIFIER_SETTLED_READ: 2,
        KEY_VALIDATION: 2,
        NOTE_HASH_SILOING: 2,
        NULLIFIER_SILOING: 6,
        PRIVATE_LOG_SILOING: 4,
      });
      expect(dimensions.toValues()).toEqual(entry('final_xs_pfee').dimensions);
    });

    it('picks final_md_partial for an AMM-shaped request', () => {
      const dimensions = pickFinal({
        NOTE_HASH_PENDING_READ: 2,
        NOTE_HASH_SETTLED_READ: 12,
        NULLIFIER_SETTLED_READ: 4,
        KEY_VALIDATION: 4,
        TRANSIENT_DATA_SQUASHING: 1,
        NOTE_HASH_SILOING: 4,
        NULLIFIER_SILOING: 14,
        PRIVATE_LOG_SILOING: 8,
      });
      expect(dimensions.toValues()).toEqual(entry('final_md_partial').dimensions);
    });

    it('picks final_lg_pay for a large transfer', () => {
      const dimensions = pickFinal({
        NOTE_HASH_PENDING_READ: 4,
        NOTE_HASH_SETTLED_READ: 14,
        NULLIFIER_SETTLED_READ: 4,
        KEY_VALIDATION: 5,
        TRANSIENT_DATA_SQUASHING: 1,
        NOTE_HASH_SILOING: 5,
        NULLIFIER_SILOING: 14,
        PRIVATE_LOG_SILOING: 7,
      });
      expect(dimensions.toValues()).toEqual(entry('final_lg_pay').dimensions);
    });

    it('falls back to final_xl_universal as catch-all', () => {
      const dimensions = pickFinal({
        NOTE_HASH_PENDING_READ: 8,
        NULLIFIER_PENDING_READ: 8,
        KEY_VALIDATION: 10,
      });
      expect(dimensions.toValues()).toEqual(entry('final_xl_universal').dimensions);
    });

    it('selects a multi-dimensional inner entry for mixed inner overflow', () => {
      const dimensions = pickInner({
        NOTE_HASH_PENDING_READ: 8,
        NOTE_HASH_SETTLED_READ: 8,
        NULLIFIER_PENDING_READ: 8,
        NULLIFIER_SETTLED_READ: 8,
        KEY_VALIDATION: 4,
      });
      expect(dimensions.toValues()).toEqual(entry('inner_read_combo_md').dimensions);
    });
  });

});
