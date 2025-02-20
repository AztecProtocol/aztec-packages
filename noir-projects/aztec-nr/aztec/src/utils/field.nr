use std::option::Option;

global KNOWN_NON_RESIDUE: Field = 5; // This is a non-residue in Noir's native Field.

global C1: u32 = 28;
global C3: Field = 40770029410420498293352137776570907027550720424234931066070132305055;
global C5: Field = 19103219067921713944291392827692070036145651957329286315305642004821462161904;

// Power function of two Field arguments of arbitrary size.
// Adapted from std::field::pow_32.
pub fn pow(x: Field, y: Field) -> Field {
    let mut r = 1 as Field;
    let b: [u1; 254] = y.to_le_bits();

    for i in 0..254 {
        r *= r;
        r *= (b[254 - 1 - i] as Field) * x + (1 - b[254 - 1 - i] as Field);
    }

    r
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
pub unconstrained fn __sqrt(x: Field) -> (bool, Field) {
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

// Returns (false, 0) if there is no square root.
// Returns (true, sqrt) if there is a square root.
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
fn test_sqrt() {
    let x = 9;
    let maybe_sqrt = sqrt(x);
    assert(maybe_sqrt.is_some());
    let sqrt = maybe_sqrt.unwrap_unchecked();
    assert((sqrt == 3) | (sqrt == -3));
}

#[test]
fn test_non_square() {
    let x = 5;
    let maybe_sqrt = sqrt(x);
    assert(maybe_sqrt.is_none());
}

#[test]
unconstrained fn test_known_non_residue_is_actually_a_non_residue_in_the_field() {
    assert(!is_square(KNOWN_NON_RESIDUE));
}

#[test]
fn test_sqrt_0() {
    let x = 0;
    let sqrt = sqrt(x).unwrap();
    assert(sqrt == 0);
}

#[test]
fn test_sqrt_1() {
    let x = 1;
    let sqrt = sqrt(x).unwrap();
    assert((sqrt == 1) | (sqrt == -1));
}

#[test(should_fail_with = "The claimed_sqrt 0x04 is not the sqrt of x 0x09")]
fn test_bad_sqrt_hint_fails() {
    validate_sqrt_hint(9, 4);
}

#[test(should_fail_with = "The hint 0x04 does not demonstrate that 0x0a is not a square")]
fn test_bad_not_sqrt_hint_fails() {
    validate_not_sqrt_hint(10, 4);
}

#[test(should_fail_with = "0 has a square root; you cannot claim it is not square")]
fn test_0_not_sqrt_hint_fails() {
    validate_not_sqrt_hint(0, 0);
}

#[test]
unconstrained fn test_is_square() {
    assert(is_square(25));
}

#[test]
unconstrained fn test_is_not_square() {
    assert(!is_square(10));
}

