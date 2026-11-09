# Experimental IFMA arithmetic

`BB_EXPERIMENTAL_IFMA` is a compile-time option, defaulting to `OFF`. It enables native x86-64 IFMA implementations for:

- Pippenger affine drains during tree reduction and indexed bucket addition.
- Element-wise multiplication, squaring, and scalar multiplication of native-field univariates of lengths 4 through 8.

The option is independent of scalar-arithmetic optimizations. Existing interfaces and artifact names stay the same.

## Selection

An OFF build excludes the IFMA kernels and uses the existing implementations. An ON build compiles the kernels with function-specific target attributes. It does not enable AVX-512 instructions globally.

Before calling a kernel, dispatch checks a shared, cached CPU/OS capability result. This checks XSAVE, OSXSAVE, AVX, OS-managed AVX-512 register state, and AVX-512F, DQ, IFMA, BW, and VL. Unsupported targets, fields, and univariate lengths use the existing implementations. There are no separate field/MSM environment selectors.

From `barretenberg/cpp`:

```sh
BB_EXPERIMENTAL_IFMA=ON ./bootstrap.sh build
```

Bootstrap normalizes the option, incorporates it into build cache keys, and explicitly passes it to every configuration. With the variable unset it passes OFF, including when reusing a directory previously configured with ON.

For direct CMake builds:

```sh
cmake --preset default -DBB_EXPERIMENTAL_IFMA=ON
cmake --build build
```

Direct CMake configuration retains cached options; pass OFF explicitly to disable it. C++ consumers must use the same option as their libraries. The `ecc` and `barretenberg_headers` targets propagate its value. Publish enabled artifacts under an experimental version.

## Evaluation

Build both OFF and ON variants in separate checkouts or build directories and replay identical corpora through the production interfaces:

```sh
cmake --preset fuzzing -DBB_EXPERIMENTAL_IFMA=ON
cmake --build --preset fuzzing --target ecc_msm_fuzzer polynomials_univariate_fuzzer ecc_ifma_field_fuzzer
```

`ecc_msm_fuzzer` compares the production affine round-parallel MSM with individual point multiplications on BN254 and Grumpkin. `polynomials_univariate_fuzzer` checks products and squares against portable Montgomery arithmetic, including self-aliasing and lengths around the IFMA dispatch boundaries.

`ecc_ifma_field_fuzzer` directly checks the field kernels against portable arithmetic for lengths 1 through 8 and inputs in [0, 2p). It refuses to run without an enabled build and IFMA-capable CPU/OS, preventing a fallback-only run from being counted as kernel validation.

The `IfmaFieldTest` and `IfmaDrainTest` tests cover coarse field values, masked loads/stores, scalar/vector drain boundaries, lane padding, destination order, and full drain batches. Tests requiring vector execution explicitly skip on unsupported hardware. `UnivariateArithmeticTest` covers supported and unsupported field/length combinations.

Run tests and fuzzers with address and undefined-behavior sanitizers on IFMA hardware before promoting this option. An ON build tested on a machine without IFMA only validates compilation and fallback behavior. ARM and WASM builds also require their own compilation/testing; enabling the option there must keep IFMA code excluded.
