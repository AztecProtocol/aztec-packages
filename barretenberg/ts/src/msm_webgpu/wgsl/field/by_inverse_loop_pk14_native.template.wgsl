// ============================================================================
// PACKED 14-bit Bernstein-Yang safegcd field inverse (fr_inv_by_loop_pk).
//
// Hand-written raw WGSL, fully unrolled, in-place (pointer) apply_matrix.
// Inverts mod the BN254 BASE field q. The value is ten 28-bit limbs (radix 2^28)
// held in an array<u32, 10>; word 9 is the 14-bit SIGNED top limb (sign = bit 13),
// a 266-bit two's complement working space. BATCH = 28 divsteps/batch, 27 outer
// batches (unrolled by 4).
//
// apply_matrix splits the transition matrix into 14-bit halves and writes its
// result back in place: the >>28 drop makes the output word lag the input read by
// one word, so an in-place write never clobbers an unread input. add / sub / neg /
// normalise / reduce / pack work directly on the 28-bit limbs.
//
// 8xu32 in/out. Final x R^3 via native f8 CIOS (montgomery_product_f8), no BigInt
// round-trip. Baked (BN254 base field q): q^-1 mod 2^28, q and 2q/4q/8q as ten
// 28-bit limbs, and R^3 mod q as 8x u32. External: montgomery_product_f8.
//
// NOTE: never write Mustache double-brace tags in comments.
// ============================================================================

const BYL_BATCH: u32 = 28u;          // 2 * 14
const BYL_NUM_OUTER: u32 = 27u;      // ceil(735 / 28)
const BYL_REDUCE_INTERVAL: u32 = 4u;
const BYL_RTC_MAX_ITERS: u32 = 4u;
const BYL_MASK_BATCH: u32 = (1u << 28u) - 1u;
const BYL_P_INV_LO: u32 = 192519287u;   // q^-1 mod 2^28
const BYL_P_INV_LOi: i32 = 192519287;   // q^-1 mod 2^28

const M14: u32 = 0x3fffu;               // (1 << 14) - 1
struct BylMat { u: i32, v: i32, q: i32, r: i32, }

// BATCH divsteps on a 32-bit window (only g's bottom bit + delta's sign decide
// each step; logical >>1's top-bit corruption needs ~31 steps to reach bit 0).
fn byl_divsteps(delta: ptr<function, i32>, f_lo_in: u32, g_lo_in: u32) -> vec4i {
    var f_lo: u32 = f_lo_in;
    var g_lo: u32 = g_lo_in;
    var d: i32 = *delta;
    var res: vec4i = vec4i(1, 0, 0, 1);
    for (var i: u32 = 0u; i < BYL_BATCH; i = i + 1u) {
        let g_odd: bool = bool(g_lo & 1u);
        let g_odd_mask: i32 = i32(!g_odd) - 1;
        let d_gt: bool = (d > 0);
        let swap: bool = g_odd && d_gt;

        let new_u = select(res[0], res[2], swap) << 1u;
        let new_v = select(res[1], res[3], swap) << 1u;
        d = select(d, -d, swap) + 1;
        res[3] += (select(res[1], -res[1], d_gt) & g_odd_mask);
        res[2] += (select(res[0], -res[0], d_gt) & g_odd_mask);
        res[0] = new_u;
        res[1] = new_v;
        let new_f = select(f_lo, g_lo, swap);
       // let g_pre = g_lo + ;
        g_lo += (select(f_lo, 0u - f_lo, d_gt) & u32(g_odd_mask));
        g_lo >>= 1u;
        f_lo = new_f;

        // let addc: bool = g_odd && !d_gt;
        // let g_pre: u32 = select(select(g_lo, g_lo + f_lo, addc), g_lo - f_lo, swap);
        // let new_f: u32 = select(f_lo, g_lo, swap);
        // let new_g: u32 = g_pre >> 1u;
        // let new_u: i32 = select(u << 1u, q << 1u, swap);
        // let new_v: i32 = select(v << 1u, r << 1u, swap);
        // let new_q: i32 = select(select(q, q + u, addc), q - u, swap);
        // let new_r: i32 = select(select(r, r + v, addc), r - v, swap);
        // let new_d: i32 = select(d + 1, 1 - d, swap);
        // f_lo = new_f; g_lo = new_g;
        // u = new_u; v = new_v; q = new_q; r = new_r; d = new_d;
    }
    *delta = d;
    return res;
}


fn sx14(v: i32) -> i32 { return (v << 18u) >> 18u; }   // sign-extend 14-bit

// q and its small multiples as ten 28-bit limbs (word 9 = the 14-bit top limb).
fn pk_q()  -> array<u32, 10> { return array<u32, 10>(142409031u, 34128237u, 30051644u, 111744647u, 140351361u, 191371285u, 163074117u, 236132866u, 6573682u, 3u); }

// Low 32 bits: limb0 (0-13), limb1 (14-27), limb2 low 4 bits (28-31).
fn pk_low_u32(x: array<u32, 10>) -> u32 { return x[0] | ((x[1] & 0xfu) << 28u); }

fn pk_is_zero(x: array<u32, 10>) -> bool {
    let a = x[0] | x[1] | x[2] | x[3] | x[4] | x[5] | x[6] | x[7] | x[8] | x[9];
    return a == 0u;
}
// Sign bit = bit 13 of limb 18 = bit 13 of word 9.
fn pk_is_neg_2c(x: array<u32, 10>) -> bool { return ((x[9] >> 13u) & 1u) == 1u; }

// a + b over the ten 28-bit limbs (word 9 the 14-bit top), two's complement.
fn pk_neg_inplace(x: ptr<function, array<u32, 10>>) {
    var c: i32 = 0;
    { let v = -i32((*x)[0]) + c; (*x)[0] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = -i32((*x)[1]) + c; (*x)[1] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = -i32((*x)[2]) + c; (*x)[2] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = -i32((*x)[3]) + c; (*x)[3] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = -i32((*x)[4]) + c; (*x)[4] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = -i32((*x)[5]) + c; (*x)[5] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = -i32((*x)[6]) + c; (*x)[6] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = -i32((*x)[7]) + c; (*x)[7] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = -i32((*x)[8]) + c; (*x)[8] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = -i32((*x)[9]) + c; (*x)[9] = u32(v) & 0x3fffu; }
}

// a >= b, unsigned, most-significant limb first. Caller ensures a is non-negative.

// Reduce the signed limb value to canonical [0, q). At the reduce points the
// value lies in about (-4q, 5q): add 8q if negative to land in [0, 8q), then a
// 3-level binary search subtracts 4q / 2q / q down to [0, q).

// In-place pointer reduce, modulus multiples baked inline (no array<u32,10>
// parameter, no aggregate constant). *x is mutated through the pointer.
fn pk_add_8q_inplace(x: ptr<function, array<u32, 10>>) {
    var c: i32 = 0;
    { let v = i32((*x)[0]) + 65530424 + c; (*x)[0] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[1]) + 4590444 + c; (*x)[1] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[2]) + 240413153 + c; (*x)[2] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[3]) + 88650808 + c; (*x)[3] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[4]) + 49069067 + c; (*x)[4] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[5]) + 188793004 + c; (*x)[5] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[6]) + 230851117 + c; (*x)[6] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[7]) + 10014740 + c; (*x)[7] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[8]) + 52589463 + c; (*x)[8] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[9]) + 24 + c; (*x)[9] = u32(v) & 0x3fffu; }
}
fn pk_sub_4q_inplace(x: ptr<function, array<u32, 10>>) {
    var c: i32 = 0;
    { let v = i32((*x)[0]) - 32765212 + c; (*x)[0] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[1]) - 136512950 + c; (*x)[1] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[2]) - 120206576 + c; (*x)[2] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[3]) - 178543132 + c; (*x)[3] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[4]) - 24534533 + c; (*x)[4] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[5]) - 228614230 + c; (*x)[5] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[6]) - 115425558 + c; (*x)[6] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[7]) - 139225098 + c; (*x)[7] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[8]) - 26294731 + c; (*x)[8] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[9]) - 12 + c; (*x)[9] = u32(v) & 0x3fffu; }
}
fn pk_sub_2q_inplace(x: ptr<function, array<u32, 10>>) {
    var c: i32 = 0;
    { let v = i32((*x)[0]) - 16382606 + c; (*x)[0] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[1]) - 68256475 + c; (*x)[1] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[2]) - 60103288 + c; (*x)[2] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[3]) - 223489294 + c; (*x)[3] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[4]) - 12267266 + c; (*x)[4] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[5]) - 114307115 + c; (*x)[5] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[6]) - 57712779 + c; (*x)[6] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[7]) - 203830277 + c; (*x)[7] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[8]) - 13147365 + c; (*x)[8] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[9]) - 6 + c; (*x)[9] = u32(v) & 0x3fffu; }
}
fn pk_sub_q_inplace(x: ptr<function, array<u32, 10>>) {
    var c: i32 = 0;
    { let v = i32((*x)[0]) - 142409031 + c; (*x)[0] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[1]) - 34128237 + c; (*x)[1] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[2]) - 30051644 + c; (*x)[2] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[3]) - 111744647 + c; (*x)[3] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[4]) - 140351361 + c; (*x)[4] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[5]) - 191371285 + c; (*x)[5] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[6]) - 163074117 + c; (*x)[6] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[7]) - 236132866 + c; (*x)[7] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[8]) - 6573682 + c; (*x)[8] = u32(v) & 0x0fffffffu; c = v >> 28u; }
    { let v = i32((*x)[9]) - 3 + c; (*x)[9] = u32(v) & 0x3fffu; }
}
fn pk_cmp_ge_4q_p(x: ptr<function, array<u32, 10>>) -> bool {
    if ((*x)[9] != 12u) { return (*x)[9] > 12u; }
    if ((*x)[8] != 26294731u) { return (*x)[8] > 26294731u; }
    if ((*x)[7] != 139225098u) { return (*x)[7] > 139225098u; }
    if ((*x)[6] != 115425558u) { return (*x)[6] > 115425558u; }
    if ((*x)[5] != 228614230u) { return (*x)[5] > 228614230u; }
    if ((*x)[4] != 24534533u) { return (*x)[4] > 24534533u; }
    if ((*x)[3] != 178543132u) { return (*x)[3] > 178543132u; }
    if ((*x)[2] != 120206576u) { return (*x)[2] > 120206576u; }
    if ((*x)[1] != 136512950u) { return (*x)[1] > 136512950u; }
    if ((*x)[0] != 32765212u) { return (*x)[0] > 32765212u; }
    return true;
}
fn pk_cmp_ge_2q_p(x: ptr<function, array<u32, 10>>) -> bool {
    if ((*x)[9] != 6u) { return (*x)[9] > 6u; }
    if ((*x)[8] != 13147365u) { return (*x)[8] > 13147365u; }
    if ((*x)[7] != 203830277u) { return (*x)[7] > 203830277u; }
    if ((*x)[6] != 57712779u) { return (*x)[6] > 57712779u; }
    if ((*x)[5] != 114307115u) { return (*x)[5] > 114307115u; }
    if ((*x)[4] != 12267266u) { return (*x)[4] > 12267266u; }
    if ((*x)[3] != 223489294u) { return (*x)[3] > 223489294u; }
    if ((*x)[2] != 60103288u) { return (*x)[2] > 60103288u; }
    if ((*x)[1] != 68256475u) { return (*x)[1] > 68256475u; }
    if ((*x)[0] != 16382606u) { return (*x)[0] > 16382606u; }
    return true;
}
fn pk_cmp_ge_q_p(x: ptr<function, array<u32, 10>>) -> bool {
    if ((*x)[9] != 3u) { return (*x)[9] > 3u; }
    if ((*x)[8] != 6573682u) { return (*x)[8] > 6573682u; }
    if ((*x)[7] != 236132866u) { return (*x)[7] > 236132866u; }
    if ((*x)[6] != 163074117u) { return (*x)[6] > 163074117u; }
    if ((*x)[5] != 191371285u) { return (*x)[5] > 191371285u; }
    if ((*x)[4] != 140351361u) { return (*x)[4] > 140351361u; }
    if ((*x)[3] != 111744647u) { return (*x)[3] > 111744647u; }
    if ((*x)[2] != 30051644u) { return (*x)[2] > 30051644u; }
    if ((*x)[1] != 34128237u) { return (*x)[1] > 34128237u; }
    if ((*x)[0] != 142409031u) { return (*x)[0] > 142409031u; }
    return true;
}
fn pk_is_neg_2c_p(x: ptr<function, array<u32, 10>>) -> bool { return (((*x)[9] >> 13u) & 1u) == 1u; }
fn pk_reduce_to_canonical_inplace(x: ptr<function, array<u32, 10>>) {
    if (pk_is_neg_2c_p(x)) { pk_add_8q_inplace(x); }
    if (pk_cmp_ge_4q_p(x)) { pk_sub_4q_inplace(x); }
    if (pk_cmp_ge_2q_p(x)) { pk_sub_2q_inplace(x); }
    if (pk_cmp_ge_q_p(x))  { pk_sub_q_inplace(x); }
}

// (f,g) <- ((u*f + v*g) >> 28, (q*f + r*g) >> 28), in place. Matrix split into two
// 14-bit halves aligned to the limb boundary; >>28 drops the low word. Input limb
// i -> output limb i-2 (output word lags input read by one word -> in-place safe).
fn pk_apply_matrix_fg(m: vec4i, f: ptr<function, array<u32, 10>>, g: ptr<function, array<u32, 10>>) {
    let u_lo: i32 = m[0] & 0x3fff; let u_hi: i32 = m[0] >> 14u;
    let v_lo: i32 = m[1] & 0x3fff; let v_hi: i32 = m[1] >> 14u;
    let q_lo: i32 = m[2] & 0x3fff; let q_hi: i32 = m[2] >> 14u;
    let r_lo: i32 = m[3] & 0x3fff; let r_hi: i32 = m[3] >> 14u;
    var cf: i32 = 0; var cg: i32 = 0; var fp: i32 = 0; var gp: i32 = 0;

    var active_f: i32 = i32((*f)[0u]);
    var active_g: i32 = i32((*g)[0u]);
    var flo = active_f & 0x3fff;
    var fhi = active_f >> 14u;
    var glo = active_g & 0x3fff;
    var ghi = active_g >> 14u;
    {
        let nf = u_lo*(flo) + v_lo*(glo) + u_hi*fp + v_hi*gp + cf;
        cf = nf >> 14u;
        let ng = q_lo*(flo) + r_lo*(glo) + q_hi*fp + r_hi*gp + cg; 
        cg = ng >> 14u;
    }
    { 
        let nf = u_lo*fhi + v_lo*ghi + u_hi*flo + v_hi*glo + cf; 
        cf = nf >> 14u; 
        let ng = q_lo*fhi + r_lo*ghi + q_hi*flo + r_hi*glo + cg; 
        cg = ng >> 14u; 
    }
    { 
        active_f = i32((*f)[1u]);
        active_g = i32((*g)[1u]);
        flo = active_f & 0x3fff;
        glo = active_g & 0x3fff;
        let nf = u_lo*flo + v_lo*glo + u_hi*fhi + v_hi*ghi + cf; 
        cf = nf >> 14u; 
        let ng = q_lo*flo + r_lo*glo + q_hi*fhi + r_hi*ghi + cg; 
        cg = ng >> 14u; 
        (*f)[0u] = u32(nf) & 0x3fffu;
        (*g)[0u] = u32(ng) & 0x3fffu;
    }
    { 
        fhi = active_f >> 14u;
        ghi = active_g >> 14u;
        let nf = u_lo*fhi + v_lo*ghi + u_hi*flo + v_hi*glo + cf;
        cf = nf >> 14u; 
         let ng = q_lo*fhi + r_lo*ghi + q_hi*flo + r_hi*glo + cg; 
         cg = ng >> 14u; 

        (*f)[0u] |= ((u32(nf) & 0x3fffu) << 14u);
        (*g)[0u] |= ((u32(ng) & 0x3fffu) << 14u);
         fp = fhi; 
         gp = ghi; 
     }
    // word 2 (limbs 4,5) -> output word 1
    { active_f = i32((*f)[2u]); active_g = i32((*g)[2u]); flo = active_f & 0x3fff; glo = active_g & 0x3fff;
      let nf = u_lo*flo + v_lo*glo + u_hi*fhi + v_hi*ghi + cf; cf = nf >> 14u; let ng = q_lo*flo + r_lo*glo + q_hi*fhi + r_hi*ghi + cg; cg = ng >> 14u;
      (*f)[1u] = u32(nf) & 0x3fffu; (*g)[1u] = u32(ng) & 0x3fffu; }
    { fhi = active_f >> 14u; ghi = active_g >> 14u;
      let nf = u_lo*fhi + v_lo*ghi + u_hi*flo + v_hi*glo + cf; cf = nf >> 14u; let ng = q_lo*fhi + r_lo*ghi + q_hi*flo + r_hi*glo + cg; cg = ng >> 14u;
      (*f)[1u] |= ((u32(nf) & 0x3fffu) << 14u); (*g)[1u] |= ((u32(ng) & 0x3fffu) << 14u); }
    // word 3 (limbs 6,7) -> output word 2
    { active_f = i32((*f)[3u]); active_g = i32((*g)[3u]); flo = active_f & 0x3fff; glo = active_g & 0x3fff;
      let nf = u_lo*flo + v_lo*glo + u_hi*fhi + v_hi*ghi + cf; cf = nf >> 14u; let ng = q_lo*flo + r_lo*glo + q_hi*fhi + r_hi*ghi + cg; cg = ng >> 14u;
      (*f)[2u] = u32(nf) & 0x3fffu; (*g)[2u] = u32(ng) & 0x3fffu; }
    { fhi = active_f >> 14u; ghi = active_g >> 14u;
      let nf = u_lo*fhi + v_lo*ghi + u_hi*flo + v_hi*glo + cf; cf = nf >> 14u; let ng = q_lo*fhi + r_lo*ghi + q_hi*flo + r_hi*glo + cg; cg = ng >> 14u;
      (*f)[2u] |= ((u32(nf) & 0x3fffu) << 14u); (*g)[2u] |= ((u32(ng) & 0x3fffu) << 14u); }
    // word 4 (limbs 8,9) -> output word 3
    { active_f = i32((*f)[4u]); active_g = i32((*g)[4u]); flo = active_f & 0x3fff; glo = active_g & 0x3fff;
      let nf = u_lo*flo + v_lo*glo + u_hi*fhi + v_hi*ghi + cf; cf = nf >> 14u; let ng = q_lo*flo + r_lo*glo + q_hi*fhi + r_hi*ghi + cg; cg = ng >> 14u;
      (*f)[3u] = u32(nf) & 0x3fffu; (*g)[3u] = u32(ng) & 0x3fffu; }
    { fhi = active_f >> 14u; ghi = active_g >> 14u;
      let nf = u_lo*fhi + v_lo*ghi + u_hi*flo + v_hi*glo + cf; cf = nf >> 14u; let ng = q_lo*fhi + r_lo*ghi + q_hi*flo + r_hi*glo + cg; cg = ng >> 14u;
      (*f)[3u] |= ((u32(nf) & 0x3fffu) << 14u); (*g)[3u] |= ((u32(ng) & 0x3fffu) << 14u); }
    // word 5 (limbs 10,11) -> output word 4
    { active_f = i32((*f)[5u]); active_g = i32((*g)[5u]); flo = active_f & 0x3fff; glo = active_g & 0x3fff;
      let nf = u_lo*flo + v_lo*glo + u_hi*fhi + v_hi*ghi + cf; cf = nf >> 14u; let ng = q_lo*flo + r_lo*glo + q_hi*fhi + r_hi*ghi + cg; cg = ng >> 14u;
      (*f)[4u] = u32(nf) & 0x3fffu; (*g)[4u] = u32(ng) & 0x3fffu; }
    { fhi = active_f >> 14u; ghi = active_g >> 14u;
      let nf = u_lo*fhi + v_lo*ghi + u_hi*flo + v_hi*glo + cf; cf = nf >> 14u; let ng = q_lo*fhi + r_lo*ghi + q_hi*flo + r_hi*glo + cg; cg = ng >> 14u;
      (*f)[4u] |= ((u32(nf) & 0x3fffu) << 14u); (*g)[4u] |= ((u32(ng) & 0x3fffu) << 14u); }
    // word 6 (limbs 12,13) -> output word 5
    { active_f = i32((*f)[6u]); active_g = i32((*g)[6u]); flo = active_f & 0x3fff; glo = active_g & 0x3fff;
      let nf = u_lo*flo + v_lo*glo + u_hi*fhi + v_hi*ghi + cf; cf = nf >> 14u; let ng = q_lo*flo + r_lo*glo + q_hi*fhi + r_hi*ghi + cg; cg = ng >> 14u;
      (*f)[5u] = u32(nf) & 0x3fffu; (*g)[5u] = u32(ng) & 0x3fffu; }
    { fhi = active_f >> 14u; ghi = active_g >> 14u;
      let nf = u_lo*fhi + v_lo*ghi + u_hi*flo + v_hi*glo + cf; cf = nf >> 14u; let ng = q_lo*fhi + r_lo*ghi + q_hi*flo + r_hi*glo + cg; cg = ng >> 14u;
      (*f)[5u] |= ((u32(nf) & 0x3fffu) << 14u); (*g)[5u] |= ((u32(ng) & 0x3fffu) << 14u); }
    // word 7 (limbs 14,15) -> output word 6
    { active_f = i32((*f)[7u]); active_g = i32((*g)[7u]); flo = active_f & 0x3fff; glo = active_g & 0x3fff;
      let nf = u_lo*flo + v_lo*glo + u_hi*fhi + v_hi*ghi + cf; cf = nf >> 14u; let ng = q_lo*flo + r_lo*glo + q_hi*fhi + r_hi*ghi + cg; cg = ng >> 14u;
      (*f)[6u] = u32(nf) & 0x3fffu; (*g)[6u] = u32(ng) & 0x3fffu; }
    { fhi = active_f >> 14u; ghi = active_g >> 14u;
      let nf = u_lo*fhi + v_lo*ghi + u_hi*flo + v_hi*glo + cf; cf = nf >> 14u; let ng = q_lo*fhi + r_lo*ghi + q_hi*flo + r_hi*glo + cg; cg = ng >> 14u;
      (*f)[6u] |= ((u32(nf) & 0x3fffu) << 14u); (*g)[6u] |= ((u32(ng) & 0x3fffu) << 14u); }
    // word 8 (limbs 16,17) -> output word 7
    { active_f = i32((*f)[8u]); active_g = i32((*g)[8u]); flo = active_f & 0x3fff; glo = active_g & 0x3fff;
      let nf = u_lo*flo + v_lo*glo + u_hi*fhi + v_hi*ghi + cf; cf = nf >> 14u; let ng = q_lo*flo + r_lo*glo + q_hi*fhi + r_hi*ghi + cg; cg = ng >> 14u;
      (*f)[7u] = u32(nf) & 0x3fffu; (*g)[7u] = u32(ng) & 0x3fffu; }
    { fhi = active_f >> 14u; ghi = active_g >> 14u;
      let nf = u_lo*fhi + v_lo*ghi + u_hi*flo + v_hi*glo + cf; cf = nf >> 14u; let ng = q_lo*fhi + r_lo*ghi + q_hi*flo + r_hi*glo + cg; cg = ng >> 14u;
      (*f)[7u] |= ((u32(nf) & 0x3fffu) << 14u); (*g)[7u] |= ((u32(ng) & 0x3fffu) << 14u); }
    // word 9 (limb 18, sign-extended) -> output word 8 low; tail -> word 8 high + word 9
    { active_f = i32((*f)[9u]); active_g = i32((*g)[9u]); flo = sx14(active_f & 0x3fff); glo = sx14(active_g & 0x3fff);
      let nf = u_lo*flo + v_lo*glo + u_hi*fhi + v_hi*ghi + cf; cf = nf >> 14u; let ng = q_lo*flo + r_lo*glo + q_hi*fhi + r_hi*ghi + cg; cg = ng >> 14u;
      (*f)[8u] = u32(nf) & 0x3fffu; (*g)[8u] = u32(ng) & 0x3fffu; }
    { let nft = u_hi*flo + v_hi*glo + cf; let ngt = q_hi*flo + r_hi*glo + cg;
      (*f)[8u] |= ((u32(nft) & 0x3fffu) << 14u); (*g)[8u] |= ((u32(ngt) & 0x3fffu) << 14u);
      (*f)[9u] = u32(nft >> 14u) & 0x3fffu; (*g)[9u] = u32(ngt >> 14u) & 0x3fffu; }
}

// u v q r
// (d,e) <- ((u*d+v*e+k_d*q) >> 28, (q*d+r*e+k_e*q) >> 28), in place. k*q cancels the
// low 28 bits (limbs 0,1); the >>28 starts at the carry into limb 2.
fn pk_apply_matrix_de(m: vec4i, d: ptr<function, array<u32, 10>>, e: ptr<function, array<u32, 10>>) {
    let u_lo: i32 = m[0] & 0x3fff; let u_hi: i32 = m[0] >> 14u;
    let v_lo: i32 = m[1] & 0x3fff; let v_hi: i32 = m[1] >> 14u;
    let q_lo: i32 = m[2] & 0x3fff; let q_hi: i32 = m[2] >> 14u;
    let r_lo: i32 = m[3] & 0x3fff; let r_hi: i32 = m[3] >> 14u;

    var active_d: i32 = i32((*d)[0]);
    var active_e: i32 = i32((*e)[0]);
    var dlo = active_d & 0x3fff;
    var dhi = active_d >> 14u;
    var elo = active_e & 0x3fff;
    var ehi = active_e >> 14u;

    var cd: i32 = 0; var ce: i32 = 0; 
    var kd_lo: i32; var kd_hi: i32; var ke_lo: i32; var ke_hi: i32;
    {
        let nd: i32 = u_lo * dlo + v_lo * elo;
        let ne: i32 = q_lo * dlo + r_lo * elo;
        let nd1: i32 = u_lo * dhi + v_lo * ehi + u_hi * dlo + v_hi * elo;
        let ne1: i32 = q_lo * dhi + r_lo * ehi + q_hi * dlo + r_hi * elo;
        var k_temp: i32 = (nd & 0x3fff); 
        k_temp |= (((nd1 + (nd >> 14u)) & 0x3fff) << 14u);
        k_temp &= 0xfffffff;
        k_temp = ((-k_temp & 0xfffffff) * BYL_P_INV_LOi) & 0xfffffff;
        kd_lo = (k_temp & 0x3fff); 
        kd_hi = (k_temp >> 14u);
        cd = (nd1 + kd_lo * 8691i + kd_hi * 15687i + ((nd + kd_lo * 15687i) >> 14u)) >> 14u;

        k_temp = (ne & 0x3fff);
        k_temp |= (((ne1 + (ne >> 14u)) & 0x3fff) << 14u);
        k_temp &= 0xfffffff;
        k_temp = (((-k_temp) & 0xfffffff) * BYL_P_INV_LOi) & 0xfffffff;
        ke_lo = (k_temp & 0x3fff); 
        ke_hi = (k_temp >> 14u);
        ce  = (ne1 + ke_lo * 8691i + ke_hi * 15687i + ((ne + ke_lo * 15687i) >> 14u)) >> 14u;
    }
     


    var nd: i32; var ne: i32;
    // word 1 (limbs 2,3) -> output word 0
    { 
        active_d = i32((*d)[1u]); 
        active_e = i32((*e)[1u]); 
        dlo = active_d & 0x3fff; 
        elo = active_e & 0x3fff;
       nd = u_lo*dlo + v_lo*elo + u_hi*dhi + v_hi*ehi + kd_lo*365i + kd_hi*8691i + cd;
       cd = nd >> 14u; 
      (*d)[0u] = u32(nd) & 0x3fffu; 
       nd = q_lo*dlo + r_lo*elo + q_hi*dhi + r_hi*ehi + ke_lo*365i + ke_hi*8691i + ce; 
       ce = nd >> 14u;
      (*e)[0u] = u32(nd) & 0x3fffu;
     }
    { 
        dhi = active_d >> 14u; 
        ehi = active_e >> 14u;
      nd = u_lo*dhi + v_lo*ehi + u_hi*dlo + v_hi*elo + kd_lo*2083i + kd_hi*365i + cd; 
      cd = nd >> 14u; ne = q_lo*dhi + r_lo*ehi + q_hi*dlo + r_hi*elo + ke_lo*2083i + ke_hi*365i + ce; ce = ne >> 14u;
      (*d)[0u] |= ((u32(nd) & 0x3fffu) << 14u); (*e)[0u] |= ((u32(ne) & 0x3fffu) << 14u); }
    // word 2 (limbs 4,5) -> output word 1
    { active_d = i32((*d)[2u]); active_e = i32((*e)[2u]); dlo = active_d & 0x3fff; elo = active_e & 0x3fff;
      nd = u_lo*dlo + v_lo*elo + u_hi*dhi + v_hi*ehi + kd_lo*3388i + kd_hi*2083i + cd; cd = nd >> 14u; ne = q_lo*dlo + r_lo*elo + q_hi*dhi + r_hi*ehi + ke_lo*3388i + ke_hi*2083i + ce; ce = ne >> 14u;
      (*d)[1u] = u32(nd) & 0x3fffu; (*e)[1u] = u32(ne) & 0x3fffu; }
    { dhi = active_d >> 14u; ehi = active_e >> 14u;
      nd = u_lo*dhi + v_lo*ehi + u_hi*dlo + v_hi*elo + kd_lo*1834i + kd_hi*3388i + cd; cd = nd >> 14u; ne = q_lo*dhi + r_lo*ehi + q_hi*dlo + r_hi*elo + ke_lo*1834i + ke_hi*3388i + ce; ce = ne >> 14u;
      (*d)[1u] |= ((u32(nd) & 0x3fffu) << 14u); (*e)[1u] |= ((u32(ne) & 0x3fffu) << 14u); }
    // word 3 (limbs 6,7) -> output word 2
    { active_d = i32((*d)[3u]); active_e = i32((*e)[3u]); dlo = active_d & 0x3fff; elo = active_e & 0x3fff;
      nd = u_lo*dlo + v_lo*elo + u_hi*dhi + v_hi*ehi + kd_lo*5767i + kd_hi*1834i + cd; cd = nd >> 14u; ne = q_lo*dlo + r_lo*elo + q_hi*dhi + r_hi*ehi + ke_lo*5767i + ke_hi*1834i + ce; ce = ne >> 14u;
      (*d)[2u] = u32(nd) & 0x3fffu; (*e)[2u] = u32(ne) & 0x3fffu; }
    { dhi = active_d >> 14u; ehi = active_e >> 14u;
      nd = u_lo*dhi + v_lo*ehi + u_hi*dlo + v_hi*elo + kd_lo*6820i + kd_hi*5767i + cd; cd = nd >> 14u; ne = q_lo*dhi + r_lo*ehi + q_hi*dlo + r_hi*elo + ke_lo*6820i + ke_hi*5767i + ce; ce = ne >> 14u;
      (*d)[2u] |= ((u32(nd) & 0x3fffu) << 14u); (*e)[2u] |= ((u32(ne) & 0x3fffu) << 14u); }
    // word 4 (limbs 8,9) -> output word 3
    { active_d = i32((*d)[4u]); active_e = i32((*e)[4u]); dlo = active_d & 0x3fff; elo = active_e & 0x3fff;
      nd = u_lo*dlo + v_lo*elo + u_hi*dhi + v_hi*ehi + kd_lo*6017i + kd_hi*6820i + cd; cd = nd >> 14u; ne = q_lo*dlo + r_lo*elo + q_hi*dhi + r_hi*ehi + ke_lo*6017i + ke_hi*6820i + ce; ce = ne >> 14u;
      (*d)[3u] = u32(nd) & 0x3fffu; (*e)[3u] = u32(ne) & 0x3fffu; }
    { dhi = active_d >> 14u; ehi = active_e >> 14u;
      nd = u_lo*dhi + v_lo*ehi + u_hi*dlo + v_hi*elo + kd_lo*8566i + kd_hi*6017i + cd; cd = nd >> 14u; ne = q_lo*dhi + r_lo*ehi + q_hi*dlo + r_hi*elo + ke_lo*8566i + ke_hi*6017i + ce; ce = ne >> 14u;
      (*d)[3u] |= ((u32(nd) & 0x3fffu) << 14u); (*e)[3u] |= ((u32(ne) & 0x3fffu) << 14u); }
    // word 5 (limbs 10,11) -> output word 4
    { active_d = i32((*d)[5u]); active_e = i32((*e)[5u]); dlo = active_d & 0x3fff; elo = active_e & 0x3fff;
      nd = u_lo*dlo + v_lo*elo + u_hi*dhi + v_hi*ehi + kd_lo*6165i + kd_hi*8566i + cd; cd = nd >> 14u; ne = q_lo*dlo + r_lo*elo + q_hi*dhi + r_hi*ehi + ke_lo*6165i + ke_hi*8566i + ce; ce = ne >> 14u;
      (*d)[4u] = u32(nd) & 0x3fffu; (*e)[4u] = u32(ne) & 0x3fffu; }
    { dhi = active_d >> 14u; ehi = active_e >> 14u;
      nd = u_lo*dhi + v_lo*ehi + u_hi*dlo + v_hi*elo + kd_lo*11680i + kd_hi*6165i + cd; cd = nd >> 14u; ne = q_lo*dhi + r_lo*ehi + q_hi*dlo + r_hi*elo + ke_lo*11680i + ke_hi*6165i + ce; ce = ne >> 14u;
      (*d)[4u] |= ((u32(nd) & 0x3fffu) << 14u); (*e)[4u] |= ((u32(ne) & 0x3fffu) << 14u); }
    // word 6 (limbs 12,13) -> output word 5
    { active_d = i32((*d)[6u]); active_e = i32((*e)[6u]); dlo = active_d & 0x3fff; elo = active_e & 0x3fff;
      nd = u_lo*dlo + v_lo*elo + u_hi*dhi + v_hi*ehi + kd_lo*4165i + kd_hi*11680i + cd; cd = nd >> 14u; ne = q_lo*dlo + r_lo*elo + q_hi*dhi + r_hi*ehi + ke_lo*4165i + ke_hi*11680i + ce; ce = ne >> 14u;
      (*d)[5u] = u32(nd) & 0x3fffu; (*e)[5u] = u32(ne) & 0x3fffu; }
    { dhi = active_d >> 14u; ehi = active_e >> 14u;
      nd = u_lo*dhi + v_lo*ehi + u_hi*dlo + v_hi*elo + kd_lo*9953i + kd_hi*4165i + cd; cd = nd >> 14u; ne = q_lo*dhi + r_lo*ehi + q_hi*dlo + r_hi*elo + ke_lo*9953i + ke_hi*4165i + ce; ce = ne >> 14u;
      (*d)[5u] |= ((u32(nd) & 0x3fffu) << 14u); (*e)[5u] |= ((u32(ne) & 0x3fffu) << 14u); }
    // word 7 (limbs 14,15) -> output word 6
    { active_d = i32((*d)[7u]); active_e = i32((*e)[7u]); dlo = active_d & 0x3fff; elo = active_e & 0x3fff;
      nd = u_lo*dlo + v_lo*elo + u_hi*dhi + v_hi*ehi + kd_lo*6658i + kd_hi*9953i + cd; cd = nd >> 14u; ne = q_lo*dlo + r_lo*elo + q_hi*dhi + r_hi*ehi + ke_lo*6658i + ke_hi*9953i + ce; ce = ne >> 14u;
      (*d)[6u] = u32(nd) & 0x3fffu; (*e)[6u] = u32(ne) & 0x3fffu; }
    { dhi = active_d >> 14u; ehi = active_e >> 14u;
      nd = u_lo*dhi + v_lo*ehi + u_hi*dlo + v_hi*elo + kd_lo*14412i + kd_hi*6658i + cd; cd = nd >> 14u; ne = q_lo*dhi + r_lo*ehi + q_hi*dlo + r_hi*elo + ke_lo*14412i + ke_hi*6658i + ce; ce = ne >> 14u;
      (*d)[6u] |= ((u32(nd) & 0x3fffu) << 14u); (*e)[6u] |= ((u32(ne) & 0x3fffu) << 14u); }
    // word 8 (limbs 16,17) -> output word 7
    { active_d = i32((*d)[8u]); active_e = i32((*e)[8u]); dlo = active_d & 0x3fff; elo = active_e & 0x3fff;
      nd = u_lo*dlo + v_lo*elo + u_hi*dhi + v_hi*ehi + kd_lo*3698i + kd_hi*14412i + cd; cd = nd >> 14u; ne = q_lo*dlo + r_lo*elo + q_hi*dhi + r_hi*ehi + ke_lo*3698i + ke_hi*14412i + ce; ce = ne >> 14u;
      (*d)[7u] = u32(nd) & 0x3fffu; (*e)[7u] = u32(ne) & 0x3fffu; }
    { dhi = active_d >> 14u; ehi = active_e >> 14u;
      nd = u_lo*dhi + v_lo*ehi + u_hi*dlo + v_hi*elo + kd_lo*401i + kd_hi*3698i + cd; cd = nd >> 14u; ne = q_lo*dhi + r_lo*ehi + q_hi*dlo + r_hi*elo + ke_lo*401i + ke_hi*3698i + ce; ce = ne >> 14u;
      (*d)[7u] |= ((u32(nd) & 0x3fffu) << 14u); (*e)[7u] |= ((u32(ne) & 0x3fffu) << 14u); }
    // word 9 (limb 18, sign-extended) -> output word 8 low; tail -> word 8 high + word 9
    { active_d = i32((*d)[9u]); active_e = i32((*e)[9u]); dlo = sx14(active_d & 0x3fff); elo = sx14(active_e & 0x3fff);
      nd = u_lo*dlo + v_lo*elo + u_hi*dhi + v_hi*ehi + kd_lo*3i + kd_hi*401i + cd; cd = nd >> 14u; ne = q_lo*dlo + r_lo*elo + q_hi*dhi + r_hi*ehi + ke_lo*3i + ke_hi*401i + ce; ce = ne >> 14u;
      (*d)[8u] = u32(nd) & 0x3fffu; (*e)[8u] = u32(ne) & 0x3fffu; }
    { nd = u_hi*dlo + v_hi*elo + kd_hi*3i + cd; ne = q_hi*dlo + r_hi*elo + ke_hi*3i + ce;
      (*d)[8u] |= ((u32(nd) & 0x3fffu) << 14u); (*e)[8u] |= ((u32(ne) & 0x3fffu) << 14u);
      (*d)[9u] = u32(nd >> 14u) & 0x3fffu; (*e)[9u] = u32(ne >> 14u) & 0x3fffu; }
}

// 256-bit value (8x u32) -> ten 28-bit limbs (word 9 = top 4 value bits).
fn pk_from_packed(p8: array<u32, 8>) -> array<u32, 10> {
    var o: array<u32, 10>;
    o[0] = p8[0] & 0x0fffffffu;
    o[1] = (p8[0] >> 28u) | ((p8[1] & 0x00ffffffu) << 4u);
    o[2] = (p8[1] >> 24u) | ((p8[2] & 0x000fffffu) << 8u);
    o[3] = (p8[2] >> 20u) | ((p8[3] & 0x0000ffffu) << 12u);
    o[4] = (p8[3] >> 16u) | ((p8[4] & 0x00000fffu) << 16u);
    o[5] = (p8[4] >> 12u) | ((p8[5] & 0x000000ffu) << 20u);
    o[6] = (p8[5] >> 8u)  | ((p8[6] & 0x0000000fu) << 24u);
    o[7] = (p8[6] >> 4u);
    o[8] = p8[7] & 0x0fffffffu;
    o[9] = p8[7] >> 28u;
    return o;
}
// Ten 28-bit limbs (canonical, < q) -> 256-bit value (8x u32).
fn pk_to_packed(x: array<u32, 10>) -> array<u32, 8> {
    var o: array<u32, 8>;
    o[0] = x[0]         | (x[1] << 28u);
    o[1] = (x[1] >> 4u)  | (x[2] << 24u);
    o[2] = (x[2] >> 8u)  | (x[3] << 20u);
    o[3] = (x[3] >> 12u) | (x[4] << 16u);
    o[4] = (x[4] >> 16u) | (x[5] << 12u);
    o[5] = (x[5] >> 20u) | (x[6] << 8u);
    o[6] = (x[6] >> 24u) | (x[7] << 4u);
    o[7] = x[8]         | (x[9] << 28u);
    return o;
}

// R^3 mod q (R = 2^260, the 20x13-limb Montgomery radix) as 8x u32. A single
// montgomery_product_f8 by this removes the safegcd 2^-k scaling AND lands the
// result in f8 Montgomery form — the native-CIOS equivalent of the BigInt
// `montgomery_product(d, get_r_cubed())`. Value == pack(get_r_cubed()).
fn pk_r_cubed_f8() -> array<u32, 8> {
    return array<u32, 8>(1071882664u, 333653112u, 1792169669u, 3315345559u, 906230130u, 3308810809u, 2367260661u, 284257773u);
}

fn fr_inv_by_loop_pk(a8: array<u32, 8>) -> array<u32, 8> {
    var f: array<u32, 10> = pk_q();
    var g: array<u32, 10> = pk_from_packed(a8);
    var d: array<u32, 10>;                 // zero-initialised
    var e: array<u32, 10>; e[0] = 1u;    // limb 0 = 1
    var delta: i32 = 1;
    var done: bool = false;
    // 27 = 6*4 + 3 batches, ALL run unconditionally. No early-exit `done`: once
    // g = 0 the divsteps matrix is (2^28,0,0,2^28), so apply_matrix is the identity
    // on f,g,d,e and the trailing batches are no-ops.
    for (var grp: u32 = 0u; grp < 6u; grp = grp + 1u) {
        if (!done) { let m = byl_divsteps(&delta, pk_low_u32(f), pk_low_u32(g)); pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e); if (pk_is_zero(g)) { done = true; } }
        if (!done) { let m = byl_divsteps(&delta, pk_low_u32(f), pk_low_u32(g)); pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e); if (pk_is_zero(g)) { done = true; } }
        if (!done) { let m = byl_divsteps(&delta, pk_low_u32(f), pk_low_u32(g)); pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e); if (pk_is_zero(g)) { done = true; } }
        if (!done) { let m = byl_divsteps(&delta, pk_low_u32(f), pk_low_u32(g)); pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e); if (pk_is_zero(g)) { done = true; } }
        pk_reduce_to_canonical_inplace(&d);
        pk_reduce_to_canonical_inplace(&e);
    }
    if (!done) { let m = byl_divsteps(&delta, pk_low_u32(f), pk_low_u32(g)); pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e); if (pk_is_zero(g)) { done = true; } }
    if (!done) { let m = byl_divsteps(&delta, pk_low_u32(f), pk_low_u32(g)); pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e); if (pk_is_zero(g)) { done = true; } }
    if (!done) { let m = byl_divsteps(&delta, pk_low_u32(f), pk_low_u32(g)); pk_apply_matrix_fg(m, &f, &g); pk_apply_matrix_de(m, &d, &e); if (pk_is_zero(g)) { done = true; } }
    pk_reduce_to_canonical_inplace(&d);
    if (pk_is_neg_2c(f)) { pk_neg_inplace(&d); pk_reduce_to_canonical_inplace(&d); }
    return montgomery_product_f8(pk_to_packed(d), pk_r_cubed_f8());
}
