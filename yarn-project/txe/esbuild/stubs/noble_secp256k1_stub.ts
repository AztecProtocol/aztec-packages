import { throwTrap } from '@aztec/foundation/error';

const SECP_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP_FIELD_ORDER = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

const fieldStub = (byteSize: number, order: bigint) => ({
  BYTES: byteSize,
  ORDER: order,
  MASK: (1n << BigInt(byteSize * 8)) - 1n,
  ZERO: 0n,
  ONE: 1n,
  add: () => throwTrap('secp256k1.add'),
  sub: () => throwTrap('secp256k1.sub'),
  mul: () => throwTrap('secp256k1.mul'),
  div: () => throwTrap('secp256k1.div'),
  neg: () => throwTrap('secp256k1.neg'),
  sqr: () => throwTrap('secp256k1.sqr'),
  sqrt: () => throwTrap('secp256k1.sqrt'),
  pow: () => throwTrap('secp256k1.pow'),
  inv: () => throwTrap('secp256k1.inv'),
  eql: () => throwTrap('secp256k1.eql'),
  isValid: () => throwTrap('secp256k1.isValid'),
  is0: () => throwTrap('secp256k1.is0'),
  create: () => throwTrap('secp256k1.create'),
  fromBytes: () => throwTrap('secp256k1.fromBytes'),
  toBytes: () => throwTrap('secp256k1.toBytes'),
});

export const secp256k1 = {
  CURVE: { n: SECP_ORDER, p: SECP_FIELD_ORDER, Gx: 0n, Gy: 0n },
  fields: { Fp: fieldStub(32, SECP_FIELD_ORDER), Fr: fieldStub(32, SECP_ORDER) },
  ProjectivePoint: {
    ZERO: { x: 0n, y: 0n, z: 0n, equals: () => throwTrap('secp256k1.equals') },
    BASE: { x: 0n, y: 0n, z: 0n },
    fromHex: () => throwTrap('secp256k1.fromHex'),
    fromAffine: () => throwTrap('secp256k1.fromAffine'),
    fromPrivateKey: () => throwTrap('secp256k1.fromPrivateKey'),
  },
  Signature: { fromCompact: () => throwTrap('secp256k1.Signature.fromCompact') },
  utils: {
    randomPrivateKey: () => throwTrap('secp256k1.randomPrivateKey'),
    isValidPrivateKey: () => throwTrap('secp256k1.isValidPrivateKey'),
    normPrivateKeyToScalar: () => throwTrap('secp256k1.normPrivateKeyToScalar'),
  },
  getPublicKey: () => throwTrap('secp256k1.getPublicKey'),
  sign: () => throwTrap('secp256k1.sign'),
  verify: () => throwTrap('secp256k1.verify'),
  getSharedSecret: () => throwTrap('secp256k1.getSharedSecret'),
};
