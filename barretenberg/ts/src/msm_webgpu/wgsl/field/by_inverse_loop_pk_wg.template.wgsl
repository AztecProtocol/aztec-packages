// === Workgroup-backed packed safegcd inverse (fr_inv_by_loop_pk_wg) ===
//
// Register/spill-reduction variant of fr_inv_by_loop_pk. The four 10-word state
// vectors f,g,d,e — the inverse's largest function-local working set, a major
// contributor to the walker's per-thread spill (scratch) — live in a workgroup
// array `inv_state` instead of private memory. Layout: region-major then
// transposed, so f,g,d,e occupy [0,10), [10,20), [20,30), [30,40) * WG_TPB and
// limb k of a region based at b is inv_state[b + k * WG_TPB]. A wave touching one
// limb hits WG_TPB consecutive words = no LDS bank conflicts. Each thread owns
// its own wg_slot column, so no workgroup barrier is needed.
//
// naga forbids ptr<workgroup,...> as a function parameter, so the pk_* helpers
// take a u32 region base (already offset by wg_slot) instead of ptr<function,Pk>.
// Arithmetic is byte-for-byte the validated pk path.
//
// The including kernel must declare, at module scope, BEFORE this partial:
//   const WG_TPB: u32 = <workgroup_size>u;     (here aliased to MONT_TPB)
//   var<workgroup> inv_state: array<u32, 40u * WG_TPB>;
//   var<private>   wg_slot: u32;               (set to local_invocation_id.x)
// and the function-memory inverse partial (pk_p_word, byl_divsteps, BylMat,
// BYL_* consts) plus montgomery_product / get_r_cubed must already be in scope.
//
// GENERATED from by_inverse_loop.template.wgsl by
// ~/localclaudebox/cios15n/gen_inv_pk_wg.mjs. Edit the generator, not this file.

fn pk_low_u64_wg(b: u32) -> vec2<u32> {
    let w0 = inv_state[b + (0) * WG_TPB];
    let w1 = inv_state[b + (1) * WG_TPB];
    let l0: u32 = w0 & MASK;
    let l1: u32 = (w0 >> 13u) & MASK;
    let l2: u32 = w1 & MASK;
    let l3: u32 = (w1 >> 13u) & MASK;
    let l4: u32 = inv_state[b + (2) * WG_TPB] & MASK;
    let lo32: u32 = l0 | (l1 << 13u) | (l2 << 26u);
    let hi32: u32 = (l2 >> 6u) | (l3 << 7u) | (l4 << 20u);
    return vec2<u32>(lo32, hi32);
}

fn pk_is_zero_wg(b: u32) -> bool {
    var a: u32 = 0u;
    for (var k: u32 = 0u; k < 10u; k = k + 1u) { a = a | inv_state[b + (k) * WG_TPB]; }
    return a == 0u;
}

fn pk_is_neg_2c_wg(b: u32) -> bool { return ((inv_state[b + (9) * WG_TPB] >> 25u) & 1u) == 1u; }

fn pk_normalise_wg(b: u32) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let word = inv_state[b + (w) * WG_TPB];
        let lo: i32 = i32(word & MASK) + c;
        let olo: u32 = u32(lo) & MASK;
        c = lo >> 13u;
        let hi: i32 = i32((word >> 13u) & MASK) + c;
        let ohi: u32 = u32(hi) & MASK;
        if (w != 9u) { c = hi >> 13u; }
        inv_state[b + (w) * WG_TPB] = olo | (ohi << 13u);
    }
}

fn pk_add_p_wg(b: u32) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let xw = inv_state[b + (w) * WG_TPB];
        let pw = pk_p_word(w);
        let lo: i32 = i32(xw & MASK) + i32(pw & MASK) + c;
        let olo: u32 = u32(lo) & MASK;
        c = lo >> 13u;
        let hi: i32 = i32((xw >> 13u) & MASK) + i32((pw >> 13u) & MASK) + c;
        let ohi: u32 = u32(hi) & MASK;
        if (w != 9u) { c = hi >> 13u; }
        inv_state[b + (w) * WG_TPB] = olo | (ohi << 13u);
    }
}

fn pk_sub_p_wg(b: u32) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let xw = inv_state[b + (w) * WG_TPB];
        let pw = pk_p_word(w);
        let lo: i32 = i32(xw & MASK) - i32(pw & MASK) + c;
        let olo: u32 = u32(lo) & MASK;
        c = lo >> 13u;
        let hi: i32 = i32((xw >> 13u) & MASK) - i32((pw >> 13u) & MASK) + c;
        let ohi: u32 = u32(hi) & MASK;
        if (w != 9u) { c = hi >> 13u; }
        inv_state[b + (w) * WG_TPB] = olo | (ohi << 13u);
    }
}

fn pk_neg_wg(b: u32) {
    var c: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let word = inv_state[b + (w) * WG_TPB];
        let lo: i32 = -i32(word & MASK) + c;
        let olo: u32 = u32(lo) & MASK;
        c = lo >> 13u;
        let hi: i32 = -i32((word >> 13u) & MASK) + c;
        let ohi: u32 = u32(hi) & MASK;
        if (w != 9u) { c = hi >> 13u; }
        inv_state[b + (w) * WG_TPB] = olo | (ohi << 13u);
    }
}

fn pk_gte_wg(b: u32) -> bool {
    for (var idx: u32 = 0u; idx < 10u; idx = idx + 1u) {
        let w = 9u - idx;
        let pw = pk_p_word(w);
        let xhi = (inv_state[b + (w) * WG_TPB] >> 13u) & MASK;
        let phi = (pw >> 13u) & MASK;
        if (xhi > phi) { return true; }
        if (xhi < phi) { return false; }
        let xlo = inv_state[b + (w) * WG_TPB] & MASK;
        let plo = pw & MASK;
        if (xlo > plo) { return true; }
        if (xlo < plo) { return false; }
    }
    return true;
}

fn pk_reduce_to_canonical_wg(b: u32) {
    pk_normalise_wg(b);
    var done: bool = false;
    for (var it: u32 = 0u; it < BYL_RTC_MAX_ITERS; it = it + 1u) {
        if (done) { continue; }
        if (pk_is_neg_2c_wg(b)) { pk_add_p_wg(b); }
        else if (pk_gte_wg(b)) { pk_sub_p_wg(b); }
        else { done = true; }
    }
}

fn pk_apply_matrix_fg_wg(m: BylMat, bf: u32, bg: u32) {
    let u_lo: i32 = i32(u32(m.u) & MASK); let u_hi: i32 = m.u >> 13u;
    let v_lo: i32 = i32(u32(m.v) & MASK); let v_hi: i32 = m.v >> 13u;
    let q_lo: i32 = i32(u32(m.q) & MASK); let q_hi: i32 = m.q >> 13u;
    let r_lo: i32 = i32(u32(m.r) & MASK); let r_hi: i32 = m.r >> 13u;
    var cf: i32 = 0; var cg: i32 = 0; var fp: i32 = 0; var gp: i32 = 0;
    for (var w: u32 = 0u; w < 10u; w = w + 1u) {
        let fw = inv_state[bf + (w) * WG_TPB]; let gw = inv_state[bg + (w) * WG_TPB];
        let fe: i32 = i32(fw & MASK); let ge: i32 = i32(gw & MASK);
        let nfe: i32 = u_lo * fe + v_lo * ge + u_hi * fp + v_hi * gp + cf;
        let nge: i32 = q_lo * fe + r_lo * ge + q_hi * fp + r_hi * gp + cg;
        cf = nfe >> 13u; cg = nge >> 13u;
        var fo: i32; var go: i32;
        if (w == 9u) {
            fo = (i32((fw >> 13u) & MASK) << 19u) >> 19u;
            go = (i32((gw >> 13u) & MASK) << 19u) >> 19u;
        } else {
            fo = i32((fw >> 13u) & MASK); go = i32((gw >> 13u) & MASK);
        }
        let nfo: i32 = u_lo * fo + v_lo * go + u_hi * fe + v_hi * ge + cf;
        let ngo: i32 = q_lo * fo + r_lo * go + q_hi * fe + r_hi * ge + cg;
        cf = nfo >> 13u; cg = ngo >> 13u;
        if (w >= 1u) {
            inv_state[bf + (w - 1u) * WG_TPB] = (u32(nfe) & MASK) | ((u32(nfo) & MASK) << 13u);
            inv_state[bg + (w - 1u) * WG_TPB] = (u32(nge) & MASK) | ((u32(ngo) & MASK) << 13u);
        }
        fp = fo; gp = go;
    }
    let nft: i32 = u_hi * fp + v_hi * gp + cf;
    let ngt: i32 = q_hi * fp + r_hi * gp + cg;
    inv_state[bf + (9) * WG_TPB] = (u32(nft) & MASK) | (u32(nft >> 13u) << 13u);
    inv_state[bg + (9) * WG_TPB] = (u32(ngt) & MASK) | (u32(ngt >> 13u) << 13u);
}

fn pk_apply_matrix_de_wg(m: BylMat, bd: u32, be: u32) {
    let u_lo: i32 = i32(u32(m.u) & MASK); let u_hi: i32 = m.u >> 13u;
    let v_lo: i32 = i32(u32(m.v) & MASK); let v_hi: i32 = m.v >> 13u;
    let q_lo: i32 = i32(u32(m.q) & MASK); let q_hi: i32 = m.q >> 13u;
    let r_lo: i32 = i32(u32(m.r) & MASK); let r_hi: i32 = m.r >> 13u;

    let dw0 = inv_state[bd + (0) * WG_TPB]; let ew0 = inv_state[be + (0) * WG_TPB]; let pw0 = pk_p_word(0u);
    let d0: i32 = i32(dw0 & MASK); let d1: i32 = i32((dw0 >> 13u) & MASK);
    let e0: i32 = i32(ew0 & MASK); let e1: i32 = i32((ew0 >> 13u) & MASK);
    let p0: i32 = i32(pw0 & MASK); let p1: i32 = i32((pw0 >> 13u) & MASK);

    let nd0: i32 = u_lo * d0 + v_lo * e0; let ne0: i32 = q_lo * d0 + r_lo * e0;
    let nd1: i32 = u_lo * d1 + v_lo * e1 + u_hi * d0 + v_hi * e0;
    let ne1: i32 = q_lo * d1 + r_lo * e1 + q_hi * d0 + r_hi * e0;
    let nd0_low: u32 = u32(nd0) & MASK; let nd1_carry: u32 = u32(nd1 + (nd0 >> 13u)) & MASK;
    let t_d: u32 = (nd0_low | (nd1_carry << 13u)) & BYL_MASK_BATCH;
    let ne0_low: u32 = u32(ne0) & MASK; let ne1_carry: u32 = u32(ne1 + (ne0 >> 13u)) & MASK;
    let t_e: u32 = (ne0_low | (ne1_carry << 13u)) & BYL_MASK_BATCH;
    let k_d: u32 = (((~t_d + 1u) & BYL_MASK_BATCH) * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let k_e: u32 = (((~t_e + 1u) & BYL_MASK_BATCH) * BYL_P_INV_LO) & BYL_MASK_BATCH;
    let kd_lo: i32 = i32(k_d & MASK); let kd_hi: i32 = i32(k_d >> 13u);
    let ke_lo: i32 = i32(k_e & MASK); let ke_hi: i32 = i32(k_e >> 13u);

    var cd: i32 = (nd1 + kd_lo * p1 + kd_hi * p0 + ((nd0 + kd_lo * p0) >> 13u)) >> 13u;
    var ce: i32 = (ne1 + ke_lo * p1 + ke_hi * p0 + ((ne0 + ke_lo * p0) >> 13u)) >> 13u;
    var dp: i32 = d1; var ep: i32 = e1;

    for (var w: u32 = 1u; w < 10u; w = w + 1u) {
        let dw = inv_state[bd + (w) * WG_TPB]; let ew = inv_state[be + (w) * WG_TPB]; let pw = pk_p_word(w);
        // even limb i = 2w
        let di_e: i32 = i32(dw & MASK); let ei_e: i32 = i32(ew & MASK);
        let pi_e: i32 = i32(pw & MASK);
        let pim1_e: i32 = i32((pk_p_word(w - 1u) >> 13u) & MASK);
        let nd_e: i32 = u_lo * di_e + v_lo * ei_e + u_hi * dp + v_hi * ep + kd_lo * pi_e + kd_hi * pim1_e + cd;
        let ne_e: i32 = q_lo * di_e + r_lo * ei_e + q_hi * dp + r_hi * ep + ke_lo * pi_e + ke_hi * pim1_e + ce;
        cd = nd_e >> 13u; ce = ne_e >> 13u;
        // odd limb i = 2w+1
        var di_o: i32; var ei_o: i32;
        if (w == 9u) {
            di_o = (i32((dw >> 13u) & MASK) << 19u) >> 19u;
            ei_o = (i32((ew >> 13u) & MASK) << 19u) >> 19u;
        } else {
            di_o = i32((dw >> 13u) & MASK); ei_o = i32((ew >> 13u) & MASK);
        }
        let pi_o: i32 = i32((pw >> 13u) & MASK);
        let pim1_o: i32 = i32(pw & MASK);
        let nd_o: i32 = u_lo * di_o + v_lo * ei_o + u_hi * di_e + v_hi * ei_e + kd_lo * pi_o + kd_hi * pim1_o + cd;
        let ne_o: i32 = q_lo * di_o + r_lo * ei_o + q_hi * di_e + r_hi * ei_e + ke_lo * pi_o + ke_hi * pim1_o + ce;
        cd = nd_o >> 13u; ce = ne_o >> 13u;
        inv_state[bd + (w - 1u) * WG_TPB] = (u32(nd_e) & MASK) | ((u32(nd_o) & MASK) << 13u);
        inv_state[be + (w - 1u) * WG_TPB] = (u32(ne_e) & MASK) | ((u32(ne_o) & MASK) << 13u);
        dp = di_o; ep = ei_o;
    }
    let p_top: i32 = i32((pk_p_word(9u) >> 13u) & MASK);
    let nd_top: i32 = u_hi * dp + v_hi * ep + kd_hi * p_top + cd;
    let ne_top: i32 = q_hi * dp + r_hi * ep + ke_hi * p_top + ce;
    inv_state[bd + (9) * WG_TPB] = (u32(nd_top) & MASK) | (u32(nd_top >> 13u) << 13u);
    inv_state[be + (9) * WG_TPB] = (u32(ne_top) & MASK) | (u32(ne_top >> 13u) << 13u);
}

// --- workgroup state converters (transposed: limb word k of region base @ b is
//     inv_state[b + k * WG_TPB]) ---

fn pk_store_p_wg(b: u32) {
    for (var k: u32 = 0u; k < 10u; k = k + 1u) { inv_state[b + k * WG_TPB] = pk_p_word(k); }
}

fn pk_store_bigint_wg(b: u32, x: BigInt) {
    for (var k: u32 = 0u; k < 10u; k = k + 1u) {
        inv_state[b + k * WG_TPB] = (x.limbs[2u * k] & MASK) | ((x.limbs[2u * k + 1u] & MASK) << 13u);
    }
}

fn pk_zero_wg(b: u32) {
    for (var k: u32 = 0u; k < 10u; k = k + 1u) { inv_state[b + k * WG_TPB] = 0u; }
}

fn pk_to_bigint_wg(b: u32) -> BigInt {
    var o: BigInt;
    for (var k: u32 = 0u; k < 10u; k = k + 1u) {
        let word = inv_state[b + k * WG_TPB];
        o.limbs[2u * k] = word & MASK;
        o.limbs[2u * k + 1u] = (word >> 13u) & MASK;
    }
    return o;
}

// fr_inv_by_loop_pk_wg: identical driver to fr_inv_by_loop_pk, but f,g,d,e live
// in the workgroup array inv_state at region bases bf/bg/bd/be (each already
// offset by wg_slot). One safegcd inverse per call; assumes a != 0.
fn fr_inv_by_loop_pk_wg(a: BigInt) -> BigInt {
    let bf: u32 = wg_slot + 0u * WG_TPB;
    let bg: u32 = wg_slot + 10u * WG_TPB;
    let bd: u32 = wg_slot + 20u * WG_TPB;
    let be: u32 = wg_slot + 30u * WG_TPB;

    pk_store_p_wg(bf);          // f = p
    pk_store_bigint_wg(bg, a);  // g = a
    pk_zero_wg(bd);             // d = 0
    pk_zero_wg(be);             // e = 0
    inv_state[be + 0u * WG_TPB] = 1u;  // e = 1

    var delta: i32 = 1;
    var done: bool = false;
    for (var iter: u32 = 0u; iter < BYL_NUM_OUTER; iter = iter + 1u) {
        if (done) { continue; }
        let f_lo: vec2<u32> = pk_low_u64_wg(bf);
        let g_lo: vec2<u32> = pk_low_u64_wg(bg);
        let m: BylMat = byl_divsteps(&delta, f_lo, g_lo);
        pk_apply_matrix_fg_wg(m, bf, bg);
        pk_apply_matrix_de_wg(m, bd, be);
        if (((iter + 1u) % BYL_REDUCE_INTERVAL) == 0u) {
            pk_reduce_to_canonical_wg(bd);
            pk_reduce_to_canonical_wg(be);
        }
        if (pk_is_zero_wg(bg)) { done = true; }
    }
    pk_reduce_to_canonical_wg(bd);
    if (pk_is_neg_2c_wg(bf)) { pk_neg_wg(bd); pk_reduce_to_canonical_wg(bd); }
    var dd: BigInt = pk_to_bigint_wg(bd);
    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&dd, &r_cubed);
}
