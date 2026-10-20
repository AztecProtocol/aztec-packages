use ::bignum::BigNum;
use ::bignum::bignum::evaluate_quadratic_expression;
use ::bignum::internal::hash_seed_to_field;

/// Try-and-increment inner loop for hash-to-curve (unconstrained)
///
/// Hashes `(seedbase, seed_counter)` with Poseidon2, derives an x-coordinate,
/// and attempts a square root. If `x^3 + ax + b` is not a quadratic residue,
/// increments `seed_counter` and recurses.
///
/// Returns `(x, y, seed_counter)` for the first successful attempt.
unconstrained fn __hash_to_curve_inner<BN>(
    seedbase: Field,
    seed_counter: Field,
    a: BN,
    b: BN,
) -> (BN, BN, Field)
where
    BN: BigNum,
{
    let seedhash: Field = poseidon::poseidon2::Poseidon2::hash([seedbase, seed_counter], 2);
    let seedhash_bytes: [u8; 32] = seedhash.to_le_bytes();

    let x: BN = BN::derive_from_seed(seedhash_bytes);
    let yy: BN = x * x * x + a * x + b;

    x.validate_in_field();
    yy.validate_in_field();

    let y: std::option::Option<BN> = yy.__sqrt();

    let y_val: BN = y.unwrap_unchecked();
    let parity_flag: bool = (seedhash_bytes[0] & 1) == 1;
    let y_parity: bool = (y_val.get_limb(0) & 1) == 1;
    let y_out: BN = if (y_parity == parity_flag) {
        y_val
    } else {
        y_val.__neg()
    };
    let yy_reconstructed: BN = y_out * y_out;

    if (yy_reconstructed == yy) & (y.is_some()) {
        y_out.validate_in_field();
        y_out.validate_in_range();
        (x, y_out, seed_counter)
    } else {
        __hash_to_curve_inner(seedbase, seed_counter + 1, a, b)
    }
}

/// Witness generation entry point for hash-to-curve (unconstrained)
///
/// Hashes the seed bytes into a Poseidon2 field element, then delegates
/// to `__hash_to_curve_inner` with `seed_counter = 0`.
unconstrained fn __hash_to_curve_witgen<BN, let SeedBytes: u32>(
    seed: [u8; SeedBytes],
    a: BN,
    b: BN,
) -> (BN, BN, Field)
where
    BN: BigNum,
{
    let hashed_seed: Field = hash_seed_to_field(seed);
    __hash_to_curve_inner(hashed_seed, 0, a, b)
}

/// Hash an arbitrary byte seed to a curve point.
///
/// **Soundness warning:** the `salt` (nonce) is not constrained to be the
/// lowest valid value - a malicious prover can choose alternative nonces to
/// influence the output. See `BigCurve::hash_to_curve` docs for details.
///
/// ## Algorithm
///
///   1. Generate `(y, salt)` witness via unconstrained `__hash_to_curve_witgen`
///   2. Recompute `x = derive_from_seed(Poseidon2(outer_hash, salt))`
///   3. Verify `y^2 == x^3 + a*x + b` (proves the point is on the curve)
///   4. Select `y` parity based on the low bit of the inner hash
///   5. Validate `x` and `y` are in the field and in range
pub fn hash_to_curve<BN, let SeedBytes: u32>(seed: [u8; SeedBytes], a: BN, b: BN) -> (BN, BN)
where
    BN: BigNum,
{
    // Safety: We constrain every output later
    let (_, y, salt): (BN, BN, Field) = unsafe { __hash_to_curve_witgen(seed, a, b) };

    let outer_hash: Field = hash_seed_to_field(seed);
    let inner_hash: Field = poseidon::poseidon2::Poseidon2::hash([outer_hash, salt], 2);

    let inner_hash: [u8; 32] = inner_hash.to_le_bytes();
    let x: BN = BN::derive_from_seed(inner_hash);

    let xx: BN = x * x;

    // xx * x - y * y + a * x + b = 0 (mod MOD)
    evaluate_quadratic_expression(
        [[xx], [y], [a]],
        [[false], [false], [false]],
        [[x], [y], [x]],
        [[false], [true], [false]],
        [b],
        [false],
    );

    // bind the parity
    // We .validate_in_field later, so the only possible mismatch can be when y == 0 (MOD is allowed in this case)
    assert((y.get_limb(0) & 1) as Field == (inner_hash[0] & 1) as Field);

    x.validate_in_field();
    x.validate_in_range();
    y.validate_in_field();
    y.validate_in_range();
    (x, y)
}
