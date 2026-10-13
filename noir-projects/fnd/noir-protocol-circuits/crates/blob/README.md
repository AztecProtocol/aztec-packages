# blob

Library crate for blob batching in the rollup circuits: blob evaluation and batched KZG commitments over BLS12-381, using the vendored `bignum` and `bigcurve` crates. `src/abis/blob_accumulator.nr` describes the batching scheme.

It has no circuit artifact of its own. Run its tests with `nargo test` from this directory; to profile it, profile a circuit that uses it, for example `./scripts/flamegraph.sh rollup_checkpoint_root` from `noir-protocol-circuits/`.
