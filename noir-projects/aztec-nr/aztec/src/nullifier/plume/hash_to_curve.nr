use crate::{nullifier::plume::constants::{GRUMPKIN_B, SQRT_NEG_3}, utils::field::sqrt};
use dep::protocol_types::{
    address::AztecAddress,
    hash::{poseidon2_hash, poseidon2_hash_with_separator},
    utils::arrays::array_concat,
};
use std::embedded_curve_ops::EmbeddedCurvePoint as Point;

// TODO: domain separators!
fn hash_to_2_fields_and_a_bit<let N: u32>(msg: [Field; N]) -> (Field, Field, bool) {
    // TODO: consider whether we can get away with fewer hashes.
    // E.g. using `m` as `u`.
    let mut m: Field = poseidon2_hash(msg);
    let u: Field = poseidon2_hash([m, 0]);
    let t: Field = poseidon2_hash([m, 1]);
    // TODO: consider whether there's a cheaper way to get an extra random bit `v` from the `msg`. Remember to update the typescript if you do change this!
    let v_field: Field = poseidon2_hash([m, 2]);
    let v = v_field as bool;
    (u, t, v)
}

// Doesn't need to be called or constrained, because it's mathematically proven to be true. We're just checking for bugs, here:
unconstrained fn check_at_least_one_sq(is_sq_y1: bool, is_sq_y2: bool, is_sq_y3: bool) {
    assert(is_sq_y1 | is_sq_y2 | is_sq_y3, "This error should be unreachable");
}

unconstrained fn check_hash_to_curve_result(x: Field, y: Field) {
    assert(x != 0);
    assert(y != 0);
    assert(
        y * y == x * x * x + GRUMPKIN_B,
        "Hash to curve output is not on the curve. This should be mathematically unreachable!",
    );
}

// SwiftEC https://eprint.iacr.org/2022/759
// https://hackmd.io/EbRP746JQfGmJFy7D2zNpw?view for the exact notation used here.
fn swift_hash_to_curve<let N: u32>(msg: [Field; N]) -> Point {
    let b = GRUMPKIN_B;
    let (u, t, v) = hash_to_2_fields_and_a_bit(msg);
    let u_3 = u * u * u;
    let t_2 = t * t;
    let x = (u_3 + b - t_2) / (2 * t);
    let y = (x + t) / (u * SQRT_NEG_3);
    let two_y = 2 * y;
    let u_over_2 = u / 2;
    let w = x / two_y;
    let x1 = w - u_over_2;
    let x2 = -w - u_over_2;
    let x3 = u + (two_y * two_y);
    let s1 = x1 * x1 * x1 + b;
    let s2 = x2 * x2 * x2 + b;
    let s3 = x3 * x3 * x3 + b;

    let maybe_y1 = sqrt(s1);
    let maybe_y2 = sqrt(s2);
    let maybe_y3 = sqrt(s3);

    let is_sq_y1 = maybe_y1.is_some();
    let is_sq_y2 = maybe_y2.is_some();
    let is_sq_y3 = maybe_y3.is_some();

    // Safety: these checks should be mathematically impossible to fail,
    // so we don't want to waste constraints with them.
    unsafe {
        check_at_least_one_sq(is_sq_y1, is_sq_y2, is_sq_y3);
    }

    let mut final_x = 0;
    let mut final_y = 0;
    if is_sq_y1 {
        final_x = x1;
        final_y = maybe_y1.unwrap_unchecked();
    } else if is_sq_y2 {
        final_x = x2;
        final_y = maybe_y2.unwrap_unchecked();
    } else {
        final_x = x3;
        final_y = maybe_y3.unwrap_unchecked();
    }

    // We choose between (x,y) and (x,-y) according to the bit v.
    final_y = if v { -final_y } else { final_y };

    // Safety: these checks should be mathematically impossible to fail,
    // so we don't want to waste constraints with them.
    unsafe {
        check_hash_to_curve_result(final_x, final_y);
    }

    Point { x: final_x, y: final_y, is_infinite: false }
}

/**
 * This function does siloing in the same way as the 
 * `compute_plume_nullifier_oracle`, but in constrained-land.
 */
pub fn siloed_hash_to_curve<let N: u32>(app_address: AztecAddress, input: [Field; N]) -> Point {
    let siloed_input = array_concat([app_address.to_field()], input);
    swift_hash_to_curve(siloed_input)
}
