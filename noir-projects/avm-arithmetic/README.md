# Public AVM U128 arithmetic

This standalone Noir library exposes `wide_mul(a: u128, b: u128) -> U256`.
The result has U128 fields `lo` and `hi`, representing `hi * 2^128 + lo`.
It preserves the complete product, including products above the field modulus.

This API requires public AVM execution and a transpiler that recognizes its named
oracle. It has no private, constrained, PXE, or host-oracle implementation.

The transpiler validates the scalar U128 signature and calls the existing AVM
procedure mechanism. The procedure recovers the high limb by subtracting the low
limb from the field product and multiplying by the field inverse of `2^128`.
The recovered high limb fits U128, so its field residue is the exact integer.
The inverse is computed during transpilation and emitted in one `SET_FF`.

The same package exposes `mul_div(a: u128, b: u128, d: u64) -> u128`.
It rounds the exact product divided by `d` down, and fails for a zero denominator
or a quotient exceeding U128. `10^18` uses this general U64 routine. The
transpiler widens the denominator with one CAST and retains the arithmetic
`hi < d` check.

## Use from Noir

Add a path dependency to this package. Keep `avm_u128` as the dependency name:

```toml
[dependencies]
avm_u128 = { path = "../path/to/noir-projects/avm-arithmetic" }
```

Import `avm_u128::{wide_mul, mul_div}`. Both wrappers and their oracle declarations
live in this package. The AVM assembly procedures and oracle lowering live in
`avm-transpiler/src` alongside the MSM implementation.
