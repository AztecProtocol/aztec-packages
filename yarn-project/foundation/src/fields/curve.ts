export enum Curve {
  GRUMPKIN,
  SECP256K1,
}

export const curveModulus: { [key in Curve]: bigint } = {
  [Curve.GRUMPKIN]: 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n,
  [Curve.SECP256K1]: 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn,
};
