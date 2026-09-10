import { findBbBinary } from '@aztec-foundation/bb.js-api';
import { execFileSync } from 'child_process';
import { Decoder } from 'msgpackr';

import {
  BN254_FQ_MODULUS,
  BN254_FR_MODULUS,
  BN254_G1_GENERATOR,
  BN254_G2_GENERATOR,
  GRUMPKIN_FQ_MODULUS,
  GRUMPKIN_FR_MODULUS,
  GRUMPKIN_G1_GENERATOR,
  SECP256K1_FQ_MODULUS,
  SECP256K1_FR_MODULUS,
  SECP256K1_G1_GENERATOR,
  SECP256R1_FQ_MODULUS,
  SECP256R1_FR_MODULUS,
  SECP256R1_G1_GENERATOR,
} from './curve_constants.js';

// The constants are written out in curve_constants.ts; bb computes the same values from the curve
// definitions it is compiled against. If the two ever disagree, one of them is wrong.
describe('curve constants', () => {
  const bb = findBbBinary();
  const itWithBb = bb ? it : it.skip;

  itWithBb('match the curves bb is built against', () => {
    const emitted = execFileSync(bb!, ['msgpack', 'curve_constants'], {
      maxBuffer: 1024 * 1024,
    });
    const actual = new Decoder({ useRecords: false }).decode(emitted) as Record<string, any>;

    const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
    const point = (p: { x: Uint8Array; y: Uint8Array }) => [hex(p.x), hex(p.y)];
    const pointFq2 = (p: { x: readonly Uint8Array[]; y: readonly Uint8Array[] }) => [p.x.map(hex), p.y.map(hex)];
    const asModulus = (b: Uint8Array) => BigInt(`0x${hex(b)}`);

    expect(asModulus(actual.bn254_fr_modulus)).toEqual(BN254_FR_MODULUS);
    expect(asModulus(actual.bn254_fq_modulus)).toEqual(BN254_FQ_MODULUS);
    expect(point(actual.bn254_g1_generator)).toEqual(point(BN254_G1_GENERATOR));
    expect(pointFq2(actual.bn254_g2_generator)).toEqual(pointFq2(BN254_G2_GENERATOR));

    expect(asModulus(actual.grumpkin_fr_modulus)).toEqual(GRUMPKIN_FR_MODULUS);
    expect(asModulus(actual.grumpkin_fq_modulus)).toEqual(GRUMPKIN_FQ_MODULUS);
    expect(point(actual.grumpkin_g1_generator)).toEqual(point(GRUMPKIN_G1_GENERATOR));

    expect(asModulus(actual.secp256k1_fr_modulus)).toEqual(SECP256K1_FR_MODULUS);
    expect(asModulus(actual.secp256k1_fq_modulus)).toEqual(SECP256K1_FQ_MODULUS);
    expect(point(actual.secp256k1_g1_generator)).toEqual(point(SECP256K1_G1_GENERATOR));

    expect(asModulus(actual.secp256r1_fr_modulus)).toEqual(SECP256R1_FR_MODULUS);
    expect(asModulus(actual.secp256r1_fq_modulus)).toEqual(SECP256R1_FQ_MODULUS);
    expect(point(actual.secp256r1_g1_generator)).toEqual(point(SECP256R1_G1_GENERATOR));
  });
});
