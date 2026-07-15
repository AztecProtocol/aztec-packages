# noir-bignum

An optimized big number library for Noir.

noir-bignum evaluates modular arithmetic for large integers of any length.

`BigNum` instances are parameterized by a struct that satisfies `BigNumParams`.

Multiplications for a 2048-bit prime field cost approx. 930 gates.

`BigNum` can evaluate large integer arithmetic by defining a `modulus()` that is a power of 2.

## High-level overview

This library implements modular arithmetic over arbitrary-precision integers. The Noir standard library provides integers up to 128 bits and a field type up to 254 bits; this library supports arbitrary-length integers.
**Note:** This library assumes at least two 120-bit limbs for most operations. A single-limb `BigNum` (modulus < 2^120) is not well supported. 

A number of predefined bignum and finite field types are provided. If you need a modulus that isn't covered by the presets, this repo also provides the tools you'll need to generate your own.

See `./src/lib.nr` for the list of exported `BigNum`s.

See `./src/fields/` for files that show how those `BigNum`s were created; you can copy this approach to generate your own `BigNum`s.

More details about this library are described in the rest of this document, this is just a quick, high-level overview. 

To start using the library:

If the `BigNum` you need is in the predefined list, import it and use it:

```rust
use dep::bignum::U256;
```

If the `BigNum` you need is not in the predefined list, you'll need to create it:
1. Define or import a **parameter set** with info about your modulus
2. Define the correct **type** for your big number

Instructions on how to do this can be found below.

Step 2 depends on whether the modulus is known at compile time or at runtime. Use the correct type for your situation:
* `BigNum`, if modulus is known at compile-time
* `RuntimeBigNum`, if modulus is known at runtime. **Note:** the number of bits of the modulus must be known at compile-time. 

Both types have mostly the same methods available to them. 

For the arithmetic operations it is important to notice the difference between constrained and unconstrained functions. The overloaded operators `==,+,-,*,/` are all _constrained_ methods and are expensive. The recommended thing to do is perform multiple unconstrained functions (e.g `__add`, `__sub` etc) and then constrain with `evaluate_quadratic_expression`. Find further explanation and examples below. 

## Noir Version Compatibility

This library is tested with all stable releases since 1.0.0-beta.11 as well as nightly.

Refer to [Noir's docs](https://noir-lang.org/docs/getting_started/noir_installation) for installation steps.

## Installation

In your _Nargo.toml_ file, add the version of this library you would like to install under `[dependencies]`:

```
[dependencies]
bignum = { tag = "v0.4.2", git = "https://github.com/noir-lang/noir-bignum" }
```

### Import a predefined bignum:

Add imports at the top of your Noir code, for example:

```rust
use dep::bignum::U256;
```

### Create a custom bignum:

> We use `U256` as an illustrative example, even though it's actually a predefined bignum.

Use the `paramgen` tool to generate your bignum's params (see below). Then define your custom bignum from those params:

```rust
use dep::bignum::U256;
use dep::bignum::BigNum;

// Define (compile-time) BigNum type
// number of limbs, number of bits of modulus, parameter set
// implement the BigNum trait for the custom bignum type
#[derive_bignum(3, 257, quote {U256::params()})]
pub struct MyU256 {
    limbs: [u128; 3],
}
```

Or

```rust
global SecP224r1_PARAMS: BigNumParams<2, 224> = BigNumParams {
    has_multiplicative_inverse: true,
    modulus: [0xffffff000000000000000000000001, 0xffffffffffffffffffffffffff],
    double_modulus: [0x01fffffe000000000000000000000002, 0x01fffffffffffffffffffffffffe],
    redc_param: [0x0ffffffffffffffffffffffff0, 0x1000000000000000000000000000],
};

#[derive_bignum(2, 224, quote {SecP224r1_PARAMS})]
struct SecP224r1 {
    limbs: [u128; 2],
}
```


### Quick example: Addition in U256

A simple `1 + 2 = 3` check in 256-bit unsigned integers. Note that for performing multiple arithmetic operations up to degree 2 it is recommended to use `evaluate_quadratic_expression` (see explanation below). 

```rust
use dep::bignum::U256;

fn main() {
    let one = U256::from_limbs([1, 0, 0]);
    let two = U256::from_limbs([2, 0, 0]);
    let three = U256::from_limbs([3, 0, 0]);
    assert((one + two) == three);
}
```


## Types

### `BigNum` / `RuntimeBigNum` definition

A BigNum is a number modulo `modulus` (referred to as `MOD` in the docs) and is represented as an array of 120-bit limbs in little-endian format. When the `modulus` is known at compile-time, use `BigNum` type. For instance, to build a 5-limb `BigNum`, you can use the following definition:

```rust
pub struct MyBignum {
    pub limbs: [u128; 5],
}
```
The `BigNum` trait can be implemented for this type by using the `derive_bignum` macro, which takes the following parameters:

- `N` is the number of limbs needed to represent the number. Each limb is a `u128`, which contains max 120 bits. The `u128` type has 128 bits of space and by only using 120 bits, there is space for multiplications and additions without overflowing. 
- `MOD_BITS` is the number of bits needed to represent the modulus.
- `Params` is a parameter set (`BigNumParams`) associated with the big number. More information below.

To implement the trait for your bignum type, you need to provide the number of limbs and the number of bits of the modulus and the parameters. 

```rust 
#[derive_bignum(4, 377, quote {BLS12_377_Fq_PARAMS})]
pub struct MyBignum {
    pub limbs: [u128; 4],
}
```

The actual value of a `BigNum` can be calculated by multiplying each limb by an increasing power of $2^{120}$. For example `[1,20,300]` represents $1 \cdot 2^{120\cdot0} + 20 \cdot 2^{120 \cdot 1} + 300 \cdot 2^{120 \cdot 2}$. We say that the `BigNum` is represented in radix $2^{120}$. 

When `modulus` is known at runtime, the type is slightly different, but the representation of the actual number in limbs works the same way:

```rust
pub struct RuntimeBigNum<let N: u32, let MOD_BITS: u32> {
    pub limbs: [u128; N],
    pub params: BigNumParams<N, MOD_BITS>,
}
```

### `BigNumParams` definition

To define a `BigNum` or `RuntimeBigNum`, you need to provide a `BigNumParams`. For compile-time known moduli you can use predefined parameter sets from this library or define custom parameters using [this tool](https://github.com/noir-lang/noir-bignum-paramgen). See below for an overview of the available predefined parameter sets, as well as an example of how to generate your own. For runtime known moduli, provide the needed parameters through witnesses. 

`BigNumParams` contains the following:

- `modulus` represents the `BigNum` modulus, encoded as an array of `u128` elements that each encode 120 bits of the modulus. The first array element represents the least significant 120 bits

- `redc_param` is equal to `(1 << (2 * Params::modulus_bits() + BARRET_REDUCTION_OVERFLOW_BITS)) / modulus`. Where `BARRET_REDUCTION_OVERFLOW_BITS=6`. This must be computed outside of the circuit and provided either as a private witness or hardcoded constant. (computing it via an unconstrained function would be very expensive until noir witness computation times improve). You can read more about this value [here](./src/fns/unconstrained_helpers.nr)

- `double_modulus` is derived via the method `get_double_modulus` in `params.nr`. If you want to provide this value as a compile-time constant (see `fields/bn254Fq.nr` for an example), follow the algorithm `get_double_modulus` as this parameter is _not_ strictly `2 * modulus`. Each limb except the most significant limb borrows `2^120` from the next most significant limb. This ensures that when performing limb subtractions `double_modulus.limbs[i] - x.limbs[i]`, we know that the result will not underflow

- `has_multiplicative_inverse`, a boolean indicating whether all elements have a multiplicative inverse, i.e. whether modulus is a prime.


## `BigNum` / `RuntimeBigNum` methods

The methods that are available on the types `BigNum` and `RuntimeBigNum` are almost the same. This section discusses these methods and uses "bignum" to indicate both types.

The library offers all standard modular arithmetic operations, constrained and unconstrained. **Important:** When evaluating more than one arithmetic operation, it is recommended to perform unconstrained arithmetic operations and then constrain using `evaluate_quadratic_expression`. 

Furthermore, there are some convenient methods to manipulate a bignum or make assertions about it. 

### Unconstrained functions

All the constrained arithmetic methods have their unconstrained counterpart and there is an unconstrained method for exponentiation. The unconstrained methods are prefixed with `__`:
- `__neg`
- `__add`
- `__sub`
- `__mul`
- `__sqr`
- `__div`
  - **Note:** this method behaves as `__udiv`, if we are not working with a field (e.g. `U256`).
- `__udiv`/`__udiv_mod`
- `__pow`
- `__sqrt`
  - **Note:** this method is only available for fields, i.e. if all elements have a multiplicative inverse

> **Note:** `__div`, `__pow` and `__sqrt` are expensive due to requiring modular exponentiations during witness computation. It is worth modifying witness generation algorithms to minimize the number of modular exponentiations required. (for example, using batch inverses, mentioned below)

Use the following unconstrained operations only when working with a field (otherwise the inverse is not defined):

- `__invmod`, returns inverse of element
- `batch_invert`/`__batch_invert`, input is a fixed-size array. Returns inverses of all elements
- `batch_invert_slice`/`__batch_invert_slice`, input is dynamically sized slice. Returns inverses of all elements

Other useful unconstrained functions:
- `__derive_from_seed`, only use for test purposes. Not cryptographically secure
- `__is_zero`
- `__eq`

### Constrained functions

**Note:** try to avoid using these constrained methods if possible, for example by calling multiple unconstrained arithmetic functions and then constrain them with `evaluate_quadratic_expression` (explained in next section).

Constrained arithmetic operations. These perform the expected arithmetic operations and reduce the result modulo `modulus`:
- `neg`
- `add`
- `sub`
- `mul`
- `div` - Expensive!
  - **Note:** this method behaves as `udiv`, if we are not working with a field (e.g. `U256`).

These methods can be used using operators (`+`, `-`, `*`, `/`). 

- `sqr`
- `udiv`/`udiv_mod` - Expensive!
- `umod` - Expensive!
  - Integer modular reduction which uses `udiv`
- `udiv_unsafe`/`udiv_mod_unsafe`/`umod_unsafe` - Unsafe versions of the above that skip `validate_in_field` on the inputs. Use when both operands are already known to be in canonical form (i.e. in `[0, MOD)`).

`derive_bignum` will also implement conversions from a native `Field` type. For example, if you have a `Field` type `Fq`, you can convert it to your `BigNum` type `MyBigNum` by using the following syntax:

```rust
let a: Field = 10;
let my_bignum: Fq = Fq::from(a);
```
We also support comparison operators (`==`, `!=`) for `BigNum` types. Equality is tested modulo `modulus`
And we support (`>`, `>=`, `<`, `<=`) in pure integer sense for `BigNum` types.

> **Important:** Comparison operators (`>`, `>=`, `<`, `<=`) compare values as integers over their limb representation, **not** as field elements. Both operands must be in canonical form (i.e. in `[0, MOD)`). Call `validate_in_field` on each operand before comparing, otherwise non-canonical representations (e.g. `MOD` vs `0`) will produce incorrect results.


> **Note:** `div`, `udiv` and `umod` are expensive due to requiring modular exponentiations during witness computation. It is worth modifying witness generation algorithms to minimize the number of modular exponentiations required. (for example, using batch inverses)

Other constrained functions:

**Metadata**
- `params` - returns `BigNumParams` of a bignum
- `modulus_bits`, returns number of bits from the parameters
- `modulus`, returns `modulus` from the parameters
- `num_limbs`, returns `N`, the number of limbs needed to represent the bignum for the current parameters

**Constructors**
- `new`, `zero`, returns a bignum with value 0
- `one`, returns a bignum with value 1
- `derive_from_seed` - generates a `"random"` bignum value based on an input byte array `[u8; M]` - seed

**Limb access**
- `from_limbs`, returns a bignum from an array of limbs. Limbs are automatically range-checked.
- `from_limbs_unsafe`, same as `from_limbs` but without range-checking. Use for values that intentionally exceed the normal BigNum range.
- `get_limbs`, returns the limbs of the bignum at index `idx`
- `set_limb(idx, value)`, sets limb at `idx` to a new value. The new value is automatically range-checked.
- `set_limb_unsafe(idx, value)`, same as `set_limb` but without range-checking.

**Byte conversions**
- `from_be_bytes`, returns a bignum from a big-endian byte array. Validates the result is in `[0, MOD)` via `validate_in_field`.
- `from_le_bytes`, returns a bignum from a little-endian byte array. Validates the result is in `[0, MOD)` via `validate_in_field`.
- `to_be_bytes`, returns the big-endian byte representation of a bignum. Validates the input is in `[0, MOD)` via `validate_in_field`.
- `to_le_bytes`, returns the little-endian byte representation of a bignum. Validates the input is in `[0, MOD)` via `validate_in_field`.
- `from_be_bytes_unsafe`/`from_le_bytes_unsafe`/`to_be_bytes_unsafe`/`to_le_bytes_unsafe` - Unsafe versions of the above that skip `validate_in_field`. Use when the value is already known to be in canonical form (i.e. in `[0, MOD)`).

**Comparison operators**
- `eq`, also available with operator `==`
- `assert_is_not_equal`, assert 2 bignums are distinct. **Note:** this is cheaper than `assert(a != b)`
- `is_zero`, returns a boolean, that is `true` if the bignum value is 0 or `modulus`. **Note:** this is cheaper than `assert(a == bignum::zero())`.
- `unsafe_is_zero_integer`, returns a boolean, that is `true` if the bignum value is strictly 0 (all limbs are 0). **Note:** equivalent to `assert(a.get_limbs() == [0; N])` but cheaper.
- `assert_is_not_zero`, assert that a bignum is not 0 or `modulus`, **Note:** this is cheaper than `assert(!a.is_zero())` or `assert(a != bignum::zero())`.
- `unsafe_assert_is_not_zero_integer`, assert that a bignum is not strictly 0 (**all limbs are 0**). **Note:** cheaper than `assert(!a.is_zero_integer())` and `assert(a.get_limbs() != [0; N])`.

**Range operators**
- `validate_in_range`, validates the bignum doesn't have more bits than `modulus_bits` and each limb is a strict `120-bit` value
- `validate_in_field` – validates `self < modulus`.
  - **Note:** `validate_in_range` constraints are *deduplicated* (cached) per value, so calling it multiple times on the same `BigNum` will not add duplicate constraints. `validate_in_field` is *not* deduplicated, so repeated calls will add the check again.
  - **Note:** `validate_in_field` is a stronger assertion than `validate_in_range`

**Additional helpers**
- `conditional_select(lhs, rhs, predicate)`, if `predicate` is 0 returns `lhs`, else if `predicate` is 1 returns `rhs` 
- `to_field`, will be converted to `Field`, if the bignum can be represented as a native `Field` type

**Evaluation and Computation**
- `evaluate_quadratic_expression`, more explanation below
- `compute_quadratic_expression`, more explanation below

### `evaluate_quadratic_expression`

For a lower gate count and thus better performance perform multiple unconstrained arithmetic operations and then constrain them at once using `evaluate_quadratic_expression`.

E.g. if we wanted to compute `a * b + (c + d) * e + f = g`, instead of calling all five arithmetic operations in their constrained form, compute `g` via unconstrained functions and then constrain it with `evaluate_quadratic_expression`. 

Unconstrained functions `__mul, __sqr, __neg, __add, __sub, __div, __pow` can be used to compute witnesses that can then be fed into `evaluate_quadratic_expression`.

The method `evaluate_quadratic_expression` has the following interface:

```rust
    fn evaluate_quadratic_expression<let LHS_N: u64, let RHS_N: u64, let NUM_PRODUCTS: u64, let ADD_N: u64>(
        self,
        lhs_terms: [[BN; LHS_N]; NUM_PRODUCTS],
        lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
        rhs_terms: [[BN; RHS_N]; NUM_PRODUCTS],
        rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
        linear_terms: [BN; ADD_N],
        linear_flags: [bool; ADD_N]
    );
```

`NUM_PRODUCTS` represents the number of multiplications being summed.

`LHS_N, RHS_N` represents the number of `BigNum` objects being summed in the left and right operands of each product. 

`ADD_N` represents the number of `BigNum` objects being added

The flag parameters `lhs_flags, rhs_flags, add_flags` define whether an operand in the expression will be negated.

**Parameter limits:** The combination of `NUM_PRODUCTS`, `LHS_N`, and `RHS_N` must be small enough that intermediate product limbs do not exceed 2^{246}. Exceeding this bound breaks the 126-bit range check used internally. The library enforces this at compile time and will reject parameter combinations that could overflow. As a rough guideline, `NUM_PRODUCTS * LHS_N * RHS_N` should stay well below 64 for typical moduli. For example, with `BN254_Fq` (3 limbs, 254-bit modulus), `NUM_PRODUCTS=33` with `LHS_N=RHS_N=1`, or `NUM_PRODUCTS=1` with `LHS_N=RHS_N=6`, will be rejected.

For example, for the earlier example we wanted to calculate `a * b + (c + d) * e + f = g`. To constrain this, we pass `a * b + (c + d) * e + f - g = 0` to `evaluate_quadratic_expression`. The parameters then become:
- `NUM_PRODUCTS` = 2. The products are `a * b` and `(c + d) * e`
- `LHS_N` = 2, `RHS_N` = 1. For the left hand side the first multiplication has 1 operand and the other 2, so take the upper limit and pad with zeroes
- `ADD_N` = 2. The linear terms are `f` and `-g`


To constrain the example, first calculate `g = a * b + (c + d) * e + f` in unconstrained functions.
```rust
// Safety: out-of-circuit expression computation
let g = unsafe {
    let t0 = a.__mul(b); // a * b
    let t1 = (c.__add(d)).__mul(e); // (c + d) * e
    t0.__add(t1).__add(f) // t0 + t1 + f = (a * b) + (c + d) * e + f
};
```



Then define the terms and flags to constrain `a * b + (c + d) * e + f - g = 0` and call `evaluate_quadratic_expression`. 
```rust
// (a + 0) * b
let lhs_terms = [[a, BN::new()], [c, d]];
let lhs_flags = [[false, false], [false, false]];
// (c + d) * e 
let rhs_terms = [[b], [e]];
let rhs_flags = [[false], [false]];
// + f + (-g)
let add_terms = [f, g];
let add_flags = [false, true];

evaluate_quadratic_expression(lhs_terms, lhs_flags, rhs_terms, rhs_flags, add_terms, add_flags);
```

#### Example usage evaluate_quadratic_expression

In the base field of Ed25519, which is the integers mod $2^{255}-19$, perform simple arithmetic operations `(x1 * x2) + x3` and assert this equals `expected`. 

```rust
use dep::bignum::BigNum;
use dep::bignum::bignum::evaluate_quadratic_expression;

use dep::bignum::ED25519_Fq as Fq;

// Check that (x1 * x2) + x3 equals `expected`
fn main(x1: Fq, x2: Fq, x3: Fq, expected: Fq) {
    // Step 1: calculate res = (x1 * x2) + x3 in unconstrained functions
    // Safety: out-of-circuit expression computation
    let res = unsafe { x1.__mul(x2).__add(x3) };

    // Step 2: Constrain (x1 * x2) + x3 - res == 0 mod 2^255-19
    // (until now we have value res, but "unchecked")

    // `evaluate_quadratic_expression` takes:
    // (1) x1, `false` sign flag
    // (2) x2, `false` sign flag
    // (3)
    //  - x3, `false` sign flag
    //  - res, `true` sign flag
    // Combines to: (x1 * x2) + x3 + (-res)
    evaluate_quadratic_expression(
        [[x1]],
        [[false]],
        [[x2]],
        [[false]],
        [x3, res],
        [false, true],
    );

    // Step 3: check res equals `expected`
    assert(res == expected); // Equality operation on BigNums
}
```

See `src/tests/bignum_test.nr` for more examples.

## Custom or predefined parameter set

There are predefined parameter sets located in `src/fields` of this library. Alternatively, you can create a new parameter set by populating a `BigNumParams`. 

### Predefined Unsigned Integers

BigNum supports operations over unsigned integers, with predefined types for 256, 384, 512, 768, 1024, 2048, 4096 and 8192 bit integers. Keep in mind these are not fields.

All arithmetic operations are supported including integer div and mod functions (make sure to use udiv, umod, and udiv_mod). Bit shifts and other bit operators are not yet implemented.

```rust
use dep::bignum::U256;
use dep::bignum::BigNum;

fn foo(x: U256, y: U256) -> U256 {
    x.udiv(y)
}
```

```rust
use dep::bignum::U256;
use dep::bignum::BigNum;

fn foo(x: U256, y: U256) -> U256 {
    x / y // Note that it is `udiv` in this case. Not a modular inversion.
}
```
### Predefined Fields

This library includes the following field presets:

| Curve       | Base Field Instance                | Scalar Field Instance              |
|-------------|------------------------------------|------------------------------------|
| [BLS12-377](https://eprint.iacr.org/2020/351)   | `BLS12_377_Fq`            | `BLS12_377_Fr`            |
| [BLS12-381](https://electriccoin.co/blog/new-snark-curve/)   | `BLS12_381_Fq`            | `BLS12_381_Fr`            |
| [BN254](https://zips.z.cash/protocol/protocol.pdf)   | `BN254_Fq`                    | (Scalar field is the native field in Noir) |
| [Curve25519](https://cr.yp.to/ecdh/curve25519-20060209.pdf)  | `ED25519_Fq`              | `ED25519_Fr`              |
| [MNT4-753](https://eprint.iacr.org/2014/595)    | `MNT4_753_Fq`             | `MNT4_753_Fr`             |
| [MNT6-753](https://eprint.iacr.org/2014/595)    | `MNT6_753_Fq`             | `MNT6_753_Fr`             |
| [Pallas](https://electriccoin.co/blog/the-pasta-curves-for-halo-2-and-beyond/)     | `Pallas_Fr` | `Pallas_Fq` |
| [Secp256k1](https://en.bitcoin.it/wiki/Secp256k1) | `Secp256k1_Fq`            | `Secp256k1_Fr`            |
| [Secp256r1](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf) | `Secp256r1_Fq`            | `Secp256r1_Fr`            |
| [Secp384r1](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.186-4.pdf) | `Secp384r1_Fq`            | `Secp384r1_Fr`            |
| [Vesta](https://github.com/zcash/pasta) | `Vesta_Fq` | `Vesta_Fr` |
Feature requests and/or pull requests welcome for missing fields you need.


### Create a new parameter set for custom modulus

The easiest way to generate everything you need for a parameter set is to use [this tool](https://github.com/noir-lang/noir-bignum-paramgen). 

For example, after cloning and building the tool, for a `modulus` of 1024 bits for RSA run `./target/release/paramgen instance <modulus> RSA1024_example > out.txt`. This prints the parameter set to `out.txt`. 

#### Provide parameters for runtime known modulus

For a modulus that is known at runtime, the needed parameters in `BigNumParams` can be provided as witnesses. In the program, use `RuntimeBigNum`, which only requires the number of limbs and number of bits of modulus at the type definition.  

**Security warning: private modulus**

If the modulus is provided as a **private witness** (not a public input), the prover is free to choose any modulus that fits within `MOD_BITS`. The circuit only checks that arithmetic is internally consistent modulo the provided value - it does not verify *which* modulus was used.

A malicious prover can exploit this by substituting a weak modulus (e.g. a smooth composite number - a product of small primes). Equations that would be hard to solve over the intended modulus become trivial: solve mod each small factor separately, then combine via CRT.

**For cryptographic use cases, the modulus should be a public input or otherwise constrained by the surrounding circuit.** If your application relies on the modulus being a specific value (or having specific properties like primality), you must enforce that yourself - `RuntimeBigNum` will not do it for you.

```rust
use dep::bignum::BigNum;
use dep::bignum::BN254_Fq;

use dep::bignum::RuntimeBigNum;

// Notice how we don't provide the params here, because we're pretending they're
// not known at compile-time, for illustration purposes.
type My_RBN = RuntimeBigNum<3, 254>;

fn main() {
    let params = BN254_Fq::params(); // replace this with your own parameters, provided as witnesses

    // Notice how we feed the params in, because we're pretending they're not
    // known at compile-time.
    let one: My_RBN = RuntimeBigNum::from_limbs(params, [1, 0, 0]);
    let two: My_RBN = RuntimeBigNum::from_limbs(params, [2, 0, 0]);
    let three: My_RBN = RuntimeBigNum::from_limbs(params, [3, 0, 0]);

    assert((one + two) == three);
}
```

## Benchmarks v0.3.0

Benchmarks can be run using [this repo](https://github.com/hashcloak/noir-bigint-bench/). 

A full benchmark report based on that repo can be found [here](https://docs.google.com/spreadsheets/d/1KBc6mhMZ4iQYIZhsyF8E6-juhob7mM94sBKqVKS-v-8/edit?gid=0#gid=0). Below a few numbers are repeated. 

Number of gates:
| BigNum |  100 mult  | 100 add/sub |
|:-----|:--------:|:------:|
| **U256**   | 8507 | 5510 |
| **U1024**   |  31960  | 11832 |
| **U2048**   | 86935 | 20857 |

Proving time, UP = UltraPlonk, UH = UltraHonk, in milliseconds:

| BigNum |  100 mult UP  | 100 add UP | 100 mult HP  | 100 add HP |
|:-----|:--------:|:------:|:--------:|:------:|
| **U256**   | 548.6 | 313.1 | 329.8 | 208 | 
| **U1024**   |  1026.1  | 498.4 | 614.1 | 292 | 
| **U2048**   | 3101.2 | 842.3 | 1404.4 | 436.9 | 


## Benchmarks v0.4.x

TODO

## Additional usage example

Elliptic curve point doubling using `evaluate_quadratic_expression`:

```rust
use dep::bignum::BigNum;
use dep::bignum::BN254_Fq as Fq;

use dep::bignum::RuntimeBigNum;

use dep::bignum::bignum::evaluate_quadratic_expression;

fn example_ecc_double(x: Fq, y: Fq) -> (Fq, Fq) {
    // Step 1: construct witnesses

    // Safety: out-of-circuit (x3, y3) computation
    let (lambda, x3, y3) = unsafe {
        // lambda = 3*x*x / 2y
        let mut lambda_numerator = x.__sqr();
        lambda_numerator = lambda_numerator.__add(lambda_numerator.__add(lambda_numerator));
        let lambda_denominator = y.__add(y);
        let lambda_ = lambda_numerator.__div(lambda_denominator);

        // x3 = lambda * lambda - x - x
        let x3_ = lambda_.__mul(lambda_).__sub(x.__add(x));

        // y3 = lambda * (x - x3) - y
        let y3_ = lambda_.__mul(x.__sub(x3)).__sub(y);

        lambda_, x3_, y3_
    }

    // Step 2: constrain witnesses to be correct using minimal number of modular reductions (3)
    // assuming y can't be 0, otherwise we should additionally call y.assert_is_not_zero() 

    // 2y * lambda - 3x^2 = 0
    // (y + y) * lambda + (x + x + x) * (-x) = 0
    evaluate_quadratic_expression(
        [[lambda], [x]],
        [[false], [true]],
        [[y, y, Fq::new()], [x, x, x]],
        [[false, false, false], [false, false, false]],
        [],
        []
    );

    // lambda * lambda - x - x - x3 = 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[lambda]],
        [[false]],
        [x3,x,x],
        [true, true, true]
    );

    // lambda * (x - x3) - y  - y3= 0
    evaluate_quadratic_expression(
        [[lambda]],
        [[false]],
        [[x, x3]],
        [[false, true]],
        [y, y3],
        [true, true]
    );
    (x3, y3)
}
```
