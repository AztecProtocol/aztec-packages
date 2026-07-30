use crate::fns::constrained_ops::limbs_to_field;
use crate::params::BigNumParams;
use std::ops::{Add, Div, Mul, Neg, Sub};

/// The core trait for arbitrary-precision modular arithmetic.
///
/// `BigNum` represents integers modulo a compile-time known modulus. Values are stored as
/// arrays of 120-bit limbs in little-endian format.
///
/// # Important Notes
///
/// - **Single-limb BigNum is not supported**: This library assumes at least two 120-bit limbs
///   (modulus >= 2^120). Operations on single-limb BigNums may produce incorrect results.
///
/// - **Constrained vs Unconstrained**: Methods prefixed with `__` are unconstrained and do not
///   generate circuit constraints. Use them for witness computation, then constrain results with
///   `evaluate_quadratic_expression` for optimal performance.
///
/// - **Performance**: The overloaded operators (`+`, `-`, `*`, `/`) are constrained and
///   expensive. For multiple operations, prefer using unconstrained methods followed by
///   `evaluate_quadratic_expression`.
///
/// - **Modular vs Integer semantics**: Most operations are modular (mod `MOD`). For integer
///   division/remainder, use `udiv`, `umod`, `udiv_mod`.
///
/// # Example
/// ```
/// use dep::bignum::U256;
/// use dep::bignum::BigNum;
///
/// fn example(a: U256, b: U256) -> U256 {
///     // Constrained multiplication
///     a * b
/// }
/// ```
pub trait BigNum: Neg + Add + Sub + Mul + Div + Eq {
    /// Number of 120-bit limbs used to represent this BigNum.
    let N: u32;
    /// Number of bits in the modulus.
    let MOD_BITS: u32;

    /// Returns the parameter set for this BigNum type.
    ///
    /// The parameters include the modulus, precomputed reduction constants, and whether
    /// the modulus is prime (has multiplicative inverses).
    fn params() -> BigNumParams<N, MOD_BITS>;

    /// Returns the number of bits in the modulus.
    ///
    /// Note: Takes a dummy `Self` parameter for trait method resolution.
    fn modulus_bits(_: Self) -> u32;

    /// Returns the number of limbs used to represent this BigNum.
    ///
    /// Note: Takes a dummy `Self` parameter for trait method resolution.
    fn num_limbs(_: Self) -> u32;

    /// Returns the modulus as a BigNum value.
    ///
    /// # Note
    /// The modulus itself is considered equivalent to zero in modular arithmetic.
    /// `is_zero(modulus())` returns `true`.
    fn modulus() -> Self;

    /// Creates a new BigNum with value 0.
    ///
    /// Equivalent to `zero()`.
    fn new() -> Self;

    /// Returns the additive identity (0).
    fn zero() -> Self;

    /// Returns the multiplicative identity (1).
    fn one() -> Self;

    /// Constructs a BigNum from raw limbs.
    ///
    /// Each limb is range-checked automatically: at most 120 bits for non-top limbs,
    /// and at most `MOD_BITS - 120 * (N - 1)` bits for the top limb.
    fn from_limbs(limbs: [u128; N]) -> Self;

    /// Constructs a BigNum from raw limbs without range-checking.
    ///
    /// # Safety
    /// No range checks are performed on the limbs. The resulting value may not
    /// represent a valid BigNum. Use for cases where limbs intentionally exceed
    /// the normal range (e.g. quotients from unconstrained computation).
    fn from_limbs_unsafe(limbs: [u128; N]) -> Self;

    /// Returns the raw limb representation.
    ///
    /// Limbs are in little-endian order: `limbs[0]` contains the least significant 120 bits.
    fn get_limbs(self) -> [u128; N];

    /// Sets a specific limb to a new value.
    ///
    /// The new value is range-checked automatically: at most 120 bits for non-top limbs,
    /// and at most `MOD_BITS - 120 * (N - 1)` bits for the top limb.
    fn set_limb(self: &mut Self, idx: u32, value: u128);

    /// Sets a specific limb to a new value without range-checking.
    ///
    /// # Safety
    /// No range check is performed on the new value.
    fn set_limb_unsafe(self: &mut Self, idx: u32, value: u128);

    /// Returns the limb at the given index.
    fn get_limb(self: Self, idx: u32) -> u128;

    /// Generates a deterministic pseudorandom BigNum from a seed.
    ///
    /// Uses Poseidon2 hash to derive `MOD_BITS * 2` bits of entropy, then reduces modulo `MOD`.
    ///
    /// # Security Warning
    /// **NOT cryptographically secure for all use cases**. The output is deterministic and
    /// uniformly distributed modulo `MOD`, but the seed-to-output mapping is publicly computable.
    /// Do not use for secret key generation where the seed might be guessable.
    ///
    /// # Constrained
    /// This is a constrained function that generates range check constraints.
    fn derive_from_seed<let SeedBytes: u32>(seed: [u8; SeedBytes]) -> Self;

    /// Unconstrained version of `derive_from_seed`.
    ///
    /// # Safety
    /// No constraints are generated. Use only for witness computation in unconstrained contexts.
    unconstrained fn __derive_from_seed<let SeedBytes: u32>(seed: [u8; SeedBytes]) -> Self;

    /// Constructs a BigNum from big-endian bytes.
    /// Validates that the result is in canonical form (i.e. in `[0, MOD)`) via `validate_in_field`.
    ///
    /// The byte array length must be exactly `(MOD_BITS + 7) / 8`.
    ///
    /// # Panics
    /// Panics if the value represented by the bytes is >= 2^MOD_BITS.
    fn from_be_bytes(x: [u8; (MOD_BITS + 7) / 8]) -> Self;

    /// Constructs a BigNum from big-endian bytes without canonical validation.
    ///
    /// The byte array length must be exactly `(MOD_BITS + 7) / 8`.
    ///
    /// # Panics
    /// Panics if the value represented by the bytes is >= 2^MOD_BITS.
    ///
    /// # Safety
    /// Only enforces that the value is < 2^MOD_BITS. Does **not** enforce `< MOD`.
    fn from_be_bytes_unsafe(x: [u8; (MOD_BITS + 7) / 8]) -> Self;

    /// Converts to big-endian byte representation.
    /// Validates that `self` is in canonical form (i.e. in `[0, MOD)`) via `validate_in_field`.
    fn to_be_bytes(self) -> [u8; (MOD_BITS + 7) / 8];

    /// Converts to big-endian byte representation without canonical validation.
    ///
    /// # Safety
    /// Does not enforce that `self` is in canonical form.
    fn to_be_bytes_unsafe(self) -> [u8; (MOD_BITS + 7) / 8];

    /// Constructs a BigNum from little-endian bytes.
    /// Validates that the result is in canonical form (i.e. in `[0, MOD)`) via `validate_in_field`.
    ///
    /// The byte array length must be exactly `(MOD_BITS + 7) / 8`.
    ///
    /// # Panics
    /// Panics if the value represented by the bytes is >= 2^MOD_BITS.
    fn from_le_bytes(x: [u8; (MOD_BITS + 7) / 8]) -> Self;

    /// Constructs a BigNum from little-endian bytes without canonical validation.
    ///
    /// The byte array length must be exactly `(MOD_BITS + 7) / 8`.
    ///
    /// # Panics
    /// Panics if the value represented by the bytes is >= 2^MOD_BITS.
    ///
    /// # Safety
    /// Only enforces that the value is < 2^MOD_BITS. Does **not** enforce `< MOD`.
    fn from_le_bytes_unsafe(x: [u8; (MOD_BITS + 7) / 8]) -> Self;

    /// Converts to little-endian byte representation.
    /// Validates that `self` is in canonical form (i.e. in `[0, MOD)`) via `validate_in_field`.
    fn to_le_bytes(self) -> [u8; (MOD_BITS + 7) / 8];

    /// Converts to little-endian byte representation without canonical validation.
    ///
    /// # Safety
    /// Does not enforce that `self` is in canonical form.
    fn to_le_bytes_unsafe(self) -> [u8; (MOD_BITS + 7) / 8];

    /// Unconstrained equality check.
    ///
    /// Returns `true` if `self == other` as integers (not modular equality).
    ///
    /// # Safety
    /// No constraints are generated. Use `==` operator for constrained equality.
    unconstrained fn __eq(self: Self, other: Self) -> bool;

    /// Unconstrained zero check.
    ///
    /// Returns `true` if all limbs are zero.
    ///
    /// # Note
    /// This checks for integer zero only, not modular zero.
    /// `modulus().__is_zero()` returns `false` even though `modulus == 0 (mod MOD)`.
    ///
    /// # Safety
    /// No constraints are generated. Use `is_zero()` for constrained check.
    unconstrained fn __is_zero(self: Self) -> bool;

    /// Unconstrained negation: computes `-self (mod MOD)`.
    ///
    /// # Safety
    /// No constraints are generated. Constrain the result using `evaluate_quadratic_expression`.
    unconstrained fn __neg(self) -> Self;

    /// Unconstrained addition: computes `self + other (mod MOD)`.
    ///
    /// # Safety
    /// No constraints are generated. Constrain the result using `evaluate_quadratic_expression`.
    unconstrained fn __add(self, other: Self) -> Self;

    /// Unconstrained subtraction: computes `self - other (mod MOD)`.
    ///
    /// # Safety
    /// No constraints are generated. Constrain the result using `evaluate_quadratic_expression`.
    unconstrained fn __sub(self, other: Self) -> Self;

    /// Unconstrained multiplication: computes `self * other (mod MOD)`.
    ///
    /// # Safety
    /// No constraints are generated. Constrain the result using `evaluate_quadratic_expression`.
    unconstrained fn __mul(self, other: Self) -> Self;

    /// Unconstrained squaring: computes `self * self (mod MOD)`.
    ///
    /// # Safety
    /// No constraints are generated. Constrain the result using `evaluate_quadratic_expression`.
    unconstrained fn __sqr(self) -> Self;

    /// Unconstrained modular division: computes `self * other^{-1} (mod MOD)`
    /// when `MOD` is prime (`params.has_multiplicative_inverse == true`)
    ///
    /// Unconstrained unsigned Integer division: computes `floor(self / other)` otherwise
    ///
    /// # Requirements
    /// - `other` must not be zero
    ///
    /// # Performance Warning
    /// **EXPENSIVE**: Requires modular exponentiation during witness computation.
    /// Consider using `batch_invert` for multiple divisions.
    ///
    /// # Safety
    /// No constraints are generated. Constrain the result using `evaluate_quadratic_expression`.
    unconstrained fn __div(self, other: Self) -> Self;

    /// Unconstrained integer division with remainder.
    ///
    /// Returns `(quotient, remainder)` where `self == quotient * divisor + remainder`
    /// and `0 <= remainder < divisor`.
    ///
    /// # Note
    /// This is INTEGER division, not modular. Use when `MOD` is not prime or when you
    /// need the actual quotient/remainder, not the modular inverse.
    ///
    /// # Safety
    /// No constraints are generated. Use `udiv_mod()` for the constrained version.
    unconstrained fn __udiv_mod(self, divisor: Self) -> (Self, Self);

    /// Unconstrained modular inverse: computes `self^{-1} (mod MOD)`.
    ///
    /// # Requirements
    /// - `MOD` must be prime (`params.has_multiplicative_inverse == true`)
    /// - `self` must not be zero
    ///
    /// # Performance Warning
    /// **EXPENSIVE**: Requires modular exponentiation. For multiple inverses, use `batch_invert`.
    ///
    /// # Safety
    /// No constraints are generated.
    unconstrained fn __invmod(self) -> Self;

    /// Unconstrained modular exponentiation: computes `self^exponent (mod MOD)`.
    ///
    /// # Performance Warning
    /// **EXPENSIVE**: Complexity is O(MOD_BITS) multiplications.
    ///
    /// # Safety
    /// No constraints are generated.
    unconstrained fn __pow(self, exponent: Self) -> Self;

    /// **Deprecated**: use `__sqrt` instead.
    unconstrained fn __tonelli_shanks_sqrt(self) -> std::option::Option<Self>;

    /// Unconstrained modular square root.
    ///
    /// Returns `Some(root)` where `root * root == self (mod MOD)`, or `None` if no square root exists.
    ///
    /// # Requirements
    /// - `MOD` must be prime (`params.has_multiplicative_inverse == true`)
    ///
    /// # Note
    /// When a square root exists, there are always two: `root` and `-root (mod MOD)`.
    /// This function returns one of them (implementation-defined which one).
    ///
    /// # Safety
    /// No constraints are generated.
    unconstrained fn __sqrt(self) -> std::option::Option<Self>;

    /// Asserts that `self != other (mod MOD)`.
    ///
    /// # Performance Note
    /// This is cheaper than `assert(self != other)` because it avoids creating a boolean result.
    ///
    /// # Soundness
    /// Sound for `MOD < circuit_field_modulus`. For very large moduli approaching the circuit
    /// field size, there's a negligible (~3/p) probability of false positives.
    fn assert_is_not_equal(self: Self, other: Self);

    /// Returns `true` if `self == 0 (mod MOD)`.
    ///
    /// # Note
    /// This treats both the zero limb vector AND the modulus itself as zero, since
    /// `modulus == 0 (mod MOD)`.
    ///
    /// # Performance Note
    /// Cheaper than `self == BigNum::zero()`.
    fn is_zero(self) -> bool;

    /// Returns `true` if all limbs are zero (integer zero, not modular).
    ///
    /// # Note
    /// Unlike `is_zero()`, this returns `false` for the modulus value even though
    /// `modulus == 0 (mod MOD)`.
    fn unsafe_is_zero_integer(self) -> bool;

    /// Asserts that `self != 0 (mod MOD)`.
    ///
    /// # Performance Note
    /// Cheaper than `assert(!self.is_zero())` or `assert(self != BigNum::zero())`.
    fn assert_is_not_zero(self);

    /// Asserts that at least one limb is non-zero (integer assertion).
    ///
    /// # Note
    /// Unlike `assert_is_not_zero()`, this will pass for the modulus value.
    ///
    /// # Performance Note
    /// Cheaper than `assert(!self.is_zero_integer())`.
    fn unsafe_assert_is_not_zero_integer(self);

    /// Validates that each limb is properly range-constrained.
    ///
    /// Ensures:
    /// - Limbs 0 to N-2 are < 2^120
    /// - Limb N-1 is < 2^(MOD_BITS - 120*(N-1))
    ///
    /// # When to Use
    /// Call this after `from_limbs()` or `set_limb()` when the input comes from untrusted sources.
    ///
    /// # Performance Note
    /// Range constraints are deduplicated per value, so calling this multiple times on the same
    /// BigNum does not add duplicate constraints.
    ///
    /// # Note
    /// This does NOT guarantee `self < MOD`. Use `validate_in_field()` for that.
    fn validate_in_range(self);

    /// Validates that `self < MOD`.
    ///
    /// # Note
    /// - This is a STRONGER check than `validate_in_range()`.
    /// - Unlike `validate_in_range()`, this check is NOT deduplicated. Repeated calls will
    ///   add redundant constraints.
    fn validate_in_field(self);

    /// Constrained squaring: computes `self * self (mod MOD)`.
    ///
    /// # Performance Note
    /// For multiple operations, prefer using `__sqr()` followed by `evaluate_quadratic_expression`.
    fn sqr(self) -> Self;

    /// Constrained integer division with remainder.
    ///
    /// Returns `(quotient, remainder)` where `self == quotient * divisor + remainder`
    /// and `0 <= remainder < divisor`.
    ///
    /// # Performance Warning
    /// **EXPENSIVE**: Requires long binary division.
    ///
    /// # Panics
    /// Will fail constraint if `divisor == 0`.
    ///
    /// # Note
    /// This is INTEGER division. For modular division on prime fields, use the `/` operator.
    fn udiv_mod(self, divisor: Self) -> (Self, Self);

    /// Unsafe version of `udiv_mod`. Does not call `validate_in_field` on the inputs.
    ///
    /// # Safety
    /// Both operands **must** already be in canonical form (i.e. in `[0, MOD)`).
    fn udiv_mod_unsafe(self, divisor: Self) -> (Self, Self);

    /// Constrained integer division: returns `floor(self / divisor)`.
    ///
    /// # Performance Warning
    /// **EXPENSIVE**: Internally calls `udiv_mod()`.
    ///
    /// # Note
    /// This is INTEGER division, not modular. The remainder is discarded.
    fn udiv(self, divisor: Self) -> Self;

    /// Unsafe version of `udiv`. Does not call `validate_in_field` on the inputs.
    ///
    /// # Safety
    /// Both operands **must** already be in canonical form (i.e. in `[0, MOD)`).
    fn udiv_unsafe(self, divisor: Self) -> Self;

    /// Constrained integer modulo: returns `self % divisor`.
    ///
    /// # Performance Warning
    /// **EXPENSIVE**: Internally calls `udiv_mod()`.
    ///
    /// # Note
    /// This is INTEGER modulo. The result is the remainder after integer division.
    fn umod(self, divisor: Self) -> Self;

    /// Unsafe version of `umod`. Does not call `validate_in_field` on the inputs.
    ///
    /// # Safety
    /// Both operands **must** already be in canonical form (i.e. in `[0, MOD)`).
    fn umod_unsafe(self, divisor: Self) -> Self;
}

// We need macros that implement the BigNum, Default, From, Neg, Add, Sub, Mul, Div, Eq, Ord traits for each bignum type
pub comptime fn derive_bignum(
    strukt: TypeDefinition,
    N: u32,
    MOD_BITS: u32,
    params: Quoted,
) -> Quoted {
    let typ = strukt.as_type();
    quote {

        // implement BigNum for BigNum 
        impl $crate::BigNum for $typ {
            let N: u32 = $N; 
            let MOD_BITS: u32 = $MOD_BITS;
            
            fn modulus_bits(_: Self) -> u32 {
                $MOD_BITS
            }
            
            fn num_limbs(_: Self) -> u32 {
                $N
            }

            fn modulus() -> Self {
                Self { limbs: Self::params().modulus }
            }

            fn params() -> $crate::params::BigNumParams<$N, $MOD_BITS> {
                $params
            }

            fn new() -> Self {
                Self {limbs: [0; $N]}
            }

            fn from_limbs(limbs: [u128; $N]) -> Self {
                let res = Self { limbs };
                res.validate_in_range();
                res
            }

            fn from_limbs_unsafe(limbs: [u128; $N]) -> Self {
                Self { limbs }
            }

            fn get_limbs(self: Self) -> [u128; $N] {
                self.limbs
            }

            fn set_limb(self: &mut Self, idx: u32, value: u128) {
                if idx != ($N - 1){
                    (value as Field).assert_max_bit_size::<120>();
                } else {
                    (value as Field).assert_max_bit_size::<$MOD_BITS - 120 * ($N - 1)>();
                }
                self.limbs[idx] = value;
            }

            fn set_limb_unsafe(self: &mut Self, idx: u32, value: u128) {
                self.limbs[idx] = value;
            }

            fn get_limb(self: Self, idx: u32) -> u128 {
                self.limbs[idx]
            }

            fn zero() -> Self {
                Self { limbs: [0; $N] }
            }

            fn one() -> Self {
                let mut limbs = [0; $N];
                limbs[0] = 1;
                Self { limbs }
            }

            fn derive_from_seed<let SeedBytes: u32>(seed: [u8; SeedBytes]) -> Self {
                let params = Self::params();
                $typ::from_limbs($crate::internal::derive_from_seed::<$N, $MOD_BITS, SeedBytes>(params, seed))
            }

            unconstrained fn __derive_from_seed<let SeedBytes: u32>(seed: [u8; SeedBytes]) -> Self {
                let params = Self::params();
                Self { limbs: $crate::internal::__derive_from_seed::<$N, $MOD_BITS, SeedBytes>(params, seed) }
            }

            fn from_be_bytes(x: [u8; ($MOD_BITS + 7) / 8]) -> Self {
                let params = Self::params();
                Self { limbs: $crate::internal::from_be_bytes::<$N, $MOD_BITS>(params, x) }
            }

            fn from_be_bytes_unsafe(x: [u8; ($MOD_BITS + 7) / 8]) -> Self {
                Self { limbs: $crate::internal::from_be_bytes_unsafe::<$N, $MOD_BITS>(x) }
            }

            fn to_be_bytes(self) -> [u8; ($MOD_BITS + 7) / 8] {
                let params = Self::params();
                $crate::internal::to_be_bytes::<$N, $MOD_BITS>(params, self.limbs)
            }

            fn to_be_bytes_unsafe(self) -> [u8; ($MOD_BITS + 7) / 8] {
                $crate::internal::to_be_bytes_unsafe::<$N, $MOD_BITS>(self.limbs)
            }

            fn from_le_bytes(x: [u8; ($MOD_BITS + 7) / 8]) -> Self {
                let params = Self::params();
                Self { limbs: $crate::internal::from_le_bytes::<$N, $MOD_BITS>(params, x) }
            }

            fn from_le_bytes_unsafe(x: [u8; ($MOD_BITS + 7) / 8]) -> Self {
                Self { limbs: $crate::internal::from_le_bytes_unsafe::<$N, $MOD_BITS>(x) }
            }

            fn to_le_bytes(self) -> [u8; ($MOD_BITS + 7) / 8] {
                let params = Self::params();
                $crate::internal::to_le_bytes::<$N, $MOD_BITS>(params, self.limbs)
            }

            fn to_le_bytes_unsafe(self) -> [u8; ($MOD_BITS + 7) / 8] {
                $crate::internal::to_le_bytes_unsafe::<$N, $MOD_BITS>(self.limbs)
            }

            unconstrained fn __eq(self: Self, other: Self) -> bool {
                $crate::internal::__eq(self.get_limbs(), other.get_limbs())
            }

            unconstrained fn __is_zero(self: Self) -> bool {
                $crate::internal::__is_zero(self.get_limbs())
            }

            unconstrained fn __neg(self: Self) -> Self {
                let params = Self::params();
                Self {limbs: $crate::internal::__neg(params.modulus, self.get_limbs())}
            }

            unconstrained fn __add(self: Self, other: Self) -> Self {
                let params = Self::params();
                Self {limbs: $crate::internal::__add(params.modulus, self.get_limbs(), other.get_limbs())}
            }

            unconstrained fn __sub(self: Self, other: Self) -> Self {
                let params = Self::params();
                Self {limbs: $crate::internal::__sub(params.modulus, self.get_limbs(), other.get_limbs())}
            }

            unconstrained fn __mul(self: Self, other: Self) -> Self {
                let params = Self::params();
                Self {limbs: $crate::internal::__mul(params, self.get_limbs(), other.get_limbs())}
            }

            unconstrained fn __sqr(self: Self) -> Self {
                let params = Self::params();
                Self {limbs: $crate::internal::__sqr(params, self.get_limbs()) }
            }

            unconstrained fn __div(self: Self, divisor: Self) -> Self {
                let params = Self::params();
                if $params.has_multiplicative_inverse {
                    Self { limbs: $crate::internal::__div(params, self.get_limbs(), divisor.get_limbs()) }
                } else {
                    Self { limbs: $crate::internal::__udiv_mod(self.get_limbs(), divisor.get_limbs()).0 }
                }
            }

            unconstrained fn __udiv_mod(self: Self, divisor: Self) -> (Self, Self) {
                let (q, r) = $crate::internal::__udiv_mod(self.get_limbs(), divisor.get_limbs());
                (Self{limbs: q}, Self{limbs: r})
            }

            unconstrained fn __invmod(self: Self) -> Self {
                let params = Self::params();
                Self {limbs: $crate::internal::__invmod(params, self.get_limbs())}
            }

            unconstrained fn __pow(self: Self, exponent: Self) -> Self {
                let params = Self::params();
                Self {limbs: $crate::internal::__pow(params, self.get_limbs(), exponent.get_limbs())}
            }

            #[deprecated("use __sqrt")]
            unconstrained fn __tonelli_shanks_sqrt(self: Self) -> std::option::Option<Self> {
                let params = Self::params();
                let maybe_limbs: Option<[u128; $N]> = $crate::internal::__sqrt(params, self.get_limbs());
                maybe_limbs.map(|limbs| Self {limbs: limbs})
            }

            unconstrained fn __sqrt(self: Self) -> std::option::Option<Self> {
                let params = Self::params();
                let maybe_limbs: Option<[u128; $N]> = $crate::internal::__sqrt(params, self.get_limbs());
                maybe_limbs.map(|limbs| Self {limbs: limbs })
            }

            fn assert_is_not_equal(self: Self, other: Self) {
                let params = Self::params();
                $crate::internal::assert_is_not_equal(
                    params,
                    self.get_limbs(),
                    other.get_limbs(),
                );
            }

            fn validate_in_field(self: Self) {
                let params = Self::params();
                $crate::internal::validate_in_field::<$N, $MOD_BITS>(params, self.get_limbs());
            }

            fn validate_in_range(self: Self) {
                $crate::internal::validate_in_range::<$N, $MOD_BITS>(self.get_limbs());
            }

            fn sqr(self: Self) -> Self {
                let params = Self::params();
                Self { limbs: $crate::internal::sqr::<$N, $MOD_BITS>(params, self.get_limbs()) }
            }

            fn udiv_mod(self: Self, divisor: Self) -> (Self, Self) {
                let params = Self::params();
                let (q, r) = $crate::internal::udiv_mod::<$N, $MOD_BITS>(params, self.get_limbs(), divisor.get_limbs());
                (Self {limbs: q}, Self {limbs: r})
            }

            fn udiv(self: Self, divisor: Self) -> Self {
                let params = Self::params();
                Self {limbs: $crate::internal::udiv::<$N, $MOD_BITS>(params, self.get_limbs(), divisor.get_limbs())}
            }

            fn udiv_unsafe(self: Self, divisor: Self) -> Self {
                Self {limbs: $crate::internal::udiv_unsafe::<$N, $MOD_BITS>(self.get_limbs(), divisor.get_limbs())}
            }

            fn umod(self: Self, divisor: Self) -> Self {
                let params = Self::params();
                Self {limbs: $crate::internal::umod::<$N, $MOD_BITS>(params, self.get_limbs(), divisor.get_limbs())}
            }

            fn umod_unsafe(self: Self, divisor: Self) -> Self {
                Self {limbs: $crate::internal::umod_unsafe::<$N, $MOD_BITS>(self.get_limbs(), divisor.get_limbs())}
            }

            fn udiv_mod_unsafe(self: Self, divisor: Self) -> (Self, Self) {
                let (q, r) = $crate::internal::udiv_mod_unsafe::<$N, $MOD_BITS>(self.get_limbs(), divisor.get_limbs());
                (Self {limbs: q}, Self {limbs: r})
            }

            fn is_zero(self: Self) -> bool {
                let params = Self::params();
                $crate::internal::is_zero::<$N, $MOD_BITS>(params, self.get_limbs())
            }

            fn unsafe_is_zero_integer(self: Self) -> bool {
                $crate::internal::is_zero_integer::<$N>(self.get_limbs())
            }

            fn assert_is_not_zero(self: Self) {
                let params = Self::params();
                $crate::internal::assert_is_not_zero::<$N, $MOD_BITS>(params, self.get_limbs());
            }

            fn unsafe_assert_is_not_zero_integer(self: Self) {
                $crate::internal::assert_is_not_zero_integer(self.get_limbs());
            }
        }

        // implement Default for BigNum
        impl Default for $typ {
            fn default() -> Self {
                $typ::from_limbs([0; $N])
            }
        }

        impl std::convert::From<Field> for $typ {
            fn from(input: Field) -> Self {
                $typ { limbs: $crate::internal::from_field::<$N, $MOD_BITS>($params, input) }
            }
        }

        impl std::ops::Neg for $typ {
            fn neg(self) -> Self {
                $typ { limbs: $crate::internal::neg::<$N, $MOD_BITS>($params, self.limbs) }
            }
        }

        impl std::ops::Add for $typ {
            fn add(self, other: Self) -> Self {
                $typ { limbs: $crate::internal::add::<$N, $MOD_BITS>($params, self.limbs, other.limbs) }
            }
        }

        impl std::ops::Sub for $typ {
            fn sub(self, other: Self) -> Self {
                $typ { limbs: $crate::internal::sub::<$N, $MOD_BITS>($params, self.limbs, other.limbs) }
            }
        }

        impl std::ops::Mul for $typ {
            fn mul(self, other: Self) -> Self {
                $typ { limbs: $crate::internal::mul::<$N, $MOD_BITS>($params, self.limbs, other.limbs) }
            }
        }

        impl std::ops::Div for $typ {
            fn div(self, other: Self) -> Self {
                if $params.has_multiplicative_inverse {
                    $typ { limbs: $crate::internal::div::<$N, $MOD_BITS>($params, self.limbs, other.limbs) }
                } else {
                    $typ { limbs: $crate::internal::udiv::<$N, $MOD_BITS>($params, self.limbs, other.limbs) }
                }
            }
        }

        impl std::cmp::Eq for $typ {
            fn eq(self, other: Self) -> bool {
                $crate::internal::eq::<$N, $MOD_BITS>($params, self.limbs, other.limbs)
            }
        }

        /// Integer ordering comparison (`>`, `>=`, `<`, `<=`).
        ///
        /// Compares values as integers over their limb representation, **not** modular ordering.
        ///
        /// # Safety
        /// Both operands **must** be in canonical form (i.e. in `[0, MOD)`).
        /// Call `validate_in_field` on each operand before comparing, otherwise
        /// non-canonical representations (e.g. `MOD` vs `0`) will produce incorrect results.
        impl std::cmp::Ord for $typ {
            fn cmp(self, other: Self) -> std::cmp::Ordering {
                $crate::internal::cmp::<$N, $MOD_BITS>(self.limbs, other.limbs)
            }
        }

    }
}

/// Conditionally selects between two BigNum values.
///
/// Returns `lhs` if `predicate` is `true`, otherwise returns `rhs`.
///
/// # Example
/// ```
/// let result = conditional_select(a, b, condition);
/// // Equivalent to: if condition { a } else { b }
/// ```
///
/// # Note
/// This is useful for constant-time selection where you want to avoid branching
/// on secret values in constrained code.
pub fn conditional_select<T: BigNum>(lhs: T, rhs: T, predicate: bool) -> T {
    if predicate {
        lhs
    } else {
        rhs
    }
}

/// Computes the quotient and remainder of a quadratic expression (unconstrained).
///
/// Evaluates `sum_i(product(lhs_terms[i]) * product(rhs_terms[i])) + sum(linear_terms) = q * MOD + r`
/// and returns `(q, r)`.
///
/// # Parameters
/// - `lhs_terms`: Left-hand side terms for each product. Shape: `[NUM_PRODUCTS][LHS_N]`
/// - `lhs_flags`: If `true`, the corresponding lhs_term is negated
/// - `rhs_terms`: Right-hand side terms for each product. Shape: `[NUM_PRODUCTS][RHS_N]`
/// - `rhs_flags`: If `true`, the corresponding rhs_term is negated
/// - `linear_terms`: Terms to add to the sum. Shape: `[ADD_N]`
/// - `linear_flags`: If `true`, the corresponding linear_term is negated
///
/// # Safety
/// **UNCONSTRAINED**: This function generates no constraints. Use `evaluate_quadratic_expression`
/// to constrain the result, or use the returned values as witnesses that you constrain separately.
///
/// # Example
/// Computing `a * b + c`:
/// ```
/// // Safety: unconstrained witness computation
/// let (q, r) = unsafe {
///     compute_quadratic_expression(
///         [[a]],      // lhs_terms
///         [[false]],  // lhs_flags (not negated)
///         [[b]],      // rhs_terms
///         [[false]],  // rhs_flags
///         [c],        // linear_terms
///         [false],    // linear_flags
///     )
/// };
/// // r now contains (a * b + c) mod MOD
/// ```
pub unconstrained fn compute_quadratic_expression<T: BigNum, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32, let ADD_N: u32>(
    lhs_terms: [[T; LHS_N]; NUM_PRODUCTS],
    lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
    rhs_terms: [[T; RHS_N]; NUM_PRODUCTS],
    rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
    linear_terms: [T; ADD_N],
    linear_flags: [bool; ADD_N],
) -> (T, T) {
    let params = T::params();
    let (q_limbs, r_limbs) = crate::fns::expressions::__compute_quadratic_expression(
        params,
        crate::utils::map::map(
            lhs_terms,
            |bns| crate::utils::map::map(bns, |bn: T| bn.get_limbs()),
        ),
        lhs_flags,
        crate::utils::map::map(
            rhs_terms,
            |bns| crate::utils::map::map(bns, |bn: T| bn.get_limbs()),
        ),
        rhs_flags,
        crate::utils::map::map(linear_terms, |bn: T| bn.get_limbs()),
        linear_flags,
    );
    (T::from_limbs_unsafe(q_limbs), T::from_limbs_unsafe(r_limbs))
}

/// Constrains a quadratic expression to equal zero modulo `MOD`.
///
/// This is the **recommended** way to constrain BigNum arithmetic for optimal performance.
/// Instead of using multiple constrained operations (`+`, `-`, `*`), compute results using
/// unconstrained functions (`__add`, `__mul`, etc.) and then constrain them with a single
/// call to this function.
///
/// # Expression Format
/// Constrains: `sum_i(product(lhs_terms[i]) * product(rhs_terms[i])) + sum(linear_terms) == 0 (mod MOD)`
///
/// # Parameters
/// - `lhs_terms`: Left-hand side terms for each product. Shape: `[NUM_PRODUCTS][LHS_N]`
/// - `lhs_flags`: If `true`, the corresponding lhs_term is negated
/// - `rhs_terms`: Right-hand side terms for each product. Shape: `[NUM_PRODUCTS][RHS_N]`
/// - `rhs_flags`: If `true`, the corresponding rhs_term is negated
/// - `linear_terms`: Terms to add to the sum. Shape: `[ADD_N]`
/// - `linear_flags`: If `true`, the corresponding linear_term is negated
///
/// # Example: Constraining `a * b + c - result == 0`
/// ```
/// // First compute result unconstrainedly
/// // Safety: witness computation, constrained below
/// let result = unsafe { a.__mul(b).__add(c) };
///
/// // Then constrain: a * b + c - result == 0
/// evaluate_quadratic_expression(
///     [[a]],           // lhs: [a]
///     [[false]],       // not negated
///     [[b]],           // rhs: [b]
///     [[false]],       // not negated
///     [c, result],     // linear: c + (-result)
///     [false, true],   // c positive, result negated
/// );
/// ```
///
/// # Example: Constraining `(a + b) * c - d == 0`
/// ```
/// // Safety: witness computation
/// let d = unsafe { (a.__add(b)).__mul(c) };
///
/// // Constrain: (a + b) * c - d == 0
/// evaluate_quadratic_expression(
///     [[a, b]],        // lhs: (a + b)
///     [[false, false]],
///     [[c]],           // rhs: c
///     [[false]],
///     [d],             // linear: -d
///     [true],          // d is negated
/// );
/// ```
///
/// # Performance Note
/// This function generates far fewer constraints than equivalent sequences of `+`, `-`, `*`
/// operations. For complex expressions, the savings can be substantial.
///
/// # Panics
/// Fails if the expression does not equal zero modulo `MOD`.
pub fn evaluate_quadratic_expression<T: BigNum, let LHS_N: u32, let RHS_N: u32, let NUM_PRODUCTS: u32, let ADD_N: u32>(
    lhs_terms: [[T; LHS_N]; NUM_PRODUCTS],
    lhs_flags: [[bool; LHS_N]; NUM_PRODUCTS],
    rhs_terms: [[T; RHS_N]; NUM_PRODUCTS],
    rhs_flags: [[bool; RHS_N]; NUM_PRODUCTS],
    linear_terms: [T; ADD_N],
    linear_flags: [bool; ADD_N],
) {
    let params = T::params();
    crate::fns::expressions::evaluate_quadratic_expression(
        params,
        crate::utils::map::map(
            lhs_terms,
            |bns| crate::utils::map::map(bns, |bn: T| bn.get_limbs()),
        ),
        lhs_flags,
        crate::utils::map::map(
            rhs_terms,
            |bns| crate::utils::map::map(bns, |bn: T| bn.get_limbs()),
        ),
        rhs_flags,
        crate::utils::map::map(linear_terms, |bn: T| bn.get_limbs()),
        linear_flags,
    )
}

/// Computes the modular inverses of multiple BigNum values efficiently (unconstrained).
///
/// Uses Montgomery's batch inversion trick to compute all inverses with only a single
/// modular inversion, making this much more efficient than calling `__invmod` repeatedly.
///
/// # Requirements
/// - `MOD` must be prime (`params.has_multiplicative_inverse == true`)
/// - Zero elements are allowed and will map to zero in the output
///
/// # Performance
/// Computes M inverses using:
/// - 3(M-1) multiplications
/// - 1 inversion
///
/// This is much cheaper than M separate inversions for M > 1.
///
/// # Safety
/// **UNCONSTRAINED**: No constraints are generated. Use the results as witnesses and
/// constrain them appropriately (e.g., verify `x[i] * result[i] == 1` using
/// `evaluate_quadratic_expression`).
///
/// # Example
/// ```
/// // Safety: unconstrained batch inversion
/// let inverses = unsafe { batch_invert([a, b, c]) };
/// // inverses[0] == a^{-1}, inverses[1] == b^{-1}, inverses[2] == c^{-1}
/// ```
pub unconstrained fn batch_invert<T: BigNum, let M: u32>(x: [T; M]) -> [T; M] {
    let params = T::params();
    assert(params.has_multiplicative_inverse);
    crate::fns::unconstrained_ops::batch_invert(params, x.map(|bn: T| bn.get_limbs())).map(|limbs| {
        T::from_limbs_unsafe(limbs)
    })
}

/// Computes the modular inverses of a slice of BigNum values efficiently (unconstrained).
///
/// Same as `batch_invert` but accepts a dynamically-sized slice instead of a fixed-size array.
///
/// # Requirements
/// - `MOD` must be prime (`params.has_multiplicative_inverse == true`)
/// - Zero elements are allowed and will map to zero in the output
///
/// # Safety
/// **UNCONSTRAINED**: No constraints are generated.
///
/// See `batch_invert` for more details.
pub unconstrained fn batch_invert_slice<T: BigNum>(x: [T]) -> [T] {
    let params = T::params();
    assert(params.has_multiplicative_inverse);
    crate::fns::unconstrained_ops::batch_invert_slice(params, x.map(|bn: T| bn.get_limbs()))
        .map(|limbs| T::from_limbs_unsafe(limbs))
}

/// Converts a BigNum to a native circuit Field element.
///
/// # Requirements
/// - The BigNum value must be less than the circuit field modulus (Grumpkin: ~2^254)
/// - For N > 2, the value is validated to be less than the Grumpkin modulus
///
/// # Panics
/// - Fails range validation if the value is >= circuit field modulus
/// - Fails if limbs are not properly range-constrained
///
/// # Note
/// This is a constrained operation that validates the BigNum is representable as a Field.
/// For BigNums with `MOD_BITS > 253`, ensure your value is actually less than the circuit
/// field modulus before calling this.
pub fn to_field<T: BigNum>(bn: T) -> Field {
    let params = T::params();
    limbs_to_field(params, bn.get_limbs())
}
