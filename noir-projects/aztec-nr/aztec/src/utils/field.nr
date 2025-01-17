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
    let w = v * (v - 1);
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

// An overly-careful implementation of sqrt, which includes assertions to catch
// mistakes.
pub unconstrained fn __sqrt(x: Field) -> (bool, Field) {
    let is_sq = is_square(x);
    let mut maybe_sqrt = 0;
    if is_sq {
        maybe_sqrt = tonelli_shanks_sqrt(x);
        assert(maybe_sqrt * maybe_sqrt == x); // to catch bugs. Can be removed in prod.
    } else {
        // Demonstrate that x is not a square (a.k.a. a non-residue).
        // Fact: If x a non-residue, x * KNOWN_NON_RESIDUE will be a residue,
        // since -1 * -1 = 1 when considering their legendre symbols.
        let demo_not_square = x * KNOWN_NON_RESIDUE;
        maybe_sqrt = tonelli_shanks_sqrt(demo_not_square);
        assert(maybe_sqrt * maybe_sqrt == demo_not_square); // to catch bugs. Can be removed in prod.
    }
    (is_sq, maybe_sqrt)
}

// Returns (false, 0) if there is no square root.
// Returns (true, sqrt) if there is a square root.
pub fn sqrt(x: Field) -> (bool, Field) {
    let (is_sq, maybe_sqrt) = unsafe { __sqrt(x) };
    let mut out: (bool, Field) = (false, 0);
    if is_sq {
        let sqrt = maybe_sqrt;
        assert(sqrt * sqrt == x);
        out = (true, sqrt);
    } else {
        let not_sqrt = maybe_sqrt;
        let demo_not_square = x * KNOWN_NON_RESIDUE;
        // Given that this is square, it implies x is not square.
        assert(not_sqrt * not_sqrt == demo_not_square);
    }
    out
}

#[test]
fn test_sqrt() {
    let x = 9;
    let (is_sq, sqrt) = sqrt(x);
    assert(is_sq);
    assert((sqrt == 3) | (sqrt == -3));
}

#[test]
fn test_non_square() {
    let x = 5;
    let (is_sq, sqrt) = sqrt(x);
    assert(!is_sq);
    assert(sqrt == 0);
}

#[test]
fn test_sqrt_0() {
    let x = 0;
    let (is_sq, sqrt) = sqrt(x);
    assert(is_sq);
    assert(sqrt == 0);
}

#[test]
fn test_sqrt_1() {
    let x = 1;
    let (is_sq, sqrt) = sqrt(x);
    assert(is_sq);
    assert((sqrt == 1) | (sqrt == -1));
}
