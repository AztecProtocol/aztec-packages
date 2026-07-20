import { throwStub } from './stub_helpers.js';

const SECP_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP_FIELD_ORDER = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

const fieldStub = (byteSize: number, order: bigint) => ({
  BYTES: byteSize,
  ORDER: order,
  MASK: (1n << BigInt(byteSize * 8)) - 1n,
  ZERO: 0n,
  ONE: 1n,
  add: () => throwStub('secp256k1.add'),
  sub: () => throwStub('secp256k1.sub'),
  mul: () => throwStub('secp256k1.mul'),
  div: () => throwStub('secp256k1.div'),
  neg: () => throwStub('secp256k1.neg'),
  sqr: () => throwStub('secp256k1.sqr'),
  sqrt: () => throwStub('secp256k1.sqrt'),
  pow: () => throwStub('secp256k1.pow'),
  inv: () => throwStub('secp256k1.inv'),
  eql: () => throwStub('secp256k1.eql'),
  isValid: () => throwStub('secp256k1.isValid'),
  is0: () => throwStub('secp256k1.is0'),
  create: () => throwStub('secp256k1.create'),
  fromBytes: () => throwStub('secp256k1.fromBytes'),
  toBytes: () => throwStub('secp256k1.toBytes'),
});

export const secp256k1 = {
  CURVE: { n: SECP_ORDER, p: SECP_FIELD_ORDER, Gx: 0n, Gy: 0n },
  fields: { Fp: fieldStub(32, SECP_FIELD_ORDER), Fr: fieldStub(32, SECP_ORDER) },
  ProjectivePoint: {
    ZERO: { x: 0n, y: 0n, z: 0n, equals: () => throwStub('secp256k1.equals') },
    BASE: { x: 0n, y: 0n, z: 0n },
    fromHex: () => throwStub('secp256k1.fromHex'),
    fromAffine: () => throwStub('secp256k1.fromAffine'),
    fromPrivateKey: () => throwStub('secp256k1.fromPrivateKey'),
  },
  Signature: { fromCompact: () => throwStub('secp256k1.Signature.fromCompact') },
  utils: {
    randomPrivateKey: () => throwStub('secp256k1.randomPrivateKey'),
    isValidPrivateKey: () => throwStub('secp256k1.isValidPrivateKey'),
    normPrivateKeyToScalar: () => throwStub('secp256k1.normPrivateKeyToScalar'),
  },
  getPublicKey: () => throwStub('secp256k1.getPublicKey'),
  sign: () => throwStub('secp256k1.sign'),
  verify: () => throwStub('secp256k1.verify'),
  getSharedSecret: () => throwStub('secp256k1.getSharedSecret'),
};
