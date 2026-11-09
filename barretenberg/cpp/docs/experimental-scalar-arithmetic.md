# Experimental scalar arithmetic

`BB_EXPERIMENTAL_SCALAR_ARITHMETIC` is one compile-time option, defaulting to `OFF`. It enables:

- Short-carry Montgomery multiplication and low-half squaring on ADX targets.
- Batched `compute_divsteps_vartime` in the native and WASM `compute_divstep_matrix` methods.
- `drain_batch_scalar` and `tree_reduce_in_place_scalar` when field SIMD is unavailable.

Existing field methods and public MSM interfaces keep their names. Inversion remains variable time; the constant-time inversion interface keeps its implementation. Architecture guards still apply, so a build only uses the kernels supported by its target.

From `barretenberg/cpp`, build with:

```sh
BB_EXPERIMENTAL_SCALAR_ARITHMETIC=ON ./bootstrap.sh build
```

The bootstrap script normalizes the option, includes it in build cache keys, and explicitly passes it to each CMake configuration. Without the environment variable it passes `OFF`, including when reusing a build directory previously configured with `ON`. Artifact and package names stay the same; publish enabled artifacts under an experimental version.

For a direct CMake build:

```sh
cmake --preset default -DBB_EXPERIMENTAL_SCALAR_ARITHMETIC=ON
cmake --build build
```

Direct CMake configurations retain cached options. Pass `-DBB_EXPERIMENTAL_SCALAR_ARITHMETIC=OFF` to disable it. C++ consumers must use the same option as the libraries they link; the `ecc` and `barretenberg_headers` targets propagate the definition.

## Evaluation

Run the same tests and fuzz corpora with the option set to `OFF` and `ON` in separate checkouts or build directories. The option selects the production paths without adding branches to field operations.

```sh
cmake --preset fuzzing -DBB_EXPERIMENTAL_SCALAR_ARITHMETIC=ON
cmake --build --preset fuzzing --target ecc_multi_field_fuzzer ecc_invert_differential_fuzzer ecc_scalar_msm_fuzzer
```

`ecc_multi_field_fuzzer` compares field operations with integer arithmetic. `ecc_invert_differential_fuzzer` checks native and WASM inversion against Fermat inversion. `ecc_scalar_msm_fuzzer` compares the affine round-parallel MSM with individual point multiplications on BN254 and Grumpkin, using distinct hash-derived points and sizes around dispatch boundaries. Existing ECC tests also cover Montgomery coarse inputs and batch capacity boundaries.

Native fuzzing exercises the WASM limb inversion class as C++, but does not replace compiling and testing actual WASM artifacts. ADX kernels require evaluation on ADX hardware; sanitizer checks do not instrument inline assembly.
