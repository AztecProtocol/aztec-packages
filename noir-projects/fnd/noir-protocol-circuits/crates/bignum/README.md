# bignum

Vendored copy of [noir-lang/noir-bignum](https://github.com/noir-lang/noir-bignum) with audit fixes applied. It was vendored in commit `12182b58d17` and replaces the git dependency on tag `v0.10.0` (see `CHANGELOG.md`). `LICENSE` is the upstream license.

noir-bignum evaluates modular arithmetic over arbitrary-length integers. `BigNum` instances are parameterized by a struct that satisfies `BigNumParams`. `src/lib.nr` lists the predefined types; `src/fields/` shows how they were generated.

The `blob` and `rollup-lib` crates use it through `bignum = { path = "../bignum" }`. For the API and usage guide, see the upstream README; the code here can differ from upstream.

To update this copy, diff it against the upstream release it is based on, and keep the local fixes.
