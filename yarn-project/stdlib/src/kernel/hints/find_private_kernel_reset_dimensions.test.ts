import type { FieldsOf } from '@aztec/foundation/types';

import {
  type DimensionName,
  PrivateKernelResetDimensions,
  type PrivateKernelResetDimensionsConfig,
  privateKernelResetDimensionNames,
} from '../private_kernel_reset_dimensions.js';
import { findPrivateKernelResetDimensions } from './find_private_kernel_reset_dimensions.js';

describe('findPrivateKernelResetDimensions', () => {
  let config: PrivateKernelResetDimensionsConfig;
  let isInner = false;
  let allowRemainder = false;

  beforeEach(() => {
    config = {
      dimensions: {
        NOTE_HASH_PENDING_READ: {
          variants: [1],
          standalone: [],
          cost: 100,
        },
        NOTE_HASH_SETTLED_READ: {
          variants: [2, 4],
          standalone: [6],
          cost: 100,
        },
        NULLIFIER_PENDING_READ: {
          variants: [3, 6, 9],
          standalone: [],
          cost: 100,
        },
        NULLIFIER_SETTLED_READ: {
          variants: [4, 8],
          standalone: [12],
          cost: 100,
        },
        KEY_VALIDATION: {
          variants: [5, 10],
          standalone: [15, 20, 25],
          cost: 100,
        },
        TRANSIENT_DATA_SQUASHING: {
          variants: [6],
          standalone: [12],
          cost: 100,
        },
        NOTE_HASH_SILOING: {
          variants: [7, 14, 21],
          standalone: [28, 35],
          cost: 100,
        },
        NULLIFIER_SILOING: {
          variants: [8, 16],
          standalone: [24],
          cost: 100,
        },
        PRIVATE_LOG_SILOING: {
          variants: [9],
          standalone: [18],
          cost: 100,
        },
      },
      specialCases: [],
    };

    isInner = false;
    allowRemainder = false;
  });

  const getDimensions = (requestedDimensions: Partial<FieldsOf<PrivateKernelResetDimensions>> = {}) =>
    findPrivateKernelResetDimensions(
      PrivateKernelResetDimensions.from(requestedDimensions),
      config,
      isInner,
      allowRemainder,
    );

  const expectEqualDimensions = (
    dimensions: PrivateKernelResetDimensions,
    {
      NOTE_HASH_PENDING_READ,
      NOTE_HASH_SETTLED_READ,
      NULLIFIER_PENDING_READ,
      NULLIFIER_SETTLED_READ,
      KEY_VALIDATION,
      TRANSIENT_DATA_SQUASHING,
      NOTE_HASH_SILOING,
      NULLIFIER_SILOING,
      PRIVATE_LOG_SILOING,
    }: Partial<{ [K in DimensionName]: number }> = {},
  ) => {
    const expected = new PrivateKernelResetDimensions(
      NOTE_HASH_PENDING_READ ?? 1,
      NOTE_HASH_SETTLED_READ ?? 2,
      NULLIFIER_PENDING_READ ?? 3,
      NULLIFIER_SETTLED_READ ?? 4,
      KEY_VALIDATION ?? 5,
      TRANSIENT_DATA_SQUASHING ?? 6,
      NOTE_HASH_SILOING ?? 7,
      NULLIFIER_SILOING ?? 8,
      PRIVATE_LOG_SILOING ?? 9,
    );

    expect(dimensions).toEqual(expected);
  };

  const expectEqualStandalone = (dimensions: PrivateKernelResetDimensions, name: DimensionName, value: number) => {
    const expected = PrivateKernelResetDimensions.empty();
    expected[name] = value;
    expect(dimensions).toEqual(expected);
  };

  const expectEqualSpecialCase = (dimensions: PrivateKernelResetDimensions, specialCaseIndex: number) => {
    expect(dimensions).toEqual(PrivateKernelResetDimensions.fromValues(config.specialCases[specialCaseIndex]));
  };

  describe('only variant', () => {
    beforeEach(() => {
      // Clear standalone values to focus on testing picking options among available variants.
      privateKernelResetDimensionNames.forEach(name => (config.dimensions[name].standalone = []));
    });

    it('returns smallest dimensions by default', () => {
      const dimensions = getDimensions();
      expectEqualDimensions(dimensions);
    });

    it('finds the cheapest option for all dimensions', () => {
      const dimensions = getDimensions({
        NOTE_HASH_PENDING_READ: 1,
        NOTE_HASH_SETTLED_READ: 3,
        NULLIFIER_PENDING_READ: 4,
        NULLIFIER_SETTLED_READ: 5,
        KEY_VALIDATION: 6,
        TRANSIENT_DATA_SQUASHING: 4,
        NOTE_HASH_SILOING: 9,
        NULLIFIER_SILOING: 11,
        PRIVATE_LOG_SILOING: 7,
      });

      expectEqualDimensions(dimensions, {
        NOTE_HASH_PENDING_READ: 1,
        NOTE_HASH_SETTLED_READ: 4,
        NULLIFIER_PENDING_READ: 6,
        NULLIFIER_SETTLED_READ: 8,
        KEY_VALIDATION: 10,
        TRANSIENT_DATA_SQUASHING: 6,
        NOTE_HASH_SILOING: 14,
        NULLIFIER_SILOING: 16,
        PRIVATE_LOG_SILOING: 9,
      });
    });

    it('finds the cheapest option for partial dimensions', () => {
      const dimensions = getDimensions({
        NULLIFIER_PENDING_READ: 7,
        KEY_VALIDATION: 7,
        NULLIFIER_SILOING: 11,
      });

      expectEqualDimensions(dimensions, {
        NULLIFIER_PENDING_READ: 9,
        KEY_VALIDATION: 10,
        NULLIFIER_SILOING: 16,
      });
    });
  });

  describe('with standalone', () => {
    it('uses standalone for one dimension', () => {
      const dimensions = getDimensions({
        PRIVATE_LOG_SILOING: 8,
      });

      expectEqualStandalone(dimensions, 'PRIVATE_LOG_SILOING', 18);
    });

    it('uses variant for one dimension if standalone is more expensive', () => {
      // Increase the cost so it's more expensive running all the extra siloing.
      config.dimensions.PRIVATE_LOG_SILOING.cost = 9999;

      const dimensions = getDimensions({
        PRIVATE_LOG_SILOING: 8,
      });

      expectEqualDimensions(dimensions, { PRIVATE_LOG_SILOING: 9 });
    });
  });

  describe('with special cases', () => {
    beforeEach(() => {
      config.specialCases = [
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
        [99, 99, 99, 99, 99, 99, 99, 99, 99],
      ];
    });

    it('returns smallest special case by default', () => {
      const dimensions = getDimensions();
      expectEqualSpecialCase(dimensions, 0);
    });

    it('returns the option to reset all dimensions', () => {
      const dimensions = getDimensions({
        NULLIFIER_PENDING_READ: 88,
        KEY_VALIDATION: 88,
        NULLIFIER_SILOING: 88,
      });

      expectEqualSpecialCase(dimensions, 1);
    });

    it('picks cheapest option among variants', () => {
      const dimensions = getDimensions({
        NULLIFIER_PENDING_READ: 5,
        KEY_VALIDATION: 7,
        NULLIFIER_SILOING: 9,
      });

      expectEqualDimensions(dimensions, {
        NULLIFIER_PENDING_READ: 6,
        KEY_VALIDATION: 10,
        NULLIFIER_SILOING: 16,
      });
    });

    it('picks cheapest option among standalone', () => {
      const dimensions = getDimensions({
        PRIVATE_LOG_SILOING: 8,
      });

      expectEqualStandalone(dimensions, 'PRIVATE_LOG_SILOING', 18);
    });
  });

  describe('is inner', () => {
    it('returns the option that does not perform siloing', () => {
      // Increase the cost so it's more expensive running a key verification check.
      config.dimensions.KEY_VALIDATION.cost = 9999;

      isInner = false;
      {
        const dimensions = getDimensions({
          KEY_VALIDATION: 4,
        });

        expectEqualDimensions(dimensions, { KEY_VALIDATION: 5 });
      }

      isInner = true;
      {
        const dimensions = getDimensions({
          KEY_VALIDATION: 8,
        });

        expectEqualStandalone(dimensions, 'KEY_VALIDATION', 15);
      }
    });
  });

  describe('allow remainder', () => {
    const request = {
      NULLIFIER_PENDING_READ: 88,
      KEY_VALIDATION: 88,
      NULLIFIER_SILOING: 88,
    };

    it('finds the option that can reset the most values', () => {
      allowRemainder = false;
      expect(() => getDimensions(request)).toThrow();

      allowRemainder = true;
      {
        const dimensions = getDimensions(request);

        expectEqualDimensions(dimensions, {
          NULLIFIER_PENDING_READ: 9,
          KEY_VALIDATION: 10,
          NULLIFIER_SILOING: 16,
        });
      }
    });

    it('finds the option in special cases that can reset the most values', () => {
      config.specialCases = [
        [1, 1, 1, 1, 1, 1, 1, 1, 1],
        [77, 77, 77, 77, 77, 77, 77, 77, 77],
      ];

      allowRemainder = false;
      expect(() => getDimensions(request)).toThrow();

      allowRemainder = true;
      expectEqualSpecialCase(getDimensions(request), 1);
    });
  });
});
