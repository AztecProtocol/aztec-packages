import { Fr } from '../fields/fields.js';
import { AztecAddress } from './index.js';

describe('aztec-address', () => {
  describe('isValid', () => {
    it('returns true for a valid address', () => {
      // The point (5, 21888242871839275195798879923479812031525119486506890092185616889232283231735) is on the
      // Grumpkin curve.
      const address = new AztecAddress(new Fr(5));
      expect(address.isValid()).toEqual(true);
    });

    it('returns false for an invalid address', () => {
      // No point on the Grumpkin curve has an x coordinate equal to 6.
      const address = new AztecAddress(new Fr(6));
      expect(address.isValid()).toEqual(false);
    });
  });

  describe('random', () => {
    it('always returns a valid address', () => {
      for (let i = 0; i < 100; ++i) {
        const address = AztecAddress.random();
        expect(address.isValid()).toEqual(true);
      }
    });

    it('returns a different address on each call', () => {
      const set = new Set();
      for (let i = 0; i < 100; ++i) {
        set.add(AztecAddress.random());
      }

      expect(set.size).toEqual(100);
    });
  });

  describe('toAddressPoint', () => {
    it("reconstructs an address's point", () => {
      const address = AztecAddress.random();
      const point = address.toAddressPoint();
      expect(point.isOnGrumpkin()).toEqual(true);
    });

    it('throws for an invalid address', () => {
      const address = new AztecAddress(new Fr(6));
      expect(() => address.toAddressPoint()).toThrow('The given x-coordinate is not on the Grumpkin curve');
    });
  });
});
