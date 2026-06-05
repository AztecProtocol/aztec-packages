// === Global-memory inverse, spill-optimized (fr_inv_by_loop_pk_global) ===
// f,g,d,e live in partials_buf tail. Two spill-killers vs the naive port:
//  (1) apply_matrix writes each output word ONCE (even+odd halves combined in a
//      register, no read-modify-write reload of global), and
//  (2) the reduce/neg/pack paths operate on global DIRECTLY (no local 10-limb
//      arrays). Transposed/SOA layout (inv_base = INV_OFF + t, stride inv_nt =
//      NUM_THREADS) so a wave's same-limb accesses are contiguous (coalesced).
// Including kernel declares: partials_buf (array<vec4<u32>>), var<private>
// inv_base, var<private> inv_nt. Reuses byl_divsteps, sx14, BYL_* consts, M14,
// pk_r_cubed_f8, montgomery_product_f8 (inverse_funcs + field8, in scope).

fn inv_ld(a: u32) -> u32 { return partials_buf[a >> 2u][a & 3u]; }
fn inv_st(a: u32, v: u32) { partials_buf[a >> 2u][a & 3u] = v; }
fn pk_p_word28(w: u32) -> u32 {
    switch w {
        case 0u: { return 142409031u; } case 1u: { return 34128237u; }
        case 2u: { return 30051644u; }  case 3u: { return 111744647u; }
        case 4u: { return 140351361u; } case 5u: { return 191371285u; }
        case 6u: { return 163074117u; } case 7u: { return 236132866u; }
        case 8u: { return 6573682u; }   default: { return 3u; }
    }
}
fn pk_pl(k: u32) -> i32 { return i32((pk_p_word28(k >> 1u) >> ((k & 1u) * 14u)) & 0x3fffu); }
fn pk_low_u32_g(b: u32) -> u32 { return inv_ld(b) | ((inv_ld(b + inv_nt) & 0xfu) << 28u); }
fn pk_is_zero_g(b: u32) -> bool {
    var a: u32 = 0u;
    for (var k: u32 = 0u; k < 10u; k = k + 1u) { a = a | inv_ld(b + k * inv_nt); }
    return a == 0u;
}
fn pk_is_neg_2c_g(b: u32) -> bool { return ((inv_ld(b + 9u * inv_nt) >> 13u) & 1u) == 1u; }
fn pk_add_8q_g(b: u32) {
    var c: i32 = 0;
    { let v = i32(inv_ld(b + 0u*inv_nt)) + 65530424 + c; inv_st(b + 0u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 1u*inv_nt)) + 4590444 + c; inv_st(b + 1u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 2u*inv_nt)) + 240413153 + c; inv_st(b + 2u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 3u*inv_nt)) + 88650808 + c; inv_st(b + 3u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 4u*inv_nt)) + 49069067 + c; inv_st(b + 4u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 5u*inv_nt)) + 188793004 + c; inv_st(b + 5u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 6u*inv_nt)) + 230851117 + c; inv_st(b + 6u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 7u*inv_nt)) + 10014740 + c; inv_st(b + 7u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 8u*inv_nt)) + 52589463 + c; inv_st(b + 8u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 9u*inv_nt)) + 24 + c; inv_st(b + 9u*inv_nt, u32(v) & 0x3fffu); }
}
fn pk_sub_4q_g(b: u32) {
    var c: i32 = 0;
    { let v = i32(inv_ld(b + 0u*inv_nt)) - 32765212 + c; inv_st(b + 0u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 1u*inv_nt)) - 136512950 + c; inv_st(b + 1u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 2u*inv_nt)) - 120206576 + c; inv_st(b + 2u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 3u*inv_nt)) - 178543132 + c; inv_st(b + 3u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 4u*inv_nt)) - 24534533 + c; inv_st(b + 4u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 5u*inv_nt)) - 228614230 + c; inv_st(b + 5u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 6u*inv_nt)) - 115425558 + c; inv_st(b + 6u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 7u*inv_nt)) - 139225098 + c; inv_st(b + 7u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 8u*inv_nt)) - 26294731 + c; inv_st(b + 8u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 9u*inv_nt)) - 12 + c; inv_st(b + 9u*inv_nt, u32(v) & 0x3fffu); }
}
fn pk_sub_2q_g(b: u32) {
    var c: i32 = 0;
    { let v = i32(inv_ld(b + 0u*inv_nt)) - 16382606 + c; inv_st(b + 0u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 1u*inv_nt)) - 68256475 + c; inv_st(b + 1u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 2u*inv_nt)) - 60103288 + c; inv_st(b + 2u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 3u*inv_nt)) - 223489294 + c; inv_st(b + 3u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 4u*inv_nt)) - 12267266 + c; inv_st(b + 4u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 5u*inv_nt)) - 114307115 + c; inv_st(b + 5u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 6u*inv_nt)) - 57712779 + c; inv_st(b + 6u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 7u*inv_nt)) - 203830277 + c; inv_st(b + 7u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 8u*inv_nt)) - 13147365 + c; inv_st(b + 8u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 9u*inv_nt)) - 6 + c; inv_st(b + 9u*inv_nt, u32(v) & 0x3fffu); }
}
fn pk_sub_q_g(b: u32) {
    var c: i32 = 0;
    { let v = i32(inv_ld(b + 0u*inv_nt)) - 142409031 + c; inv_st(b + 0u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 1u*inv_nt)) - 34128237 + c; inv_st(b + 1u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 2u*inv_nt)) - 30051644 + c; inv_st(b + 2u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 3u*inv_nt)) - 111744647 + c; inv_st(b + 3u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 4u*inv_nt)) - 140351361 + c; inv_st(b + 4u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 5u*inv_nt)) - 191371285 + c; inv_st(b + 5u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 6u*inv_nt)) - 163074117 + c; inv_st(b + 6u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 7u*inv_nt)) - 236132866 + c; inv_st(b + 7u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 8u*inv_nt)) - 6573682 + c; inv_st(b + 8u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = i32(inv_ld(b + 9u*inv_nt)) - 3 + c; inv_st(b + 9u*inv_nt, u32(v) & 0x3fffu); }
}
fn pk_cmp_ge_4q_g(b: u32) -> bool {
    if (inv_ld(b + 9u*inv_nt) != 12u) { return inv_ld(b + 9u*inv_nt) > 12u; }
    if (inv_ld(b + 8u*inv_nt) != 26294731u) { return inv_ld(b + 8u*inv_nt) > 26294731u; }
    if (inv_ld(b + 7u*inv_nt) != 139225098u) { return inv_ld(b + 7u*inv_nt) > 139225098u; }
    if (inv_ld(b + 6u*inv_nt) != 115425558u) { return inv_ld(b + 6u*inv_nt) > 115425558u; }
    if (inv_ld(b + 5u*inv_nt) != 228614230u) { return inv_ld(b + 5u*inv_nt) > 228614230u; }
    if (inv_ld(b + 4u*inv_nt) != 24534533u) { return inv_ld(b + 4u*inv_nt) > 24534533u; }
    if (inv_ld(b + 3u*inv_nt) != 178543132u) { return inv_ld(b + 3u*inv_nt) > 178543132u; }
    if (inv_ld(b + 2u*inv_nt) != 120206576u) { return inv_ld(b + 2u*inv_nt) > 120206576u; }
    if (inv_ld(b + 1u*inv_nt) != 136512950u) { return inv_ld(b + 1u*inv_nt) > 136512950u; }
    if (inv_ld(b + 0u*inv_nt) != 32765212u) { return inv_ld(b + 0u*inv_nt) > 32765212u; }
    return true;
}
fn pk_cmp_ge_2q_g(b: u32) -> bool {
    if (inv_ld(b + 9u*inv_nt) != 6u) { return inv_ld(b + 9u*inv_nt) > 6u; }
    if (inv_ld(b + 8u*inv_nt) != 13147365u) { return inv_ld(b + 8u*inv_nt) > 13147365u; }
    if (inv_ld(b + 7u*inv_nt) != 203830277u) { return inv_ld(b + 7u*inv_nt) > 203830277u; }
    if (inv_ld(b + 6u*inv_nt) != 57712779u) { return inv_ld(b + 6u*inv_nt) > 57712779u; }
    if (inv_ld(b + 5u*inv_nt) != 114307115u) { return inv_ld(b + 5u*inv_nt) > 114307115u; }
    if (inv_ld(b + 4u*inv_nt) != 12267266u) { return inv_ld(b + 4u*inv_nt) > 12267266u; }
    if (inv_ld(b + 3u*inv_nt) != 223489294u) { return inv_ld(b + 3u*inv_nt) > 223489294u; }
    if (inv_ld(b + 2u*inv_nt) != 60103288u) { return inv_ld(b + 2u*inv_nt) > 60103288u; }
    if (inv_ld(b + 1u*inv_nt) != 68256475u) { return inv_ld(b + 1u*inv_nt) > 68256475u; }
    if (inv_ld(b + 0u*inv_nt) != 16382606u) { return inv_ld(b + 0u*inv_nt) > 16382606u; }
    return true;
}
fn pk_cmp_ge_q_g(b: u32) -> bool {
    if (inv_ld(b + 9u*inv_nt) != 3u) { return inv_ld(b + 9u*inv_nt) > 3u; }
    if (inv_ld(b + 8u*inv_nt) != 6573682u) { return inv_ld(b + 8u*inv_nt) > 6573682u; }
    if (inv_ld(b + 7u*inv_nt) != 236132866u) { return inv_ld(b + 7u*inv_nt) > 236132866u; }
    if (inv_ld(b + 6u*inv_nt) != 163074117u) { return inv_ld(b + 6u*inv_nt) > 163074117u; }
    if (inv_ld(b + 5u*inv_nt) != 191371285u) { return inv_ld(b + 5u*inv_nt) > 191371285u; }
    if (inv_ld(b + 4u*inv_nt) != 140351361u) { return inv_ld(b + 4u*inv_nt) > 140351361u; }
    if (inv_ld(b + 3u*inv_nt) != 111744647u) { return inv_ld(b + 3u*inv_nt) > 111744647u; }
    if (inv_ld(b + 2u*inv_nt) != 30051644u) { return inv_ld(b + 2u*inv_nt) > 30051644u; }
    if (inv_ld(b + 1u*inv_nt) != 34128237u) { return inv_ld(b + 1u*inv_nt) > 34128237u; }
    if (inv_ld(b + 0u*inv_nt) != 142409031u) { return inv_ld(b + 0u*inv_nt) > 142409031u; }
    return true;
}
fn pk_neg_g(b: u32) {
    var c: i32 = 0;
    { let v = -i32(inv_ld(b + 0u*inv_nt)) + c; inv_st(b + 0u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = -i32(inv_ld(b + 1u*inv_nt)) + c; inv_st(b + 1u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = -i32(inv_ld(b + 2u*inv_nt)) + c; inv_st(b + 2u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = -i32(inv_ld(b + 3u*inv_nt)) + c; inv_st(b + 3u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = -i32(inv_ld(b + 4u*inv_nt)) + c; inv_st(b + 4u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = -i32(inv_ld(b + 5u*inv_nt)) + c; inv_st(b + 5u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = -i32(inv_ld(b + 6u*inv_nt)) + c; inv_st(b + 6u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = -i32(inv_ld(b + 7u*inv_nt)) + c; inv_st(b + 7u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = -i32(inv_ld(b + 8u*inv_nt)) + c; inv_st(b + 8u*inv_nt, u32(v) & 0x0fffffffu); c = v >> 28u; }
    { let v = -i32(inv_ld(b + 9u*inv_nt)) + c; inv_st(b + 9u*inv_nt, u32(v) & 0x3fffu); }
}
fn pk_reduce_to_canonical_g(b: u32) {
    if (pk_is_neg_2c_g(b)) { pk_add_8q_g(b); }
    if (pk_cmp_ge_4q_g(b)) { pk_sub_4q_g(b); }
    if (pk_cmp_ge_2q_g(b)) { pk_sub_2q_g(b); }
    if (pk_cmp_ge_q_g(b))  { pk_sub_q_g(b); }
}
fn pk_apply_matrix_fg_g(m: vec4i, bf: u32, bg: u32) {
    let u_lo: i32 = m[0] & 0x3fff; let u_hi: i32 = m[0] >> 14u;
    let v_lo: i32 = m[1] & 0x3fff; let v_hi: i32 = m[1] >> 14u;
    let q_lo: i32 = m[2] & 0x3fff; let q_hi: i32 = m[2] >> 14u;
    let r_lo: i32 = m[3] & 0x3fff; let r_hi: i32 = m[3] >> 14u;
    let bn: u32 = inv_base + 40u * inv_nt;
    // ---- F PASS: carries only u,v,cf -> scratch bn ----
    {
        var cf: i32 = 0;
        let fw0 = inv_ld(bf); let gw0 = inv_ld(bg);
        let fe0 = i32(fw0 & 0x3fffu); let ge0 = i32(gw0 & 0x3fffu);
        cf = (u_lo*fe0 + v_lo*ge0) >> 14u;
        var fp: i32 = i32((fw0 >> 14u) & 0x3fffu); var gp: i32 = i32((gw0 >> 14u) & 0x3fffu);
        cf = (u_lo*fp + v_lo*gp + u_hi*fe0 + v_hi*ge0 + cf) >> 14u;
        for (var w: u32 = 1u; w < 9u; w = w + 1u) {
            let fw = inv_ld(bf + w * inv_nt); let gw = inv_ld(bg + w * inv_nt);
            let fe = i32(fw & 0x3fffu); let ge = i32(gw & 0x3fffu);
            let nfe = u_lo*fe + v_lo*ge + u_hi*fp + v_hi*gp + cf; cf = nfe >> 14u;
            let fo = i32((fw >> 14u) & 0x3fffu); let go = i32((gw >> 14u) & 0x3fffu);
            let nfo = u_lo*fo + v_lo*go + u_hi*fe + v_hi*ge + cf; cf = nfo >> 14u;
            inv_st(bn + (w - 1u) * inv_nt, (u32(nfe) & 0x3fffu) | ((u32(nfo) & 0x3fffu) << 14u));
            fp = fo; gp = go;
        }
        let fw9 = inv_ld(bf + 9u * inv_nt); let gw9 = inv_ld(bg + 9u * inv_nt);
        let fe9 = sx14(i32(fw9 & 0x3fffu)); let ge9 = sx14(i32(gw9 & 0x3fffu));
        let nfe = u_lo*fe9 + v_lo*ge9 + u_hi*fp + v_hi*gp + cf; cf = nfe >> 14u;
        let nft = u_hi*fe9 + v_hi*ge9 + cf;
        inv_st(bn + 8u * inv_nt, (u32(nfe) & 0x3fffu) | ((u32(nft) & 0x3fffu) << 14u));
        inv_st(bn + 9u * inv_nt, u32(nft >> 14u) & 0x3fffu);
    }
    // ---- G PASS: carries only q,r,cg -> bg in-place (reads old-f from bf, intact) ----
    {
        var cg: i32 = 0;
        let fw0 = inv_ld(bf); let gw0 = inv_ld(bg);
        let fe0 = i32(fw0 & 0x3fffu); let ge0 = i32(gw0 & 0x3fffu);
        cg = (q_lo*fe0 + r_lo*ge0) >> 14u;
        var fp: i32 = i32((fw0 >> 14u) & 0x3fffu); var gp: i32 = i32((gw0 >> 14u) & 0x3fffu);
        cg = (q_lo*fp + r_lo*gp + q_hi*fe0 + r_hi*ge0 + cg) >> 14u;
        for (var w: u32 = 1u; w < 9u; w = w + 1u) {
            let fw = inv_ld(bf + w * inv_nt); let gw = inv_ld(bg + w * inv_nt);
            let fe = i32(fw & 0x3fffu); let ge = i32(gw & 0x3fffu);
            let nge = q_lo*fe + r_lo*ge + q_hi*fp + r_hi*gp + cg; cg = nge >> 14u;
            let fo = i32((fw >> 14u) & 0x3fffu); let go = i32((gw >> 14u) & 0x3fffu);
            let ngo = q_lo*fo + r_lo*go + q_hi*fe + r_hi*ge + cg; cg = ngo >> 14u;
            inv_st(bg + (w - 1u) * inv_nt, (u32(nge) & 0x3fffu) | ((u32(ngo) & 0x3fffu) << 14u));
            fp = fo; gp = go;
        }
        let fw9 = inv_ld(bf + 9u * inv_nt); let gw9 = inv_ld(bg + 9u * inv_nt);
        let fe9 = sx14(i32(fw9 & 0x3fffu)); let ge9 = sx14(i32(gw9 & 0x3fffu));
        let nge = q_lo*fe9 + r_lo*ge9 + q_hi*fp + r_hi*gp + cg; cg = nge >> 14u;
        let ngt = q_hi*fe9 + r_hi*ge9 + cg;
        inv_st(bg + 8u * inv_nt, (u32(nge) & 0x3fffu) | ((u32(ngt) & 0x3fffu) << 14u));
        inv_st(bg + 9u * inv_nt, u32(ngt >> 14u) & 0x3fffu);
    }
    for (var w: u32 = 0u; w < 10u; w = w + 1u) { inv_st(bf + w * inv_nt, inv_ld(bn + w * inv_nt)); }
}
fn pk_apply_matrix_de_g(m: vec4i, bd: u32, be: u32) {
    let u_lo: i32 = m[0] & 0x3fff; let u_hi: i32 = m[0] >> 14u;
    let v_lo: i32 = m[1] & 0x3fff; let v_hi: i32 = m[1] >> 14u;
    let q_lo: i32 = m[2] & 0x3fff; let q_hi: i32 = m[2] >> 14u;
    let r_lo: i32 = m[3] & 0x3fff; let r_hi: i32 = m[3] >> 14u;
    let p0: i32 = 15687; let p1: i32 = 8691;
    let bn: u32 = inv_base + 40u * inv_nt;
    // ---- D PASS -> scratch bn (preserves old-d in bd for e-pass) ----
    {
        let dw0 = inv_ld(bd); let ew0 = inv_ld(be);
        let d0: i32 = i32(dw0 & 0x3fffu); let d1: i32 = i32((dw0 >> 14u) & 0x3fffu);
        let e0: i32 = i32(ew0 & 0x3fffu); let e1: i32 = i32((ew0 >> 14u) & 0x3fffu);
        let nd: i32 = u_lo*d0 + v_lo*e0;
        let nd1: i32 = u_lo*d1 + v_lo*e1 + u_hi*d0 + v_hi*e0;
        var k_d: i32 = (nd & 0x3fff); k_d |= (((nd1 + (nd >> 14u)) & 0x3fff) << 14u); k_d &= 0xfffffff;
        k_d = ((-k_d & 0xfffffff) * BYL_P_INV_LOi) & 0xfffffff;
        let kd_lo: i32 = (k_d & 0x3fff); let kd_hi: i32 = (k_d >> 14u);
        var cd: i32 = (nd1 + kd_lo * p1 + kd_hi * p0 + ((nd + kd_lo * p0) >> 14u)) >> 14u;
        var dwin: i32 = d1; var ewin: i32 = e1;
        for (var w: u32 = 1u; w < 9u; w = w + 1u) {
            let dw = inv_ld(bd + w * inv_nt); let ew = inv_ld(be + w * inv_nt);
            let dlo = i32(dw & 0x3fffu); let elo = i32(ew & 0x3fffu);
            let plo = pk_pl(2u*w); let pm1 = pk_pl(2u*w - 1u); let pho = pk_pl(2u*w + 1u);
            let nde = u_lo*dlo + v_lo*elo + u_hi*dwin + v_hi*ewin + kd_lo*plo + kd_hi*pm1 + cd; cd = nde >> 14u;
            let dhi = i32((dw >> 14u) & 0x3fffu); let ehi = i32((ew >> 14u) & 0x3fffu);
            let ndo = u_lo*dhi + v_lo*ehi + u_hi*dlo + v_hi*elo + kd_lo*pho + kd_hi*plo + cd; cd = ndo >> 14u;
            inv_st(bn + (w - 1u) * inv_nt, (u32(nde) & 0x3fffu) | ((u32(ndo) & 0x3fffu) << 14u));
            dwin = dhi; ewin = ehi;
        }
        let dw9 = inv_ld(bd + 9u * inv_nt); let ew9 = inv_ld(be + 9u * inv_nt);
        let dlo = sx14(i32(dw9 & 0x3fffu)); let elo = sx14(i32(ew9 & 0x3fffu));
        let p18 = pk_pl(18u); let p17 = pk_pl(17u);
        let nde = u_lo*dlo + v_lo*elo + u_hi*dwin + v_hi*ewin + kd_lo*p18 + kd_hi*p17 + cd; cd = nde >> 14u;
        let ndt = u_hi*dlo + v_hi*elo + kd_hi*p18 + cd;
        inv_st(bn + 8u * inv_nt, (u32(nde) & 0x3fffu) | ((u32(ndt) & 0x3fffu) << 14u));
        inv_st(bn + 9u * inv_nt, u32(ndt >> 14u) & 0x3fffu);
    }
    // ---- E PASS -> be in-place (reads old-d from bd, intact) ----
    {
        let dw0 = inv_ld(bd); let ew0 = inv_ld(be);
        let d0: i32 = i32(dw0 & 0x3fffu); let d1: i32 = i32((dw0 >> 14u) & 0x3fffu);
        let e0: i32 = i32(ew0 & 0x3fffu); let e1: i32 = i32((ew0 >> 14u) & 0x3fffu);
        let ne: i32 = q_lo*d0 + r_lo*e0;
        let ne1: i32 = q_lo*d1 + r_lo*e1 + q_hi*d0 + r_hi*e0;
        var k_e: i32 = (ne & 0x3fff); k_e |= (((ne1 + (ne >> 14u)) & 0x3fff) << 14u); k_e &= 0xfffffff;
        k_e = ((-k_e & 0xfffffff) * BYL_P_INV_LOi) & 0xfffffff;
        let ke_lo: i32 = (k_e & 0x3fff); let ke_hi: i32 = (k_e >> 14u);
        var ce: i32 = (ne1 + ke_lo * p1 + ke_hi * p0 + ((ne + ke_lo * p0) >> 14u)) >> 14u;
        var dwin: i32 = d1; var ewin: i32 = e1;
        for (var w: u32 = 1u; w < 9u; w = w + 1u) {
            let dw = inv_ld(bd + w * inv_nt); let ew = inv_ld(be + w * inv_nt);
            let dlo = i32(dw & 0x3fffu); let elo = i32(ew & 0x3fffu);
            let plo = pk_pl(2u*w); let pm1 = pk_pl(2u*w - 1u); let pho = pk_pl(2u*w + 1u);
            let nee = q_lo*dlo + r_lo*elo + q_hi*dwin + r_hi*ewin + ke_lo*plo + ke_hi*pm1 + ce; ce = nee >> 14u;
            let dhi = i32((dw >> 14u) & 0x3fffu); let ehi = i32((ew >> 14u) & 0x3fffu);
            let neo = q_lo*dhi + r_lo*ehi + q_hi*dlo + r_hi*elo + ke_lo*pho + ke_hi*plo + ce; ce = neo >> 14u;
            inv_st(be + (w - 1u) * inv_nt, (u32(nee) & 0x3fffu) | ((u32(neo) & 0x3fffu) << 14u));
            dwin = dhi; ewin = ehi;
        }
        let dw9 = inv_ld(bd + 9u * inv_nt); let ew9 = inv_ld(be + 9u * inv_nt);
        let dlo = sx14(i32(dw9 & 0x3fffu)); let elo = sx14(i32(ew9 & 0x3fffu));
        let p18 = pk_pl(18u); let p17 = pk_pl(17u);
        let nee = q_lo*dlo + r_lo*elo + q_hi*dwin + r_hi*ewin + ke_lo*p18 + ke_hi*p17 + ce; ce = nee >> 14u;
        let net = q_hi*dlo + r_hi*elo + ke_hi*p18 + ce;
        inv_st(be + 8u * inv_nt, (u32(nee) & 0x3fffu) | ((u32(net) & 0x3fffu) << 14u));
        inv_st(be + 9u * inv_nt, u32(net >> 14u) & 0x3fffu);
    }
    // copy d_new (bn) back into bd
    for (var w: u32 = 0u; w < 10u; w = w + 1u) { inv_st(bd + w * inv_nt, inv_ld(bn + w * inv_nt)); }
}
fn pk_store_q_g(b: u32) { for (var k: u32 = 0u; k < 10u; k = k + 1u) { inv_st(b + k * inv_nt, pk_p_word28(k)); } }
fn pk_zero_g(b: u32)    { for (var k: u32 = 0u; k < 10u; k = k + 1u) { inv_st(b + k * inv_nt, 0u); } }
fn pk_store_a8_g(b: u32, p8: array<u32, 8>) {
    inv_st(b + 0u*inv_nt, p8[0] & 0x0fffffffu);
    inv_st(b + 1u*inv_nt, (p8[0] >> 28u) | ((p8[1] & 0x00ffffffu) << 4u));
    inv_st(b + 2u*inv_nt, (p8[1] >> 24u) | ((p8[2] & 0x000fffffu) << 8u));
    inv_st(b + 3u*inv_nt, (p8[2] >> 20u) | ((p8[3] & 0x0000ffffu) << 12u));
    inv_st(b + 4u*inv_nt, (p8[3] >> 16u) | ((p8[4] & 0x00000fffu) << 16u));
    inv_st(b + 5u*inv_nt, (p8[4] >> 12u) | ((p8[5] & 0x000000ffu) << 20u));
    inv_st(b + 6u*inv_nt, (p8[5] >> 8u)  | ((p8[6] & 0x0000000fu) << 24u));
    inv_st(b + 7u*inv_nt, (p8[6] >> 4u));
    inv_st(b + 8u*inv_nt, p8[7] & 0x0fffffffu);
    inv_st(b + 9u*inv_nt, p8[7] >> 28u);
}
fn pk_to_packed_g(b: u32) -> array<u32, 8> {
    let w0=inv_ld(b+0u*inv_nt); let w1=inv_ld(b+1u*inv_nt); let w2=inv_ld(b+2u*inv_nt); let w3=inv_ld(b+3u*inv_nt);
    let w4=inv_ld(b+4u*inv_nt); let w5=inv_ld(b+5u*inv_nt); let w6=inv_ld(b+6u*inv_nt); let w7=inv_ld(b+7u*inv_nt);
    let w8=inv_ld(b+8u*inv_nt); let w9=inv_ld(b+9u*inv_nt);
    return array<u32, 8>(w0|(w1<<28u), (w1>>4u)|(w2<<24u), (w2>>8u)|(w3<<20u), (w3>>12u)|(w4<<16u),
                         (w4>>16u)|(w5<<12u), (w5>>20u)|(w6<<8u), (w6>>24u)|(w7<<4u), w8|(w9<<28u));
}
// In-place inverse. The value to invert is read from the global I/O slot `bio`
// (8x u32 native, written by the caller); the Montgomery inverse is written back
// into the SAME slot. No array param, no return — the 254-bit operand never lives
// in registers across this function.
fn fr_inv_by_loop_pk_global() {
    let bf: u32 = inv_base + 0u; let bg: u32 = inv_base + 10u * inv_nt;
    let bd: u32 = inv_base + 20u * inv_nt; let be: u32 = inv_base + 30u * inv_nt;
    let bio: u32 = inv_base + 40u * inv_nt;
    pk_store_q_g(bf);
    // Stream-repack the input (bio: 8x u32) into the g region (bg: 10x 28-bit) with
    // a 2-word bit-cursor — never holds all 8 input words at once.
    {
        var slo: u32 = 0u; var shi: u32 = 0u; var snb: u32 = 0u; var sii: u32 = 0u;
        for (var sk: u32 = 0u; sk < 10u; sk = sk + 1u) {
            if (snb < 28u && sii < 8u) { let sw = inv_ld(bio + sii * inv_nt); slo = slo | (sw << snb); shi = shi | select(0u, sw >> ((32u - snb) & 31u), snb != 0u); snb = snb + 32u; sii = sii + 1u; }
            inv_st(bg + sk * inv_nt, slo & 0x0fffffffu); slo = (slo >> 28u) | (shi << 4u); shi = shi >> 28u; snb = snb - 28u;
        }
    }
    pk_zero_g(bd); pk_zero_g(be); inv_st(be, 1u);
    var delta: i32 = 1; var done: bool = false;
    for (var grp: u32 = 0u; grp < 6u; grp = grp + 1u) {
        if (!done) { let m = byl_divsteps(&delta, pk_low_u32_g(bf), pk_low_u32_g(bg)); pk_apply_matrix_fg_g(m, bf, bg); pk_apply_matrix_de_g(m, bd, be); if (pk_is_zero_g(bg)) { done = true; } }
        if (!done) { let m = byl_divsteps(&delta, pk_low_u32_g(bf), pk_low_u32_g(bg)); pk_apply_matrix_fg_g(m, bf, bg); pk_apply_matrix_de_g(m, bd, be); if (pk_is_zero_g(bg)) { done = true; } }
        if (!done) { let m = byl_divsteps(&delta, pk_low_u32_g(bf), pk_low_u32_g(bg)); pk_apply_matrix_fg_g(m, bf, bg); pk_apply_matrix_de_g(m, bd, be); if (pk_is_zero_g(bg)) { done = true; } }
        if (!done) { let m = byl_divsteps(&delta, pk_low_u32_g(bf), pk_low_u32_g(bg)); pk_apply_matrix_fg_g(m, bf, bg); pk_apply_matrix_de_g(m, bd, be); if (pk_is_zero_g(bg)) { done = true; } }
        pk_reduce_to_canonical_g(bd); pk_reduce_to_canonical_g(be);
    }
    if (!done) { let m = byl_divsteps(&delta, pk_low_u32_g(bf), pk_low_u32_g(bg)); pk_apply_matrix_fg_g(m, bf, bg); pk_apply_matrix_de_g(m, bd, be); if (pk_is_zero_g(bg)) { done = true; } }
    if (!done) { let m = byl_divsteps(&delta, pk_low_u32_g(bf), pk_low_u32_g(bg)); pk_apply_matrix_fg_g(m, bf, bg); pk_apply_matrix_de_g(m, bd, be); if (pk_is_zero_g(bg)) { done = true; } }
    if (!done) { let m = byl_divsteps(&delta, pk_low_u32_g(bf), pk_low_u32_g(bg)); pk_apply_matrix_fg_g(m, bf, bg); pk_apply_matrix_de_g(m, bd, be); if (pk_is_zero_g(bg)) { done = true; } }
    pk_reduce_to_canonical_g(bd);
    if (pk_is_neg_2c_g(bf)) { pk_neg_g(bd); pk_reduce_to_canonical_g(bd); }
    // Final Montgomery correction in place: write bd (packed) into bio, then bio *= R^3.
    // Pack bd (10x 28-bit) straight into bio (8x u32) with a 2-word sliding window
    // — never forms an 8-register array — then bio *= R^3 in place.
    var pw: u32 = inv_ld(bd + 0u * inv_nt);
    { let nx = inv_ld(bd + 1u * inv_nt); inv_st(bio + 0u * inv_nt, pw | (nx << 28u)); pw = nx; }
    { let nx = inv_ld(bd + 2u * inv_nt); inv_st(bio + 1u * inv_nt, (pw >> 4u) | (nx << 24u)); pw = nx; }
    { let nx = inv_ld(bd + 3u * inv_nt); inv_st(bio + 2u * inv_nt, (pw >> 8u) | (nx << 20u)); pw = nx; }
    { let nx = inv_ld(bd + 4u * inv_nt); inv_st(bio + 3u * inv_nt, (pw >> 12u) | (nx << 16u)); pw = nx; }
    { let nx = inv_ld(bd + 5u * inv_nt); inv_st(bio + 4u * inv_nt, (pw >> 16u) | (nx << 12u)); pw = nx; }
    { let nx = inv_ld(bd + 6u * inv_nt); inv_st(bio + 5u * inv_nt, (pw >> 20u) | (nx << 8u)); pw = nx; }
    { let nx = inv_ld(bd + 7u * inv_nt); inv_st(bio + 6u * inv_nt, (pw >> 24u) | (nx << 4u)); pw = nx; }
    inv_st(bio + 7u * inv_nt, inv_ld(bd + 8u * inv_nt) | (inv_ld(bd + 9u * inv_nt) << 28u));
    montgomery_product_f8_inplace(bio, pk_r_cubed_f8());
}

