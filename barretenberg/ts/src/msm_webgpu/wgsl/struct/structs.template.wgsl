struct Point {
  x: BigInt,
  y: BigInt,
  z: BigInt
}

struct BigInt {
    limbs: array<u32, {{ num_words }}>
}
