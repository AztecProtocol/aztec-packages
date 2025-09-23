global KNOWN_NON_RESIDUE: Field = 5; // This is a non-residue in Noir's native Field.

pub fn field_from_bytes<let N: u32>(bytes: [u8; N], big_endian: bool) -> Field {
    assert(bytes.len() < 32, "field_from_bytes: N must be less than 32");
    let mut as_field = 0;
    let mut offset = 1;
    for i in 0..N {
        let mut index = i;
        if big_endian {
            index = N - i - 1;
        }
        as_field += (bytes[index] as Field) * offset;
        offset *= 256;
    }

    as_field
}

// Convert a 32 byte array to a field element by truncating the final byte
pub fn field_from_bytes_32_trunc(bytes32: [u8; 32]) -> Field {
    // Convert it to a field element
    let mut v = 1;
    let mut high = 0 as Field;
    let mut low = 0 as Field;

    for i in 0..15 {
        // covers bytes 16..30 (31 is truncated and ignored)
        low = low + (bytes32[15 + 15 - i] as Field) * v;
        v = v * 256;
        // covers bytes 0..14
        high = high + (bytes32[14 - i] as Field) * v;
    }
    // covers byte 15
    low = low + (bytes32[15] as Field) * v;

    low + high * v
}

// TODO: This currently only exists to aid point compression in compress_to_blob_commitment().
// Once compression is part of BigCurve it can either be removed or optimized to be used elsewhere.
pub fn byte_to_bits_be(byte: u8) -> [u1; 8] {
    let mut mut_byte = byte;
    let mut bits: [u1; 8] = [0; 8];
    for i in 0..8 {
        bits[7 - i] = (mut_byte & 1) as u1;
        mut_byte >>= 1;
    }
    bits
}

// TODO to radix returns u8, so we cannot use bigger radixes. It'd be ideal to use a radix of the maximum range-constrained integer noir supports
pub fn full_field_less_than(lhs: Field, rhs: Field) -> bool {
    lhs.lt(rhs)
}

pub fn full_field_greater_than(lhs: Field, rhs: Field) -> bool {
    rhs.lt(lhs)
}

pub fn min(f1: Field, f2: Field) -> Field {
    if f1.lt(f2) {
        f1
    } else {
        f2
    }
}

global C1: u32 = 28;
global C3: Field = 40770029410420498293352137776570907027550720424234931066070132305055;
global C5: Field = 19103219067921713944291392827692070036145651957329286315305642004821462161904;

pub fn pow(x: Field, y: Field) -> Field {
    let mut r = 1 as Field;
    let b: [u1; 254] = y.to_le_bits();

    for i in 0..254 {
        r *= r;
        r *= (b[254 - 1 - i] as Field) * x + (1 - b[254 - 1 - i] as Field);
    }

    r
}

/// Returns Option::some(sqrt) if there is a square root, and Option::none() if there isn't.
pub fn sqrt(x: Field) -> Option<Field> {
    // Safety: if the hint returns the square root of x, then we simply square it
    // check the result equals x. If x is not square, we return a value that
    // enables us to prove that fact (see the `else` clause below).
    let (is_sq, maybe_sqrt) = unsafe { __sqrt(x) };

    if is_sq {
        let sqrt = maybe_sqrt;
        validate_sqrt_hint(x, sqrt);
        Option::some(sqrt)
    } else {
        let not_sqrt_hint = maybe_sqrt;
        validate_not_sqrt_hint(x, not_sqrt_hint);
        Option::none()
    }
}

// Boolean indicating whether Field element is a square, i.e. whether there exists a y in Field s.t. x = y*y.
unconstrained fn is_square(x: Field) -> bool {
    let v = pow(x, -1 / 2);
    v * (v - 1) == 0
}

// Tonelli-Shanks algorithm for computing the square root of a Field element.
// Requires C1 = max{c: 2^c divides (p-1)}, where p is the order of Field
// as well as C3 = (C2 - 1)/2, where C2 = (p-1)/(2^c1),
// and C5 = ZETA^C2, where ZETA is a non-square element of Field.
// These are pre-computed above as globals.
unconstrained fn tonelli_shanks_sqrt(x: Field) -> Field {
    let mut z = pow(x, C3);
    let mut t = z * z * x;
    z *= x;
    let mut b = t;
    let mut c = C5;

    for i in 0..(C1 - 1) {
        for _j in 1..(C1 - i - 1) {
            b *= b;
        }

        z *= if b == 1 { 1 } else { c };

        c *= c;

        t *= if b == 1 { 1 } else { c };

        b = t;
    }

    z
}

// NB: this doesn't return an option, because in the case of there _not_ being a square root, we still want to return a field element that allows us to then assert in the _constrained_ sqrt function that there is no sqrt.
unconstrained fn __sqrt(x: Field) -> (bool, Field) {
    let is_sq = is_square(x);
    if is_sq {
        let sqrt = tonelli_shanks_sqrt(x);
        (true, sqrt)
    } else {
        // Demonstrate that x is not a square (a.k.a. a "quadratic non-residue").
        // Facts:
        // The Legendre symbol ("LS") of x, is x^((p-1)/2) (mod p).
        // - If x is a square, LS(x) = 1
        // - If x is not a square, LS(x) = -1
        // - If x = 0, LS(x) = 0.
        //
        // Hence:
        // sq * sq = sq // 1 * 1 = 1
        // non-sq * non-sq = sq // -1 * -1 = 1
        // sq * non-sq = non-sq // -1 * 1 = -1
        //
        // See: https://en.wikipedia.org/wiki/Legendre_symbol
        let demo_x_not_square = x * KNOWN_NON_RESIDUE;
        let not_sqrt = tonelli_shanks_sqrt(demo_x_not_square);
        (false, not_sqrt)
    }
}

fn validate_sqrt_hint(x: Field, hint: Field) {
    assert(hint * hint == x, f"The claimed_sqrt {hint} is not the sqrt of x {x}");
}

fn validate_not_sqrt_hint(x: Field, hint: Field) {
    // We need this assertion, because x = 0 would pass the other assertions in this
    // function, and we don't want people to be able to prove that 0 is not square!
    assert(x != 0, "0 has a square root; you cannot claim it is not square");
    // Demonstrate that x is not a square (a.k.a. a "quadratic non-residue").
    //
    // Facts:
    // The Legendre symbol ("LS") of x, is x^((p-1)/2) (mod p).
    // - If x is a square, LS(x) = 1
    // - If x is not a square, LS(x) = -1
    // - If x = 0, LS(x) = 0.
    //
    // Hence:
    // 1. sq * sq = sq // 1 * 1 = 1
    // 2. non-sq * non-sq = sq // -1 * -1 = 1
    // 3. sq * non-sq = non-sq // -1 * 1 = -1
    //
    // See: https://en.wikipedia.org/wiki/Legendre_symbol
    //
    // We want to demonstrate that this below multiplication falls under bullet-point (2):
    let demo_x_not_square = x * KNOWN_NON_RESIDUE;
    // I.e. we want to demonstrate that `demo_x_not_square` has Legendre symbol 1
    // (i.e. that it is a square), so we prove that it is square below.
    // Why do we want to prove that it has LS 1?
    // Well, since it was computed with a known-non-residue, its squareness implies we're
    // in case 2 (something multiplied by a known-non-residue yielding a result which
    // has a LS of 1), which implies that x must be a non-square. The unconstrained
    // function gave us the sqrt of demo_x_not_square, so all we need to do is
    // assert its squareness:
    assert(
        hint * hint == demo_x_not_square,
        f"The hint {hint} does not demonstrate that {x} is not a square",
    );
}

#[test]
unconstrained fn bytes_field_test() {
    // Tests correctness of field_from_bytes_32_trunc against existing methods
    // Bytes representing 0x543e0a6642ffeb8039296861765a53407bba62bd1c97ca43374de950bbe0a7
    let inputs = [
        84, 62, 10, 102, 66, 255, 235, 128, 57, 41, 104, 97, 118, 90, 83, 64, 123, 186, 98, 189, 28,
        151, 202, 67, 55, 77, 233, 80, 187, 224, 167,
    ];
    let field = field_from_bytes(inputs, true);
    let return_bytes: [u8; 31] = field.to_be_bytes();
    assert_eq(inputs, return_bytes);
    // 32 bytes - we remove the final byte, and check it matches the field
    let inputs2 = [
        84, 62, 10, 102, 66, 255, 235, 128, 57, 41, 104, 97, 118, 90, 83, 64, 123, 186, 98, 189, 28,
        151, 202, 67, 55, 77, 233, 80, 187, 224, 167, 158,
    ];
    let field2 = field_from_bytes_32_trunc(inputs2);
    let return_bytes2: [u8; 31] = field.to_be_bytes();

    assert_eq(return_bytes2, return_bytes);
    assert_eq(field2, field);
}

#[test]
unconstrained fn max_field_test() {
    // Tests the hardcoded value in constants.nr vs underlying modulus
    // NB: We can't use 0-1 in constants.nr as it will be transpiled incorrectly to ts and sol constants files
    let max_value = crate::constants::MAX_FIELD_VALUE;
    assert_eq(max_value, 0 - 1);
    // modulus == 0 is tested elsewhere, so below is more of a sanity check
    let max_bytes: [u8; 32] = max_value.to_be_bytes();
    let mod_bytes = std::field::modulus_be_bytes();
    for i in 0..31 {
        assert_eq(max_bytes[i], mod_bytes[i]);
    }
    assert_eq(max_bytes[31], mod_bytes[31] - 1);
}

#[test]
unconstrained fn sqrt_valid_test() {
    let x = 16; // examples: 16, 9, 25, 81
    let result = sqrt(x);
    assert(result.is_some());
    assert_eq(result.unwrap() * result.unwrap(), x);
}

#[test]
unconstrained fn sqrt_invalid_test() {
    let x = KNOWN_NON_RESIDUE; // has no square root in the field
    let result = sqrt(x);
    assert(result.is_none());
}
