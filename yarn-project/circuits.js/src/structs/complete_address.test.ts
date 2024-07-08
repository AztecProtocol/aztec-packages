import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr, Point } from '@aztec/foundation/fields';

import { PublicKeys } from '../types/public_keys.js';
import { CompleteAddress } from './complete_address.js';

describe('CompleteAddress', () => {
  it('refuses to add an account with incorrect address for given partial address and pubkey', () => {
    expect(
      () =>
        new CompleteAddress(
          AztecAddress.random(),
          new PublicKeys(Point.random(), Point.random(), Point.random(), Point.random()),
          Fr.random(),
        ),
    ).toThrow(/cannot be derived/);
  });

  it('equals returns true when 2 instances are equal', () => {
    const address1 = CompleteAddress.random();
    const address2 = new CompleteAddress(address1.address, address1.publicKeys, address1.partialAddress);
    expect(address1.equals(address2)).toBe(true);
  });

  it('equals returns true when 2 instances are not equal', () => {
    const address1 = CompleteAddress.random();
    const address2 = CompleteAddress.random();
    expect(address1.equals(address2)).toBe(false);
  });

  it('serializes / deserializes correctly', () => {
    const expectedAddress = CompleteAddress.random();
    const address = CompleteAddress.fromBuffer(expectedAddress.toBuffer());
    expect(address.equals(expectedAddress)).toBe(true);
  });

  it('instantiates from string and individual components', () => {
    // docs:start:instantiate-complete-address
    // Typically a recipient would share their complete address with the sender
    const completeAddressFromString = CompleteAddress.fromString(
      '0x0cdf0624b9beb07765aa335e338e70a0f20cecf676d2839d313bcd16907908aa076e2964e8fb3d4669fa127e204f12c99324661339428430e92fe25311e1f09c043581d8fa06c969bb4fb4c21545e0d1557d560857d38c04d9ec2a1cc435f250000ca197fdc42af151dd4738c6d912d0c1d222489e869c8338cf27d33aeb55e229293b563b21ac0a5ee520f056c5c8aa68f2863e70e322e94ce886749cb659f0b9002e01a055b78b2213b6d9dda210632b29789f1149a9391c3ae7a99a637061d0502659afcf20810bc0862e655a707cee49868dc9692583b03f1b25660caa68d7140029d2b859823de1005e622f5531f84c80fc219aef05f38a89dcb9cffd0b0ad78c07d0b60376b9ef3c78c40a4e644c0d11822efc0bb9b49c19ce12e4fd86e5a13c0011c6c689ddfd672f98d849f08ba6f6816efeb734c395eb79abe6a2f85089e1a9',
    );

    // Alternatively, a recipient could share the individual components with the sender
    const address = Fr.fromString('0x0cdf0624b9beb07765aa335e338e70a0f20cecf676d2839d313bcd16907908aa');
    const npkM = Point.fromString(
      '0x076e2964e8fb3d4669fa127e204f12c99324661339428430e92fe25311e1f09c043581d8fa06c969bb4fb4c21545e0d1557d560857d38c04d9ec2a1cc435f25000',
    );
    const ivpkM = Point.fromString(
      '0x0ca197fdc42af151dd4738c6d912d0c1d222489e869c8338cf27d33aeb55e229293b563b21ac0a5ee520f056c5c8aa68f2863e70e322e94ce886749cb659f0b900',
    );
    const ovpkM = Point.fromString(
      '0x2e01a055b78b2213b6d9dda210632b29789f1149a9391c3ae7a99a637061d0502659afcf20810bc0862e655a707cee49868dc9692583b03f1b25660caa68d71400',
    );
    const tpkM = Point.fromString(
      '0x29d2b859823de1005e622f5531f84c80fc219aef05f38a89dcb9cffd0b0ad78c07d0b60376b9ef3c78c40a4e644c0d11822efc0bb9b49c19ce12e4fd86e5a13c00',
    );

    const partialAddress = Fr.fromString('0x11c6c689ddfd672f98d849f08ba6f6816efeb734c395eb79abe6a2f85089e1a9');

    const completeAddressFromComponents = new CompleteAddress(
      address,
      new PublicKeys(npkM, ivpkM, ovpkM, tpkM),
      partialAddress,
    );
    // docs:end:instantiate-complete-address

    expect(completeAddressFromComponents.equals(completeAddressFromString)).toBe(true);
  });
});
