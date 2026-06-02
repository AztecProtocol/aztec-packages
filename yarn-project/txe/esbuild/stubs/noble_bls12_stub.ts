import { throwStub } from './stub_helpers.js';

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
    add: () => throwStub('bls12_381.add'),
    sub: () => throwStub('bls12_381.sub'),
    mul: () => throwStub('bls12_381.mul'),
    div: () => throwStub('bls12_381.div'),
    neg: () => throwStub('bls12_381.neg'),
    sqr: () => throwStub('bls12_381.sqr'),
    sqrt: () => throwStub('bls12_381.sqrt'),
    pow: () => throwStub('bls12_381.pow'),
    inv: () => throwStub('bls12_381.inv'),
    eql: () => throwStub('bls12_381.eql'),
    isValid: () => throwStub('bls12_381.isValid'),
    is0: () => throwStub('bls12_381.is0'),
    create: () => throwStub('bls12_381.create'),
    fromBytes: () => throwStub('bls12_381.fromBytes'),
    toBytes: () => throwStub('bls12_381.toBytes'),
  };
}

const projectivePointStub = {
  ZERO: { x: 0n, y: 0n, z: 0n, equals: (_other: unknown) => throwStub('bls12_381.equals') },
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
    weierstrassEquation: () => throwStub('bls12_381.weierstrassEquation'),
  },
};
