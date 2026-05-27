import { throwTrap } from '@aztec/foundation/error';

const BLS12_FR_ORDER = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;
const BLS12_FP_ORDER =
  0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;

function makeFieldStub(byteSize: number, order: bigint) {
  return {
    BYTES: byteSize,
    ORDER: order,
    MASK: (1n << BigInt(byteSize * 8)) - 1n,
    ZERO: 0n,
    ONE: 1n,
    add: () => throwTrap('bls12_381.add'),
    sub: () => throwTrap('bls12_381.sub'),
    mul: () => throwTrap('bls12_381.mul'),
    div: () => throwTrap('bls12_381.div'),
    neg: () => throwTrap('bls12_381.neg'),
    sqr: () => throwTrap('bls12_381.sqr'),
    sqrt: () => throwTrap('bls12_381.sqrt'),
    pow: () => throwTrap('bls12_381.pow'),
    inv: () => throwTrap('bls12_381.inv'),
    eql: () => throwTrap('bls12_381.eql'),
    isValid: () => throwTrap('bls12_381.isValid'),
    is0: () => throwTrap('bls12_381.is0'),
    create: () => throwTrap('bls12_381.create'),
    fromBytes: () => throwTrap('bls12_381.fromBytes'),
    toBytes: () => throwTrap('bls12_381.toBytes'),
  };
}

const projectivePointStub = {
  ZERO: { x: 0n, y: 0n, z: 0n, equals: (_other: unknown) => throwTrap('bls12_381.equals') },
};

// eslint-disable-next-line camelcase
export const bls12_381 = {
  fields: {
    Fr: makeFieldStub(32, BLS12_FR_ORDER),
    Fp: makeFieldStub(48, BLS12_FP_ORDER),
  },
  G1: {
    CURVE: { Gx: 0n, Gy: 0n },
    ProjectivePoint: projectivePointStub,
    weierstrassEquation: () => throwTrap('bls12_381.weierstrassEquation'),
  },
};
