# bigcurve

Vendored copy of [noir-lang/noir_bigcurve](https://github.com/noir-lang/noir_bigcurve) with audit fixes applied. It was vendored in commit `12182b58d17` and replaces the git dependency on tag `v0.14.0` (see `CHANGELOG.md`).

`noir_bigcurve` provides elliptic curve arithmetic over arbitrary prime fields in Weierstrass form, `y^2 = x^3 + a*x + b (mod p)`, using `bignum` for field arithmetic. `BigCurve` instances are parameterized by a struct implementing `BigCurveParams`. The library minimizes modular reductions, has constrained and unconstrained execution paths, and uses runtime lookup tables for faster scalar multiplication.

The package is named `noir_bigcurve`. The `blob` and `rollup-lib` crates import it as `bigcurve = { path = "../bigcurve" }`. For the API and usage guide, see the upstream README; the code here can differ from upstream.

Two `BigCurve` functions in this copy, which the upstream README does not list:

- `from_coordinates_unsafe`: a constructor.
- `validate_in_subgroup`: only needed on non-prime-order curves (e.g. BLS12-377, BLS12-381) when accepting private point inputs. Not needed for public/hardcoded points or points derived inside the circuit.

To update this copy, diff it against the upstream release it is based on, and keep the local fixes.
