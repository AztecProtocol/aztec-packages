// Lightweight stand-in for `@noble/curves/bls12-381` inside the TXE bundle. The real module
// runs ~150 ms of field-tower precomputation (Fp2 multiplication tables, G1 generator setup,
// etc.) at import time so that `BLS12Point`/`BLS12Fq`/`BLS12Fr` static initializers in
// `@aztec/foundation/curves/bls12` can read e.g. `bls12_381.G1.CURVE.Gx`. TXE never executes
// BLS12 arithmetic — the surface is reachable only through stdlib's rollup types (which TXE
// imports for `instanceof`/`zod` but never constructs). The stub exposes the static fields
// referenced at module-load and throws on any actual arithmetic call so a regression surfaces
// loudly instead of returning silently wrong values.
//
// Constants are the real BLS12-381 prime/scalar field orders so any code that reads
// `MODULUS` at module-load gets a plausible value.

const BLS12_FR_ORDER = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001n;
const BLS12_FP_ORDER =
  0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaabn;

function throwingOp(name: string): never {
  throw new Error(
    `TXE stub: tried to call BLS12-381 field op '${name}'. TXE has stubbed @noble/curves/bls12-381 ` +
      `because no test path uses BLS12 arithmetic. If this fires, either remove the stub from ` +
      `esbuild.config.mjs or check why TXE is reaching this code path.`,
  );
}

function makeFieldStub(byteSize: number, order: bigint) {
  return {
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
  };
}

const projectivePointStub = {
  ZERO: { x: 0n, y: 0n, z: 0n, equals: (_other: unknown) => throwingOp('equals') },
};

export const bls12_381 = {
  fields: {
    Fr: makeFieldStub(32, BLS12_FR_ORDER),
    Fp: makeFieldStub(48, BLS12_FP_ORDER),
  },
  G1: {
    CURVE: { Gx: 0n, Gy: 0n },
    ProjectivePoint: projectivePointStub,
    weierstrassEquation: () => throwingOp('weierstrassEquation'),
  },
};
