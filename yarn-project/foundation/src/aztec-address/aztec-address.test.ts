import { Fr } from '../fields/fields.js';
import { AztecAddress } from './index.js';

describe('aztec-address', () => {
  describe('isValid', () => {
    it('returns true for a valid address', async () => {
      // The point (5, 21888242871839275195798879923479812031525119486506890092185616889232283231735) is on the
      // Grumpkin curve.
      const address = new AztecAddress(new Fr(5));
      expect(await address.isValid()).toEqual(true);
    });

    it('returns false for an invalid address', async () => {
      // No point on the Grumpkin curve has an x coordinate equal to 6.
      const address = new AztecAddress(new Fr(6));
      expect(await address.isValid()).toEqual(false);
    });
  });

  describe('random', () => {
    it('always returns a valid address', async () => {
      for (let i = 0; i < 100; ++i) {
        const address = await AztecAddress.random();
        expect(await address.isValid()).toEqual(true);
      }
    });

    it('returns a different address on each call', async () => {
      const set = new Set();
      for (let i = 0; i < 100; ++i) {
        set.add(await AztecAddress.random());
      }

      expect(set.size).toEqual(100);
    });
  });

  describe('toAddressPoint', () => {
    it("reconstructs an address's point", async () => {
      const address = await AztecAddress.random();
      const point = await address.toAddressPoint();
      expect(point.isOnGrumpkin()).toEqual(true);
    });

    it('throws for an invalid address', async () => {
      const address = new AztecAddress(new Fr(6));
      await expect(address.toAddressPoint()).rejects.toThrow('The given x-coordinate is not on the Grumpkin curve');
    });
  });
});
