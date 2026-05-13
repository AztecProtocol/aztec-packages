// Jacobian-coordinate EC arithmetic for BN254 (short Weierstrass a=0, b=3).
// Affine interpretation: (X, Y, Z) represents affine (X/Z^2, Y/Z^3).
// Identity: any point with Z = 0.
//
// Exposes three functions with the same names/signatures as the projective
// variant so SMVP / BPR shaders are source-compatible:
//   - add_points(p1, p2)        : general Jacobian add (11M + 5S)
//   - add_points_mixed(p1, p2)  : Jacobian add with Z2 = 1 (7M + 4S)
//   - double_point(p1)          : Jacobian doubling, a=0 (2M + 5S)
//
// All arithmetic is in Montgomery form. Values stored at z=get_r() represent
// the integer 1 (since Montgomery form stores x·R mod p, and 1·R = R).

fn is_zero(coord: BigInt) -> bool {
    for (var i = 0u; i < NUM_WORDS; i ++) {
        if (coord.limbs[i] != 0u) {
            return false;
        }
    }
    return true;
}

// EFD: g1p/auto-shortw-jacobian-0/doubling/dbl-2009-l
// 2M + 5S + 6add + 3*2 + 1*8. Valid for a=0 short Weierstrass.
fn double_point(p1: Point) -> Point {
    // Identity (Z=0) doubles to identity.
    if (is_zero(p1.z)) {
        return p1;
    }
    var X = p1.x; var Y = p1.y; var Z = p1.z;

    var A = montgomery_product(&X, &X);           // A = X^2            (S)
    var B = montgomery_product(&Y, &Y);           // B = Y^2            (S)
    var C = montgomery_product(&B, &B);           // C = B^2            (S)

    // D = 2 * ((X + B)^2 - A - C)
    var XpB = fr_add(&X, &B);
    var XpB_sq = montgomery_product(&XpB, &XpB); //                     (S)
    var t1 = fr_sub(&XpB_sq, &A);
    t1 = fr_sub(&t1, &C);
    var D = fr_add(&t1, &t1);

    // E = 3*A
    var E = fr_add(&A, &A);
    E = fr_add(&E, &A);

    var F = montgomery_product(&E, &E);           // F = E^2             (S)

    // X3 = F - 2*D
    var twoD = fr_add(&D, &D);
    var X3 = fr_sub(&F, &twoD);

    // Y3 = E * (D - X3) - 8*C
    var DmX3 = fr_sub(&D, &X3);
    var eightC = fr_add(&C, &C);
    eightC = fr_add(&eightC, &eightC);
    eightC = fr_add(&eightC, &eightC);
    var Y3 = montgomery_product(&E, &DmX3);       //                     (M)
    Y3 = fr_sub(&Y3, &eightC);

    // Z3 = 2 * Y * Z
    var YZ = montgomery_product(&Y, &Z);          //                     (M)
    var Z3 = fr_add(&YZ, &YZ);

    return Point(X3, Y3, Z3);
}

// EFD: g1p/auto-shortw-jacobian-0/addition/add-2007-bl
// 11M + 5S + 9add + 4*2. Valid for general Jacobian points.
//
// IMPORTANT: add-2007-bl is NOT strongly unified. When p1 == p2 (same
// affine point) the raw formula produces (0,0,0) instead of 2·P. We add
// an explicit doubling fallback: if H = U2 - U1 == 0 AND S2 - S1 == 0,
// the points are equal, so call double_point(p1).
//
// Inverse case (p1 == -p2) falls through naturally: H == 0 but S2-S1 != 0,
// so the formula computes Z3 = ((Z1+Z2)^2 - Z1Z1 - Z2Z2) * H = 0, which
// downstream code interprets as identity regardless of the (X3, Y3)
// returned.
//
// This collision case is NOT rare in cuZK — the BPR running-sum pattern
// (m = m + b; g = g + m) trivially creates m == g whenever an identity
// bucket follows a non-identity one. See
// src/submission/miscellaneous/tests/jacobian_bn254.test.ts for the
// regression test that caught this.
fn add_points(p1: Point, p2: Point) -> Point {
    if (is_zero(p1.z)) { return p2; }
    if (is_zero(p2.z)) { return p1; }

    var X1 = p1.x; var Y1 = p1.y; var Z1 = p1.z;
    var X2 = p2.x; var Y2 = p2.y; var Z2 = p2.z;

    var Z1Z1 = montgomery_product(&Z1, &Z1);      // Z1^2                (S)
    var Z2Z2 = montgomery_product(&Z2, &Z2);      // Z2^2                (S)

    var U1 = montgomery_product(&X1, &Z2Z2);      // U1 = X1 * Z2Z2      (M)
    var U2 = montgomery_product(&X2, &Z1Z1);      // U2 = X2 * Z1Z1      (M)

    var Y1Z2 = montgomery_product(&Y1, &Z2);      //                     (M)
    var S1 = montgomery_product(&Y1Z2, &Z2Z2);    // S1 = Y1*Z2*Z2Z2     (M)
    var Y2Z1 = montgomery_product(&Y2, &Z1);      //                     (M)
    var S2 = montgomery_product(&Y2Z1, &Z1Z1);    // S2 = Y2*Z1*Z1Z1     (M)

    // Doubling fallback: p1 == p2 (same affine point). add-2007-bl is NOT
    // strongly unified, so without this the formula yields (0,0,0) on
    // collision. Collisions occur every time the BPR running-sum pattern
    // lines m == g up (e.g. identity bucket after non-identity).
    if (bigint_eq(&U1, &U2) && bigint_eq(&S1, &S2)) {
        return double_point(p1);
    }

    var H = fr_sub(&U2, &U1);
    var S2mS1 = fr_sub(&S2, &S1);

    var twoH = fr_add(&H, &H);
    var I = montgomery_product(&twoH, &twoH);     // I = (2H)^2          (S)
    var J = montgomery_product(&H, &I);           // J = H*I             (M)

    var r = fr_add(&S2mS1, &S2mS1);               // r = 2*(S2-S1)
    var V = montgomery_product(&U1, &I);          // V = U1*I            (M)

    // X3 = r^2 - J - 2V
    var r_sq = montgomery_product(&r, &r);        //                     (S)
    var twoV = fr_add(&V, &V);
    var X3 = fr_sub(&r_sq, &J);
    X3 = fr_sub(&X3, &twoV);

    // Y3 = r*(V - X3) - 2*S1*J
    var VmX3 = fr_sub(&V, &X3);
    var rVX = montgomery_product(&r, &VmX3);      //                     (M)
    var S1J = montgomery_product(&S1, &J);        //                     (M)
    var twoS1J = fr_add(&S1J, &S1J);
    var Y3 = fr_sub(&rVX, &twoS1J);

    // Z3 = ((Z1+Z2)^2 - Z1Z1 - Z2Z2) * H
    var ZpZ = fr_add(&Z1, &Z2);
    var ZpZ_sq = montgomery_product(&ZpZ, &ZpZ); //                      (S)
    var zsum = fr_sub(&ZpZ_sq, &Z1Z1);
    zsum = fr_sub(&zsum, &Z2Z2);
    var Z3 = montgomery_product(&zsum, &H);       //                     (M)

    // FIX: build the result via field assignment on a `var Point`, NOT via
    // the `return Point(X3, Y3, Z3)` constructor. The constructor form
    // drops the trailing Z field on the BPR stage_2 call site (Dawn /
    // Metal codegen quirk; X3/Y3 land correctly, Z3 reads as zero at
    // the caller's writeback, producing identity outputs). The field-
    // assignment pattern matches what double_and_add does and survives
    // the same call site.
    var result: Point;
    result.x = X3;
    result.y = Y3;
    result.z = Z3;
    return result;
}

// Diagnostic sibling of add_points with the bigint_eq collision fallback
// removed. Used ONLY by BPR stage_2 in v14-diag to determine whether the
// collision check (or the double_point it calls) is the source of the
// stage_2 identity-output bug. Callers must ensure p1 != p2 affinely —
// otherwise the formula returns (0,0,0), which is handled as identity.
fn add_points_no_collision(p1: Point, p2: Point) -> Point {
    if (is_zero(p1.z)) { return p2; }
    if (is_zero(p2.z)) { return p1; }

    var X1 = p1.x; var Y1 = p1.y; var Z1 = p1.z;
    var X2 = p2.x; var Y2 = p2.y; var Z2 = p2.z;

    var Z1Z1 = montgomery_product(&Z1, &Z1);
    var Z2Z2 = montgomery_product(&Z2, &Z2);

    var U1 = montgomery_product(&X1, &Z2Z2);
    var U2 = montgomery_product(&X2, &Z1Z1);

    var Y1Z2 = montgomery_product(&Y1, &Z2);
    var S1 = montgomery_product(&Y1Z2, &Z2Z2);
    var Y2Z1 = montgomery_product(&Y2, &Z1);
    var S2 = montgomery_product(&Y2Z1, &Z1Z1);

    var H = fr_sub(&U2, &U1);
    var S2mS1 = fr_sub(&S2, &S1);

    var twoH = fr_add(&H, &H);
    var I = montgomery_product(&twoH, &twoH);
    var J = montgomery_product(&H, &I);

    var r = fr_add(&S2mS1, &S2mS1);
    var V = montgomery_product(&U1, &I);

    var r_sq = montgomery_product(&r, &r);
    var twoV = fr_add(&V, &V);
    var X3 = fr_sub(&r_sq, &J);
    X3 = fr_sub(&X3, &twoV);

    var VmX3 = fr_sub(&V, &X3);
    var rVX = montgomery_product(&r, &VmX3);
    var S1J = montgomery_product(&S1, &J);
    var twoS1J = fr_add(&S1J, &S1J);
    var Y3 = fr_sub(&rVX, &twoS1J);

    var ZpZ = fr_add(&Z1, &Z2);
    var ZpZ_sq = montgomery_product(&ZpZ, &ZpZ);
    var zsum = fr_sub(&ZpZ_sq, &Z1Z1);
    zsum = fr_sub(&zsum, &Z2Z2);
    var Z3 = montgomery_product(&zsum, &H);

    // FIX (see add_points above): field assignment, not constructor return.
    var result: Point;
    result.x = X3;
    result.y = Y3;
    result.z = Z3;
    return result;
}

// EFD: g1p/auto-shortw-jacobian-0/addition/madd-2007-bl
// 7M + 4S + 9add + 1*4 + 3*2. Assumes Z2 == 1 (affine p2).
// p2.z is IGNORED by this function.
//
// Callers (SMVP bucket inner loop) load p2 with z=get_r() — the Montgomery
// representation of 1 — so the "Z2=1" precondition holds. BN254 has prime
// order so no affine point has Y=0; we do not branch on "p2 is identity".
fn add_points_mixed(p1: Point, p2: Point) -> Point {
    // If p1 is identity, result is p2 — but we must set Z=R (Montgomery 1)
    // so downstream Jacobian math sees a valid Z=1 representation. We
    // inline r_limbs here rather than calling a get_r() helper because WGSL
    // requires declaration-before-use and ec_funcs is included before
    // get_r() is defined in the SMVP/BPR shaders.
    if (is_zero(p1.z)) {
        // Local Montgomery-1 constant (value R mod p). Renamed from `r` to
        // avoid any confusion with the `r` (= 2*(S2-Y1)) used later in the
        // main formula body below.
        var r: BigInt;
{{{ r_limbs }}}
        let mont_one = r;
        return Point(p2.x, p2.y, mont_one);
    }

    var X1 = p1.x; var Y1 = p1.y; var Z1 = p1.z;
    var X2 = p2.x; var Y2 = p2.y;

    var Z1Z1 = montgomery_product(&Z1, &Z1);      // Z1^2                (S)
    var U2 = montgomery_product(&X2, &Z1Z1);      // U2 = X2*Z1Z1        (M)
    var Y2Z1 = montgomery_product(&Y2, &Z1);      //                     (M)
    var S2 = montgomery_product(&Y2Z1, &Z1Z1);    // S2 = Y2*Z1*Z1Z1     (M)

    // Doubling fallback: p1 == p2 affinely (same guarantee as in add_points).
    // For mixed-add: affine-X equal iff X1 == U2; affine-Y equal iff Y1 == S2.
    if (bigint_eq(&X1, &U2) && bigint_eq(&Y1, &S2)) {
        return double_point(p1);
    }

    var H = fr_sub(&U2, &X1);                     // H = U2 - X1
    var HH = montgomery_product(&H, &H);          // HH = H^2            (S)

    // I = 4*HH
    var I = fr_add(&HH, &HH);
    I = fr_add(&I, &I);

    var J = montgomery_product(&H, &I);           // J = H*I             (M)

    var S2mY1 = fr_sub(&S2, &Y1);
    var r = fr_add(&S2mY1, &S2mY1);               // r = 2*(S2 - Y1)

    var V = montgomery_product(&X1, &I);          // V = X1*I            (M)

    // X3 = r^2 - J - 2V
    var r_sq = montgomery_product(&r, &r);        //                     (S)
    var twoV = fr_add(&V, &V);
    var X3 = fr_sub(&r_sq, &J);
    X3 = fr_sub(&X3, &twoV);

    // Y3 = r*(V - X3) - 2*Y1*J
    var VmX3 = fr_sub(&V, &X3);
    var rVX = montgomery_product(&r, &VmX3);      //                     (M)
    var Y1J = montgomery_product(&Y1, &J);        //                     (M)
    var twoY1J = fr_add(&Y1J, &Y1J);
    var Y3 = fr_sub(&rVX, &twoY1J);

    // Z3 = (Z1 + H)^2 - Z1Z1 - HH
    var ZpH = fr_add(&Z1, &H);
    var ZpH_sq = montgomery_product(&ZpH, &ZpH); //                      (S)
    var Z3 = fr_sub(&ZpH_sq, &Z1Z1);
    Z3 = fr_sub(&Z3, &HH);

    return Point(X3, Y3, Z3);
}

// SRS-only fast path: same as add_points_mixed but skips the
// `bigint_eq(X1,U2) && bigint_eq(Y1,S2)` collision check that routes to
// double_point on equal operands. SAFETY: caller must guarantee p1 and
// p2 are NOT affinely equal. For SRS-backed inputs (linearly independent
// random points in G1) this is statistically impossible — the only way
// the running bucket sum coincides with a fresh SRS point is a discrete-
// log accident, which is computationally infeasible by assumption.
//
// The identity short-circuit at the top is kept (genuine: every bucket's
// first iteration starts with `sum = inf` which has Z = 0).
//
// Saves 2 × bigint_eq per call. With 1M calls in SMVP at N=2^16, that's
// ~10 ms of GPU time.
fn add_points_mixed_no_collision(p1: Point, p2: Point) -> Point {
    if (is_zero(p1.z)) {
        var r: BigInt;
{{{ r_limbs }}}
        let mont_one = r;
        return Point(p2.x, p2.y, mont_one);
    }

    var X1 = p1.x; var Y1 = p1.y; var Z1 = p1.z;
    var X2 = p2.x; var Y2 = p2.y;

    var Z1Z1 = montgomery_product(&Z1, &Z1);
    var U2 = montgomery_product(&X2, &Z1Z1);
    var Y2Z1 = montgomery_product(&Y2, &Z1);
    var S2 = montgomery_product(&Y2Z1, &Z1Z1);

    var H = fr_sub(&U2, &X1);
    var HH = montgomery_product(&H, &H);

    var I = fr_add(&HH, &HH);
    I = fr_add(&I, &I);

    var J = montgomery_product(&H, &I);

    var S2mY1 = fr_sub(&S2, &Y1);
    var r = fr_add(&S2mY1, &S2mY1);

    var V = montgomery_product(&X1, &I);

    var r_sq = montgomery_product(&r, &r);
    var twoV = fr_add(&V, &V);
    var X3 = fr_sub(&r_sq, &J);
    X3 = fr_sub(&X3, &twoV);

    var VmX3 = fr_sub(&V, &X3);
    var rVX = montgomery_product(&r, &VmX3);
    var Y1J = montgomery_product(&Y1, &J);
    var twoY1J = fr_add(&Y1J, &Y1J);
    var Y3 = fr_sub(&rVX, &twoY1J);

    var ZpH = fr_add(&Z1, &H);
    var ZpH_sq = montgomery_product(&ZpH, &ZpH);
    var Z3 = fr_sub(&ZpH_sq, &Z1Z1);
    Z3 = fr_sub(&Z3, &HH);

    return Point(X3, Y3, Z3);
}
