// 23-bit f32 mirror of `ec_bn254.template.wgsl`. Jacobian-coordinate EC
// arithmetic for BN254 (short Weierstrass a=0, b=3) with every field op
// routed through `fr_*_f32` and `montgomery_product_f32`.
//
// Identity: any point with Z = 0 (limbs all-zero). Mont-1 (R_f) is written
// when the identity short-circuit in mixed-add needs an affine-Z slot.
//
// Functions mirror the u32 path one-for-one:
//   - is_zero_f32(coord)
//   - double_point_f32(p1)
//   - add_points_f32(p1, p2)
//   - add_points_no_collision_f32(p1, p2)
//   - add_points_mixed_f32(p1, p2)
//   - add_points_mixed_no_collision_f32(p1, p2)

struct PointF32 {
  x: BigIntF32,
  y: BigIntF32,
  z: BigIntF32
}

fn is_zero_f32(coord: ptr<function, BigIntF32>) -> bool {
    return bigint_f32_is_zero(coord);
}

// EFD: g1p/auto-shortw-jacobian-0/doubling/dbl-2009-l
// 2M + 5S + 6add + 3*2 + 1*8. Valid for a=0 short Weierstrass.
fn double_point_f32(p1: PointF32) -> PointF32 {
    var Z_chk = p1.z;
    if (is_zero_f32(&Z_chk)) {
        return p1;
    }
    var X = p1.x; var Y = p1.y; var Z = p1.z;

    var A = fr_sqr_f32(&X);                       // A = X^2            (S)
    var B = fr_sqr_f32(&Y);                       // B = Y^2            (S)
    var C = fr_sqr_f32(&B);                       // C = B^2            (S)

    // D = 2 * ((X + B)^2 - A - C)
    var XpB = fr_add_f32(&X, &B);
    var XpB_sq = fr_sqr_f32(&XpB);                //                     (S)
    var t1 = fr_sub_f32(&XpB_sq, &A);
    t1 = fr_sub_f32(&t1, &C);
    var D = fr_add_f32(&t1, &t1);

    // E = 3*A
    var E = fr_add_f32(&A, &A);
    E = fr_add_f32(&E, &A);

    var F = fr_sqr_f32(&E);                       // F = E^2             (S)

    // X3 = F - 2*D
    var twoD = fr_add_f32(&D, &D);
    var X3 = fr_sub_f32(&F, &twoD);

    // Y3 = E * (D - X3) - 8*C
    var DmX3 = fr_sub_f32(&D, &X3);
    var eightC = fr_add_f32(&C, &C);
    eightC = fr_add_f32(&eightC, &eightC);
    eightC = fr_add_f32(&eightC, &eightC);
    var Y3 = fr_mul_f32(&E, &DmX3);               //                     (M)
    Y3 = fr_sub_f32(&Y3, &eightC);

    // Z3 = 2 * Y * Z
    var YZ = fr_mul_f32(&Y, &Z);                  //                     (M)
    var Z3 = fr_add_f32(&YZ, &YZ);

    var result: PointF32;
    result.x = X3;
    result.y = Y3;
    result.z = Z3;
    return result;
}

// EFD: g1p/auto-shortw-jacobian-0/addition/add-2007-bl
// 11M + 5S + 9add + 4*2. NOT strongly unified — see u32 path notes.
fn add_points_f32(p1: PointF32, p2: PointF32) -> PointF32 {
    var Z1_chk = p1.z;
    var Z2_chk = p2.z;
    if (is_zero_f32(&Z1_chk)) { return p2; }
    if (is_zero_f32(&Z2_chk)) { return p1; }

    var X1 = p1.x; var Y1 = p1.y; var Z1 = p1.z;
    var X2 = p2.x; var Y2 = p2.y; var Z2 = p2.z;

    var Z1Z1 = fr_sqr_f32(&Z1);                   // Z1^2                (S)
    var Z2Z2 = fr_sqr_f32(&Z2);                   // Z2^2                (S)

    var U1 = fr_mul_f32(&X1, &Z2Z2);              // U1 = X1 * Z2Z2      (M)
    var U2 = fr_mul_f32(&X2, &Z1Z1);              // U2 = X2 * Z1Z1      (M)

    var Y1Z2 = fr_mul_f32(&Y1, &Z2);              //                     (M)
    var S1 = fr_mul_f32(&Y1Z2, &Z2Z2);            // S1 = Y1*Z2*Z2Z2     (M)
    var Y2Z1 = fr_mul_f32(&Y2, &Z1);              //                     (M)
    var S2 = fr_mul_f32(&Y2Z1, &Z1Z1);            // S2 = Y2*Z1*Z1Z1     (M)

    // Doubling fallback: p1 == p2 (same affine point).
    if (bigint_f32_eq(&U1, &U2) && bigint_f32_eq(&S1, &S2)) {
        return double_point_f32(p1);
    }

    var H = fr_sub_f32(&U2, &U1);
    var S2mS1 = fr_sub_f32(&S2, &S1);

    var twoH = fr_add_f32(&H, &H);
    var I = fr_sqr_f32(&twoH);                    // I = (2H)^2          (S)
    var J = fr_mul_f32(&H, &I);                   // J = H*I             (M)

    var r = fr_add_f32(&S2mS1, &S2mS1);           // r = 2*(S2-S1)
    var V = fr_mul_f32(&U1, &I);                  // V = U1*I            (M)

    // X3 = r^2 - J - 2V
    var r_sq = fr_sqr_f32(&r);                    //                     (S)
    var twoV = fr_add_f32(&V, &V);
    var X3 = fr_sub_f32(&r_sq, &J);
    X3 = fr_sub_f32(&X3, &twoV);

    // Y3 = r*(V - X3) - 2*S1*J
    var VmX3 = fr_sub_f32(&V, &X3);
    var rVX = fr_mul_f32(&r, &VmX3);              //                     (M)
    var S1J = fr_mul_f32(&S1, &J);                //                     (M)
    var twoS1J = fr_add_f32(&S1J, &S1J);
    var Y3 = fr_sub_f32(&rVX, &twoS1J);

    // Z3 = ((Z1+Z2)^2 - Z1Z1 - Z2Z2) * H
    var ZpZ = fr_add_f32(&Z1, &Z2);
    var ZpZ_sq = fr_sqr_f32(&ZpZ);                //                     (S)
    var zsum = fr_sub_f32(&ZpZ_sq, &Z1Z1);
    zsum = fr_sub_f32(&zsum, &Z2Z2);
    var Z3 = fr_mul_f32(&zsum, &H);               //                     (M)

    // Field assignment, not constructor return — mirrors the u32 path
    // workaround for the Dawn/Metal codegen quirk on Z3 writeback.
    var result: PointF32;
    result.x = X3;
    result.y = Y3;
    result.z = Z3;
    return result;
}

// Diagnostic sibling of add_points_f32 with the bigint_f32_eq collision
// fallback removed. Caller must guarantee p1 and p2 are NOT affinely
// equal; on collision the formula yields (0,0,0), interpreted as identity.
fn add_points_no_collision_f32(p1: PointF32, p2: PointF32) -> PointF32 {
    var Z1_chk = p1.z;
    var Z2_chk = p2.z;
    if (is_zero_f32(&Z1_chk)) { return p2; }
    if (is_zero_f32(&Z2_chk)) { return p1; }

    var X1 = p1.x; var Y1 = p1.y; var Z1 = p1.z;
    var X2 = p2.x; var Y2 = p2.y; var Z2 = p2.z;

    var Z1Z1 = fr_sqr_f32(&Z1);
    var Z2Z2 = fr_sqr_f32(&Z2);

    var U1 = fr_mul_f32(&X1, &Z2Z2);
    var U2 = fr_mul_f32(&X2, &Z1Z1);

    var Y1Z2 = fr_mul_f32(&Y1, &Z2);
    var S1 = fr_mul_f32(&Y1Z2, &Z2Z2);
    var Y2Z1 = fr_mul_f32(&Y2, &Z1);
    var S2 = fr_mul_f32(&Y2Z1, &Z1Z1);

    var H = fr_sub_f32(&U2, &U1);
    var S2mS1 = fr_sub_f32(&S2, &S1);

    var twoH = fr_add_f32(&H, &H);
    var I = fr_sqr_f32(&twoH);
    var J = fr_mul_f32(&H, &I);

    var r = fr_add_f32(&S2mS1, &S2mS1);
    var V = fr_mul_f32(&U1, &I);

    var r_sq = fr_sqr_f32(&r);
    var twoV = fr_add_f32(&V, &V);
    var X3 = fr_sub_f32(&r_sq, &J);
    X3 = fr_sub_f32(&X3, &twoV);

    var VmX3 = fr_sub_f32(&V, &X3);
    var rVX = fr_mul_f32(&r, &VmX3);
    var S1J = fr_mul_f32(&S1, &J);
    var twoS1J = fr_add_f32(&S1J, &S1J);
    var Y3 = fr_sub_f32(&rVX, &twoS1J);

    var ZpZ = fr_add_f32(&Z1, &Z2);
    var ZpZ_sq = fr_sqr_f32(&ZpZ);
    var zsum = fr_sub_f32(&ZpZ_sq, &Z1Z1);
    zsum = fr_sub_f32(&zsum, &Z2Z2);
    var Z3 = fr_mul_f32(&zsum, &H);

    var result: PointF32;
    result.x = X3;
    result.y = Y3;
    result.z = Z3;
    return result;
}

// EFD: g1p/auto-shortw-jacobian-0/addition/madd-2007-bl
// 7M + 4S + 9add + 1*4 + 3*2. Assumes Z2 == 1 (affine p2). p2.z is IGNORED.
fn add_points_mixed_f32(p1: PointF32, p2: PointF32) -> PointF32 {
    var Z1_chk = p1.z;
    if (is_zero_f32(&Z1_chk)) {
        // Local Mont-1 constant (R_f). Inlined per the u32 path to dodge
        // declaration-order requirements when ec_bn254_f32 is concatenated
        // ahead of an explicit get_r_f32() definition site. `r_limbs_f32`
        // template writes into a var named `r`; rename via assignment so
        // the outer `r` (= 2*(S2-Y1)) name isn't shadowed below.
        var r: BigIntF32;
{{{ r_limbs_f32 }}}
        let mont_one = r;
        var result: PointF32;
        result.x = p2.x;
        result.y = p2.y;
        result.z = mont_one;
        return result;
    }

    var X1 = p1.x; var Y1 = p1.y; var Z1 = p1.z;
    var X2 = p2.x; var Y2 = p2.y;

    var Z1Z1 = fr_sqr_f32(&Z1);                   // Z1^2                (S)
    var U2 = fr_mul_f32(&X2, &Z1Z1);              // U2 = X2*Z1Z1        (M)
    var Y2Z1 = fr_mul_f32(&Y2, &Z1);              //                     (M)
    var S2 = fr_mul_f32(&Y2Z1, &Z1Z1);            // S2 = Y2*Z1*Z1Z1     (M)

    // Doubling fallback: p1 == p2 affinely.
    if (bigint_f32_eq(&X1, &U2) && bigint_f32_eq(&Y1, &S2)) {
        return double_point_f32(p1);
    }

    var H = fr_sub_f32(&U2, &X1);                 // H = U2 - X1
    var HH = fr_sqr_f32(&H);                      // HH = H^2            (S)

    // I = 4*HH
    var I = fr_add_f32(&HH, &HH);
    I = fr_add_f32(&I, &I);

    var J = fr_mul_f32(&H, &I);                   // J = H*I             (M)

    var S2mY1 = fr_sub_f32(&S2, &Y1);
    var r = fr_add_f32(&S2mY1, &S2mY1);           // r = 2*(S2 - Y1)

    var V = fr_mul_f32(&X1, &I);                  // V = X1*I            (M)

    // X3 = r^2 - J - 2V
    var r_sq = fr_sqr_f32(&r);                    //                     (S)
    var twoV = fr_add_f32(&V, &V);
    var X3 = fr_sub_f32(&r_sq, &J);
    X3 = fr_sub_f32(&X3, &twoV);

    // Y3 = r*(V - X3) - 2*Y1*J
    var VmX3 = fr_sub_f32(&V, &X3);
    var rVX = fr_mul_f32(&r, &VmX3);              //                     (M)
    var Y1J = fr_mul_f32(&Y1, &J);                //                     (M)
    var twoY1J = fr_add_f32(&Y1J, &Y1J);
    var Y3 = fr_sub_f32(&rVX, &twoY1J);

    // Z3 = (Z1 + H)^2 - Z1Z1 - HH
    var ZpH = fr_add_f32(&Z1, &H);
    var ZpH_sq = fr_sqr_f32(&ZpH);                //                     (S)
    var Z3 = fr_sub_f32(&ZpH_sq, &Z1Z1);
    Z3 = fr_sub_f32(&Z3, &HH);

    var result: PointF32;
    result.x = X3;
    result.y = Y3;
    result.z = Z3;
    return result;
}

// SRS-only fast path: skips the affine-equality collision check.
// Caller must guarantee p1 and p2 are NOT affinely equal.
fn add_points_mixed_no_collision_f32(p1: PointF32, p2: PointF32) -> PointF32 {
    var Z1_chk = p1.z;
    if (is_zero_f32(&Z1_chk)) {
        var r: BigIntF32;
{{{ r_limbs_f32 }}}
        let mont_one = r;
        var result: PointF32;
        result.x = p2.x;
        result.y = p2.y;
        result.z = mont_one;
        return result;
    }

    var X1 = p1.x; var Y1 = p1.y; var Z1 = p1.z;
    var X2 = p2.x; var Y2 = p2.y;

    var Z1Z1 = fr_sqr_f32(&Z1);
    var U2 = fr_mul_f32(&X2, &Z1Z1);
    var Y2Z1 = fr_mul_f32(&Y2, &Z1);
    var S2 = fr_mul_f32(&Y2Z1, &Z1Z1);

    var H = fr_sub_f32(&U2, &X1);
    var HH = fr_sqr_f32(&H);

    var I = fr_add_f32(&HH, &HH);
    I = fr_add_f32(&I, &I);

    var J = fr_mul_f32(&H, &I);

    var S2mY1 = fr_sub_f32(&S2, &Y1);
    var r = fr_add_f32(&S2mY1, &S2mY1);

    var V = fr_mul_f32(&X1, &I);

    var r_sq = fr_sqr_f32(&r);
    var twoV = fr_add_f32(&V, &V);
    var X3 = fr_sub_f32(&r_sq, &J);
    X3 = fr_sub_f32(&X3, &twoV);

    var VmX3 = fr_sub_f32(&V, &X3);
    var rVX = fr_mul_f32(&r, &VmX3);
    var Y1J = fr_mul_f32(&Y1, &J);
    var twoY1J = fr_add_f32(&Y1J, &Y1J);
    var Y3 = fr_sub_f32(&rVX, &twoY1J);

    var ZpH = fr_add_f32(&Z1, &H);
    var ZpH_sq = fr_sqr_f32(&ZpH);
    var Z3 = fr_sub_f32(&ZpH_sq, &Z1Z1);
    Z3 = fr_sub_f32(&Z3, &HH);

    var result: PointF32;
    result.x = X3;
    result.y = Y3;
    result.z = Z3;
    return result;
}
