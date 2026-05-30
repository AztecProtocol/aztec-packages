{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Streaming bucket accumulator. Each of T threads owns S pair-pointer
// slots, pulls work items from a pre-built queue, and performs batched
// affine addition with one field inversion per S adds.
//
// params.x = NUM_THREADS
// params.y = M_acc   (= T * S, acc_buf stride)
// params.z = IDLE_ANCHOR (= batchSlots, index into l0_index for the pad-trio)
// params.w = M_buckets  (= B_TOTAL, bucket_sums stride)

const S: u32 = {{ s }}u;
const PG: u32 = 2u;
const QUEUE_HEADER_LEN: u32 = {{ queue_header_len }}u;
const L0_SIGN_BIT: u32 = 0x80000000u;
const L0_IDX_MASK: u32 = 0x7fffffffu;
const IDLE_DEST: u32 = 0x40000000u;
const PARTIAL_BIT: u32 = 0x80000000u;
// GLV on-the-fly: value index >= GLV_HALF is a phi-term (gather idx - GLV_HALF,
// x *= Montgomery(beta)). Sentinel GLV_HALF disables it on the non-GLV path.
const GLV_HALF: u32 = {{ glv_half }}u;
fn beta_mont_f8() -> array<u32, 8> { return array<u32, 8>({{ beta8_csv }}); }

@group(0) @binding(0) var<storage, read>       queue_buf:     array<u32>;
@group(0) @binding(1) var<storage, read>       point_x:       array<vec4<u32>>;
@group(0) @binding(2) var<storage, read>       point_y:       array<vec4<u32>>;
@group(0) @binding(3) var<storage, read>       l0_index:      array<u32>;
@group(0) @binding(4) var<storage, read_write> acc_buf:       array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> pref_scratch:  array<vec4<u32>>;
@group(0) @binding(6) var<storage, read_write> bucket_sums:   array<vec4<u32>>;
@group(0) @binding(7) var<storage, read_write> partials_buf:  array<vec4<u32>>;
@group(0) @binding(8) var<uniform>             params:        vec4<u32>;

fn load_pt_x(cursor: u32) -> array<u32, 8> {
    let packed = l0_index[cursor];
    let raw = packed & L0_IDX_MASK;
    let is_phi = raw >= GLV_HALF;
    let pt = select(raw, raw - GLV_HALF, is_phi);
    let q0 = point_x[2u * pt];
    let q1 = point_x[2u * pt + 1u];
    let x = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    if (is_phi) { return montgomery_product_f8(beta_mont_f8(), x); }
    return x;
}

fn load_pt_y(cursor: u32) -> array<u32, 8> {
    let packed = l0_index[cursor];
    let raw = packed & L0_IDX_MASK;
    let pt = select(raw, raw - GLV_HALF, raw >= GLV_HALF);
    let q0 = point_y[2u * pt];
    let q1 = point_y[2u * pt + 1u];
    let y = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    if ((packed & L0_SIGN_BIT) == 0u) {
        return y;
    }
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    return fr_sub_f8(zero, y);
}

fn load_acc_x(slot: u32, M: u32) -> array<u32, 8> {
    let base = PG * slot;
    let q0 = acc_buf[base + 0u];
    let q1 = acc_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_acc_y(slot: u32, M: u32) -> array<u32, 8> {
    let base = PG * M + PG * slot;
    let q0 = acc_buf[base + 0u];
    let q1 = acc_buf[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_acc(slot: u32, M: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = PG * slot;
    acc_buf[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    acc_buf[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M + PG * slot;
    acc_buf[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    acc_buf[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
}

fn store_bucket_sum(slot: u32, M: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = PG * slot;
    bucket_sums[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    bucket_sums[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M + PG * slot;
    bucket_sums[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    bucket_sums[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
}

fn store_partial(slot: u32, M: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = PG * slot;
    partials_buf[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    partials_buf[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M + PG * slot;
    partials_buf[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    partials_buf[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
}

fn store_pref(slot: u32, val: array<u32, 8>) {
    let base = 2u * slot;
    pref_scratch[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    pref_scratch[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

fn load_pref(slot: u32) -> array<u32, 8> {
    let base = 2u * slot;
    let q0 = pref_scratch[base + 0u];
    let q1 = pref_scratch[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t = gid.x;
    let NUM_THREADS = params.x;
    let M_acc = params.y;
    let IDLE_ANCHOR = params.z;
    let M_buckets = params.w;
    let M_partials = 2u * NUM_THREADS;

    if (t >= NUM_THREADS) { return; }

    let pref_base = t * S;

    let q_start = queue_buf[2u * t];
    let q_count = queue_buf[2u * t + 1u];

    var cursor: array<u32, {{ s }}>;
    var end_cursor: array<u32, {{ s }}>;
    var is_first: array<u32, {{ s }}>;
    var dest: array<u32, {{ s }}>;
    // Tracks slots that have exhausted the queue. Done slots participate in
    // the batched inversion (using IDLE anchor points for non-zero dx) but
    // their affine-add results are discarded.
    var slot_done: array<u32, {{ s }}>;
    var qhead: u32 = 0u;

    for (var k: u32 = 0u; k < S; k = k + 1u) {
        var found = false;
        while (!found && qhead < q_count) {
            let base = q_start + qhead * 3u;
            let sc = queue_buf[QUEUE_HEADER_LEN + base + 0u];
            let ec = queue_buf[QUEUE_HEADER_LEN + base + 1u];
            let dp = queue_buf[QUEUE_HEADER_LEN + base + 2u];
            qhead += 1u;
            if (ec - sc == 1u && (dp & IDLE_DEST) == 0u) {
                let px = load_pt_x(sc);
                let py = load_pt_y(sc);
                if ((dp & PARTIAL_BIT) != 0u) {
                    let ps = dp & 0x3FFFFFFFu;
                    store_partial(ps, M_partials, px, py);
                } else {
                    store_bucket_sum(dp, M_buckets, px, py);
                }
            } else {
                cursor[k] = sc;
                end_cursor[k] = ec;
                dest[k] = dp;
                is_first[k] = 1u;
                slot_done[k] = 0u;
                found = true;
            }
        }
        if (!found) {
            cursor[k] = IDLE_ANCHOR;
            end_cursor[k] = IDLE_ANCHOR + 2u;
            dest[k] = IDLE_DEST;
            is_first[k] = 1u;
            slot_done[k] = 1u;
        }
    }

    loop {
        var any_active: bool = false;
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            if (slot_done[k] == 0u) { any_active = true; }
        }
        if (!any_active) { break; }

        // Forward prefix: compute dx for each slot. Done slots use IDLE
        // anchor points (guaranteed distinct x-coords on BN254 SRS) to
        // keep the prefix product non-zero.
        var acc: array<u32, 8> = get_r_f8();
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            var p_lx: array<u32, 8>;
            var p_rx: array<u32, 8>;
            if (slot_done[k] == 1u) {
                p_lx = load_pt_x(IDLE_ANCHOR);
                p_rx = load_pt_x(IDLE_ANCHOR + 1u);
            } else if (is_first[k] == 1u) {
                p_lx = load_pt_x(cursor[k]);
                p_rx = load_pt_x(cursor[k] + 1u);
            } else {
                p_lx = load_acc_x(t * S + k, M_acc);
                p_rx = load_pt_x(cursor[k]);
            }
            let dx = fr_sub_f8(p_rx, p_lx);
            if (k == 0u) {
                acc = dx;
            } else {
                acc = montgomery_product_f8(acc, dx);
            }
            store_pref(pref_base + k, acc);
        }

        var acc20 = unpack256_to_limbs(acc);
        var inv20 = {{ inv_fn }}(acc20);
        var inv = pack_limbs_to_256(&inv20);

        // Inverse pass: derive per-slot 1/dx.
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;
            var inv_dx: array<u32, 8>;
            if (k == 0u) {
                inv_dx = inv;
            } else {
                let pp = load_pref(pref_base + (k - 1u));
                inv_dx = montgomery_product_f8(inv, pp);
                var p_lx_b: array<u32, 8>;
                var p_rx_b: array<u32, 8>;
                if (slot_done[k] == 1u) {
                    p_lx_b = load_pt_x(IDLE_ANCHOR);
                    p_rx_b = load_pt_x(IDLE_ANCHOR + 1u);
                } else if (is_first[k] == 1u) {
                    p_lx_b = load_pt_x(cursor[k]);
                    p_rx_b = load_pt_x(cursor[k] + 1u);
                } else {
                    p_lx_b = load_acc_x(t * S + k, M_acc);
                    p_rx_b = load_pt_x(cursor[k]);
                }
                let dx_b = fr_sub_f8(p_rx_b, p_lx_b);
                inv = montgomery_product_f8(inv, dx_b);
            }
            store_pref(pref_base + k, inv_dx);
        }

        // Backward peel: affine add + retire / store.
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;

            if (slot_done[k] == 1u) { continue; }

            var p_lx: array<u32, 8>;
            var p_ly: array<u32, 8>;
            var p_rx: array<u32, 8>;
            var p_ry: array<u32, 8>;
            if (is_first[k] == 1u) {
                p_lx = load_pt_x(cursor[k]);
                p_ly = load_pt_y(cursor[k]);
                p_rx = load_pt_x(cursor[k] + 1u);
                p_ry = load_pt_y(cursor[k] + 1u);
                cursor[k] += 2u;
            } else {
                p_lx = load_acc_x(t * S + k, M_acc);
                p_ly = load_acc_y(t * S + k, M_acc);
                p_rx = load_pt_x(cursor[k]);
                p_ry = load_pt_y(cursor[k]);
                cursor[k] += 1u;
            }

            let inv_dx = load_pref(pref_base + k);

            var lambda = fr_sub_f8(p_ry, p_ly);
            lambda = montgomery_product_f8(lambda, inv_dx);

            var r_x = montgomery_product_f8(lambda, lambda);
            let x_sum = fr_add_f8(p_lx, p_rx);
            r_x = fr_sub_f8(r_x, x_sum);

            var r_y = fr_sub_f8(p_lx, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, p_ly);

            if (cursor[k] >= end_cursor[k]) {
                let dp = dest[k];
                if ((dp & IDLE_DEST) != 0u) {
                    // IDLE — discard.
                } else if ((dp & PARTIAL_BIT) != 0u) {
                    let ps = dp & 0x3FFFFFFFu;
                    store_partial(ps, M_partials, r_x, r_y);
                } else {
                    store_bucket_sum(dp, M_buckets, r_x, r_y);
                }
                var refilled = false;
                while (!refilled && qhead < q_count) {
                    let base2 = q_start + qhead * 3u;
                    let sc2 = queue_buf[QUEUE_HEADER_LEN + base2 + 0u];
                    let ec2 = queue_buf[QUEUE_HEADER_LEN + base2 + 1u];
                    let dp2 = queue_buf[QUEUE_HEADER_LEN + base2 + 2u];
                    qhead += 1u;
                    if (ec2 - sc2 == 1u && (dp2 & IDLE_DEST) == 0u) {
                        let px2 = load_pt_x(sc2);
                        let py2 = load_pt_y(sc2);
                        if ((dp2 & PARTIAL_BIT) != 0u) {
                            let ps2 = dp2 & 0x3FFFFFFFu;
                            store_partial(ps2, M_partials, px2, py2);
                        } else {
                            store_bucket_sum(dp2, M_buckets, px2, py2);
                        }
                    } else {
                        cursor[k] = sc2;
                        end_cursor[k] = ec2;
                        dest[k] = dp2;
                        is_first[k] = 1u;
                        refilled = true;
                    }
                }
                if (!refilled) {
                    slot_done[k] = 1u;
                }
            } else {
                store_acc(t * S + k, M_acc, r_x, r_y);
                is_first[k] = 0u;
            }
        }
    }

    {{{ recompile }}}
}
