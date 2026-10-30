# Pedersen Hash and Commitment

This module implements the Pedersen hash (`crypto/pedersen_hash`) and commitment (`crypto/pedersen_commitment`) over the Grumpkin curve.

## Pedersen Commitment
For a vector of field elements $x = [x_0, \dots, x_{n-1}]$, the commitment is $Commit(x) = \sum_{i=0}^{n-1} x_i \cdot G_i$, where $G = [G_0, G_1, \dots]$ are generators derived via `generator_data`.

## Pedersen Hash
For a vector of field elements $v = [v_0, \ldots, v_{n-1}]$, the hash is defined as the x-coordinate of $Hash(v) = n · H_{len} + Commit(v)$, where $H_{len}$ is a length generator derived with domain separator `"pedersen_hash_length"`.

The length term prevents the trivial collision `Hash(v) = Hash(-v)` (from `x(P) = x(-P)`) and binds the hash to the input length.

## API
### Hash
- `static Fq hash(const std::vector<Fq>& inputs, const GeneratorContext& context = {})`
  - Hashes a vector of field elements using generators from `context` (default generators if omitted).
  - Empty input aborts.

- `static Fq hash_buffer(const std::vector<uint8_t>& input, const GeneratorContext& context = {})`
  - Converts an arbitrary byte buffer into field elements by splitting into 31-byte chunks, followed by hashing.
  - 1 chunk: `hash({e0})`. 2 or more chunks: `r = hash({e0, e1})`, then `r = hash({r, e_i})` for each further chunk.
  - Empty input aborts.

### Commitment
- `static AffineElement commit_native(const std::vector<Fq>& inputs, const GeneratorContext& context = {})`
  - Computes $Commit(inputs)$ using generators from `context`.

## Tests
### Hash tests
- `DeriveLengthGenerator`: verifies that the `"pedersen_hash_length"` generator matches a known point.
- `Hash`: regression test for `hash({1,1})`.
- `HashWithIndex`: regression test for `hash({1,1}, offset=5)`.
- `Hash32Bytes`: a 32-byte buffer (31+1-byte chunks) hashes to `hash({e0, e1})`.
- `HashRejectsEmptyInput`, `HashBufferRejectsEmptyInput`: empty input aborts.

### Commitment tests
Commitment tests are in `crypto/pedersen_commitment/pedersen.test.cpp`.
- `Commitment`: regression test for `commit_native({1,1})`.
- `CommitmentWithZero`: regression test for `commit_native({0,1})`.
