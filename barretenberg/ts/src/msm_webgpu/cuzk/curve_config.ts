import {
  BN254_BASE_FIELD,
  BN254_SCALAR_FIELD,
  BN254_ZERO,
  Bn254Point,
  addBn254Points,
  createBn254AffinePoint,
  getBn254BigIntXY,
  scalarMultBn254Point,
} from "./bn254.js";

export type CurveId = "bn254";

export type CpuPoint = Bn254Point;

export type CurveConfig = {
  id: CurveId;
  baseFieldModulus: bigint;
  // The curve's scalar field Fr (prime order of G1). Sumcheck arithmetic
  // lives entirely in Fr, so the WebGPU Fr Montgomery suite is rendered by
  // pointing ShaderManager's modulus at this instead of baseFieldModulus.
  scalarFieldModulus: bigint;
  scalarBitLength: number;
  coordinateBitLength: number;
  coordinateByteLength: number;
  scalarByteLength: number;
  wordSize: number;
  zero: CpuPoint;
  createAffinePoint: (x: bigint, y: bigint, z: bigint) => CpuPoint;
  addPoints: (left: CpuPoint, right: CpuPoint) => CpuPoint;
  scalarMult: (point: CpuPoint, scalar: bigint) => CpuPoint;
  toAffine: (point: CpuPoint) => CpuPoint;
  getBigIntXY: (point: CpuPoint) => { x: bigint; y: bigint };
};

export const BN254_CURVE_CONFIG: CurveConfig = {
  id: "bn254",
  baseFieldModulus: BN254_BASE_FIELD,
  scalarFieldModulus: BN254_SCALAR_FIELD,
  // 256 is the scalar BUFFER width, not the Fr bit-length (254). Keeping
  // the buffer width here is load-bearing: the decompose shader's
  // top-chunk override formula
  //   shift = (NUM_SUBTASKS*CHUNK_SIZE - scalar_bitlength) + 16 - CHUNK_SIZE
  // wraps in u32 when scalar_bitlength=256 and the (negative) intermediate
  // result yields shift = 0, which happens to make `scalar_bytes[0] >> 0`
  // equal to the desired top 16 bits (and for Fr the top 2 bits are 0,
  // so this matches what natural extract would produce). Setting
  // scalar_bitlength=254 makes shift=2, which incorrectly drops 2 low
  // bits of the top chunk.
  scalarBitLength: 256,
  coordinateBitLength: 256,
  coordinateByteLength: 32,
  scalarByteLength: 32,
  wordSize: 13,
  zero: BN254_ZERO,
  createAffinePoint: (x, y, z) => createBn254AffinePoint(x, y, z),
  addPoints: (left, right) => addBn254Points(left, right),
  scalarMult: (point, scalar) => scalarMultBn254Point(point, scalar),
  toAffine: (point) => point,
  getBigIntXY: (point) => getBn254BigIntXY(point),
};
