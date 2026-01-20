# Pedersen Hash

This module implements the Pedersen hash over the Grumpkin curve.

For a vector of field elements $v = [v0, …, v(n-1)]$, the hash is defined as the x-coordinate of $Hash(v) = n · H_{len} + Commit(v, G)$, where
- $G = [G0, G1, …]$ are domain-separated generators derived via `generator_data`,
- $H_{len}$ is a length generator derived with domain separator `"pedersen_hash_length"`.

The length term avoids trivial collisions arising from the `x(P) = x(-P)` symmetry and to bind the hash to the input length.

## API

- `hash(const std::vector<Fq>& inputs, const GeneratorContext context)`
  - Hashes a vector of field elements using generators from `context`.

- `hash_buffer(const std::vector<uint8_t>& input, const GeneratorContext context)`
  - Converts an arbitrary byte buffer into field elements by splitting into 31-byte chunks, followed by hashing.
  - For >2 chunks it hashes iteratively: `r = hash(e0,e1); r = hash(r,e2); ...`.

## Tests

- `DeriveLengthGenerator`: verifies that the `"pedersen_hash_length"` generator matches a known point.
- `Hash`: regression test for `hash({1,1})`.
- `HashWithIndex`: regression test for `hash({1,1}, offset=5)`.
- `Hash32Bytes`: checks iterative hashing performed within `hash_buffer` on a 32=31+1 byte input.
