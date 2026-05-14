# SSA Fuzzer Programs Proving Workers

Workers that consume Noir programs from Redis queue and validate them using Barretenberg (bb).

## Purpose

These workers complement the [ssa_fuzzer](https://github.com/noir-lang/noir/tree/master/tooling/ssa_fuzzer) by:

1. **Consuming fuzzer output**: Retrieving Noir programs and witnesses from Redis queue
2. **Proof generation**: Using bb to generate proofs for the programs (bb prove)
3. **Proof verification**: Validating the generated proofs to ensure correctness (bb write_vk ... && bb verify ...)
4. **Continuous validation**: Running as background workers to process fuzzer output in real-time

## Including acir_components_check (optional)

To include the `acir_components_check` binary in the image (for ACIR/circuit component consistency checks), build it and copy it into this directory before building the image:

```bash
# From barretenberg/cpp
cmake --preset default && cmake --build build --target acir_components_check

# From barretenberg/security/ssa_fuzzer_programs_proving
./prepare_binaries.sh
```

Then build the image as usual; the binary will be at `/app/proving/acir_components_check` in the container.