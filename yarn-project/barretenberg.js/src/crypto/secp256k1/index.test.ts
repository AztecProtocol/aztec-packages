import { BarretenbergWasm } from '../../wasm/index.js';
import { Secp256k1 } from './index.js';
import { randomBytes } from '@aztec/foundation/crypto';
import { Ecdsa } from '../ecdsa/index.js';

describe('secp256k1', () => {
  let barretenberg!: BarretenbergWasm;
  let secp256k1!: Secp256k1;
  let ecdsa!: Ecdsa;

  beforeAll(async () => {
    barretenberg = new BarretenbergWasm();
    await barretenberg.init();
    secp256k1 = new Secp256k1(barretenberg);
    ecdsa = new Ecdsa(barretenberg);
  });

  it('should correctly compute public key', () => {
    const privateKey = randomBytes(32);
    const lhs = secp256k1.mul(Secp256k1.one, privateKey);
    const rhs = ecdsa.computePublicKey(privateKey);
    expect(lhs).toEqual(rhs);
  });
});
