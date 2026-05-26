// Lightweight stand-in for `@noble/curves/secp256k1` inside the TXE bundle. The real module
// precomputes secp256k1 group and field tables at import (~50–80 ms per worker), and stdlib's
// p2p / block-proposal / committee-attestation types statically import `Signature` from
// `@aztec/foundation/eth-signature` — which uses `secp256k1` for verify/recover/sign. TXE only
// uses `Signature` as a type for instanceof / Zod / serialization; it never verifies an L1
// signature, so the math surface can throw on call without affecting any test.

const SECP_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP_FIELD_ORDER = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

function throwingOp(name: string): never {
  throw new Error(
    `TXE stub: tried to call secp256k1 op '${name}'. TXE has stubbed @noble/curves/secp256k1 ` +
      `because no test path verifies L1 signatures. If this fires, either remove the stub from ` +
      `esbuild.config.mjs or check why TXE is reaching this code path.`,
  );
}

const fieldStub = (byteSize: number, order: bigint) => ({
  BYTES: byteSize,
  ORDER: order,
  MASK: (1n << BigInt(byteSize * 8)) - 1n,
  ZERO: 0n,
  ONE: 1n,
  add: () => throwingOp('add'),
  sub: () => throwingOp('sub'),
  mul: () => throwingOp('mul'),
  div: () => throwingOp('div'),
  neg: () => throwingOp('neg'),
  sqr: () => throwingOp('sqr'),
  sqrt: () => throwingOp('sqrt'),
  pow: () => throwingOp('pow'),
  inv: () => throwingOp('inv'),
  eql: () => throwingOp('eql'),
  isValid: () => throwingOp('isValid'),
  is0: () => throwingOp('is0'),
  create: () => throwingOp('create'),
  fromBytes: () => throwingOp('fromBytes'),
  toBytes: () => throwingOp('toBytes'),
});

export const secp256k1 = {
  CURVE: { n: SECP_ORDER, p: SECP_FIELD_ORDER, Gx: 0n, Gy: 0n },
  fields: { Fp: fieldStub(32, SECP_FIELD_ORDER), Fr: fieldStub(32, SECP_ORDER) },
  ProjectivePoint: {
    ZERO: { x: 0n, y: 0n, z: 0n, equals: () => throwingOp('equals') },
    BASE: { x: 0n, y: 0n, z: 0n },
    fromHex: () => throwingOp('fromHex'),
    fromAffine: () => throwingOp('fromAffine'),
    fromPrivateKey: () => throwingOp('fromPrivateKey'),
  },
  Signature: { fromCompact: () => throwingOp('Signature.fromCompact') },
  utils: {
    randomPrivateKey: () => throwingOp('randomPrivateKey'),
    isValidPrivateKey: () => throwingOp('isValidPrivateKey'),
    normPrivateKeyToScalar: () => throwingOp('normPrivateKeyToScalar'),
  },
  getPublicKey: () => throwingOp('getPublicKey'),
  sign: () => throwingOp('sign'),
  verify: () => throwingOp('verify'),
  getSharedSecret: () => throwingOp('getSharedSecret'),
};
