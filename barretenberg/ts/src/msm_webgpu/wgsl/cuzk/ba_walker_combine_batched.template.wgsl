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

// Optimal walker_combine main kernel: cross-bucket batched-inversion sum.
//
// Each thread handles S buckets from active_buckets. Each bucket has count
// >= 2 partials. Per outer iter: forward prefix (S dx) → ONE safegcd →
// fused inverse+peel (S affine adds, one per bucket). One outer iter
// advances each not-done slot by ONE add. Iteration count per thread =
// max(count[k]-1) across the thread's S slots.
//
// IMPORTANT TUNING (from stream_walker measurements on M4 Pro):
//   - pref_scratch lives in DEVICE STORAGE in the tail of partials_buf
//     (not var<workgroup>). Workgroup mem was ~5 ms slower in stream_walker.
//   - Inverse pass and backward peel are FUSED — inv_dx stays in registers,
//     no store/reload through pref_scratch.
//   - Operand coords (p_lx, p_rx, p_ly, p_ry) loaded ONCE per slot per iter.
//
// params.x = unused (NUM_ACTIVE read from active_count buffer)
// params.y = IDLE_ANCHOR (l0_index entry for pad point pair)
// params.z = M_buckets   (bucket_sums plane stride)
// params.w = M_partials  (partials_buf plane stride; pref tail starts at 4*M_partials)

const S: u32 = {{ s }}u;
const TPB: u32 = {{ workgroup_size }}u;
const PG: u32 = 2u;
const L0_SIGN_BIT: u32 = 0x80000000u;
const L0_IDX_MASK: u32 = 0x7fffffffu;

@group(0) @binding(0) var<storage, read>       active_buckets:  array<u32>;
@group(0) @binding(1) var<storage, read>       active_count:    array<u32>;
@group(0) @binding(2) var<storage, read>       partial_count:   array<u32>;
@group(0) @binding(3) var<storage, read>       partial_offset:  array<u32>;
@group(0) @binding(4) var<storage, read>       partial_layout:  array<u32>;
@group(0) @binding(5) var<storage, read>       l0_index:        array<u32>;
@group(0) @binding(6) var<storage, read>       point_x:         array<vec4<u32>>;
@group(0) @binding(7) var<storage, read>       point_y:         array<vec4<u32>>;
@group(0) @binding(8) var<storage, read_write> partials_buf:    array<vec4<u32>>;
@group(0) @binding(9) var<storage, read_write> bucket_sums:     array<vec4<u32>>;
@group(0) @binding(10) var<uniform>            params:          vec4<u32>;

fn load_partial_x(slot: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * slot + 0u];
    let q1 = partials_buf[PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_partial_y(slot: u32, M: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * M + PG * slot + 0u];
    let q1 = partials_buf[PG * M + PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_pt_x(cursor: u32) -> array<u32, 8> {
    let packed = l0_index[cursor];
    let pt = packed & L0_IDX_MASK;
    let q0 = point_x[2u * pt];
    let q1 = point_x[2u * pt + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn store_bucket_sum(bid: u32, M: u32, x_val: array<u32, 8>, y_val: array<u32, 8>) {
    let bx = PG * bid;
    bucket_sums[bx + 0u] = vec4<u32>(x_val[0], x_val[1], x_val[2], x_val[3]);
    bucket_sums[bx + 1u] = vec4<u32>(x_val[4], x_val[5], x_val[6], x_val[7]);
    let by = PG * M + PG * bid;
    bucket_sums[by + 0u] = vec4<u32>(y_val[0], y_val[1], y_val[2], y_val[3]);
    bucket_sums[by + 1u] = vec4<u32>(y_val[4], y_val[5], y_val[6], y_val[7]);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t = gid.x;
    let NUM_ACTIVE = active_count[0];
    let task_base = t * S;

    // Early exit if this thread's S buckets are all out of range.
    if (task_base >= NUM_ACTIVE) { return; }

    let IDLE_ANCHOR = params.y;
    let M_buckets = params.z;
    let M_partials = params.w;

    // Per-slot state.
    var bid:        array<u32, {{ s }}>;
    var cnt:        array<u32, {{ s }}>;
    var off:        array<u32, {{ s }}>;
    var pos:        array<u32, {{ s }}>;
    var slot_done:  array<u32, {{ s }}>;
    var acc_x:      array<array<u32, 8>, {{ s }}>;
    var acc_y:      array<array<u32, 8>, {{ s }}>;
    // Prefix products held in PRIVATE memory (registers if compiler permits).
    // S-1 entries needed (the last one is consumed in-register by the inverter).
    var pref:       array<array<u32, 8>, {{ s }}>;

    // Init slots. Hot buckets (N > HOT_THRESHOLD) are routed to the pair-tree
    // kernel instead — skip them here.
    const HOT_THRESHOLD: u32 = 8u;
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let task_id = task_base + k;
        if (task_id >= NUM_ACTIVE) {
            slot_done[k] = 1u;
            continue;
        }
        bid[k] = active_buckets[task_id];
        cnt[k] = partial_count[bid[k]];
        if (cnt[k] > HOT_THRESHOLD) {
            slot_done[k] = 1u;
            continue;
        }
        off[k] = partial_offset[bid[k]];
        pos[k] = 0u;
        let slot0 = partial_layout[off[k]];
        acc_x[k] = load_partial_x(slot0);
        acc_y[k] = load_partial_y(slot0, M_partials);
        slot_done[k] = 0u;
    }

    // Main loop.
    loop {
        var any_active: bool = false;
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            if (slot_done[k] == 0u) { any_active = true; }
        }
        if (!any_active) { break; }

        // === Forward prefix: compute dx per slot, store prefix products. ===
        // Skip the final store (it's only consumed in-register by the inverter).
        var prefix: array<u32, 8> = get_r_f8();
        for (var k: u32 = 0u; k < S; k = k + 1u) {
            var p_rx: array<u32, 8>;
            var p_lx: array<u32, 8>;
            if (slot_done[k] == 1u) {
                p_lx = load_pt_x(IDLE_ANCHOR);
                p_rx = load_pt_x(IDLE_ANCHOR + 1u);
            } else {
                p_lx = acc_x[k];
                p_rx = load_partial_x(partial_layout[off[k] + pos[k] + 1u]);
            }
            let dx = fr_sub_f8(p_rx, p_lx);
            if (k == 0u) {
                prefix = dx;
            } else {
                prefix = montgomery_product_f8(prefix, dx);
            }
            if (k + 1u < S) {
                pref[k] = prefix;
            }
        }

        // === Inversion ===
        var acc20 = unpack256_to_limbs(prefix);
        var inv20 = {{ inv_fn }}(acc20);
        var inv = pack_limbs_to_256(&inv20);

        // === FUSED inverse + backward peel: inv_dx stays in registers. ===
        for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
            let k = S - 1u - jj;

            // Phase 1: load operand X (used for both inv-chain update and the affine add).
            var p_lx: array<u32, 8>;
            var p_rx: array<u32, 8>;
            if (slot_done[k] == 1u) {
                p_lx = load_pt_x(IDLE_ANCHOR);
                p_rx = load_pt_x(IDLE_ANCHOR + 1u);
            } else {
                p_lx = acc_x[k];
                p_rx = load_partial_x(partial_layout[off[k] + pos[k] + 1u]);
            }

            // Phase 2: derive inv_dx[k] in register; advance running inv.
            var inv_dx: array<u32, 8>;
            if (k == 0u) {
                inv_dx = inv;
            } else {
                let pp = pref[k - 1u];
                inv_dx = montgomery_product_f8(inv, pp);
                let dx_b = fr_sub_f8(p_rx, p_lx);
                inv = montgomery_product_f8(inv, dx_b);
            }

            // Phase 3: idle slots contributed dx_k; nothing more to do.
            if (slot_done[k] == 1u) { continue; }

            // Phase 4: load operand Y for the affine add.
            let next_slot = partial_layout[off[k] + pos[k] + 1u];
            let p_ly = acc_y[k];
            let p_ry = load_partial_y(next_slot, M_partials);

            // Phase 5: affine add using inv_dx (in register).
            var lambda = fr_sub_f8(p_ry, p_ly);
            lambda = montgomery_product_f8(lambda, inv_dx);
            var r_x = montgomery_product_f8(lambda, lambda);
            let x_sum = fr_add_f8(p_lx, p_rx);
            r_x = fr_sub_f8(r_x, x_sum);
            var r_y = fr_sub_f8(p_lx, r_x);
            r_y = montgomery_product_f8(lambda, r_y);
            r_y = fr_sub_f8(r_y, p_ly);

            acc_x[k] = r_x;
            acc_y[k] = r_y;

            pos[k] = pos[k] + 1u;
            if (pos[k] >= cnt[k] - 1u) {
                slot_done[k] = 1u;
                store_bucket_sum(bid[k], M_buckets, r_x, r_y);
            }
        }
    }

    {{{ recompile }}}
}
