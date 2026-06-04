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

// Fused super-kernel for the bin-packed pair-tree MSM bucket-accumulate.
//
// Combines marshal + disjoint + scatter into one kernel. Each thread t
// handles one pair_block of S pairs (a "pair_block" = the unit of fused
// affine-add work the level loop batches through a shared inversion):
//   1. Read 2*S source indices from pair_block_plan (idx_l, idx_r per slot).
//   2. Read S destination indices from scatter_plan.
//   3. Load S pair-x values from active_sums_old, compute S dx values
//      and forward prefix product.
//   4. Single field inversion on the prefix product.
//   5. Inverse pass: per slot k from S-1 down to 0, derive
//      inv_dx[k] = 1/dx_k from the running inverse and write it back to
//      pref_scratch. The running inverse is loop-carried only here.
//   6. Backward peel: per slot k, read inv_dx[k]:
//        - load .x and .y for both operands
//        - lean affine add -> R_x, R_y
//        - write directly to active_sums_new at scatter_plan[t*S + k]
//
// Field elements are 8x u32 throughout (Lever 2); see field8_funcs.
//
// PARAMS:
//   params.x = total_pair_blocks  (active threads, one per pair_block)
//   params.y = M_old              (active_sums_old vec4-stride length)
//   params.z = M_new              (active_sums_new vec4-stride length)
//
// Layout (both active_sums buffers): 2 planes (P.x, P.y), PG=2 vec4 per
// element. plane_p flat vec4 base = p * PG * M, element e at offset
// PG * e.

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       pair_block_plan:      array<u32>;
@group(0) @binding(1) var<storage, read>       scatter_plan:    array<u32>;
{{#l0_index_mode}}
// Lever B: at level 0 active_sums_old is a flat (point index | sign<<31)
// array; the operand points are gathered from the pool (point_x/point_y).
@group(0) @binding(2) var<storage, read>       active_sums_old: array<u32>;
{{/l0_index_mode}}
{{^l0_index_mode}}
@group(0) @binding(2) var<storage, read>       active_sums_old: array<vec4<u32>>;
{{/l0_index_mode}}
@group(0) @binding(3) var<storage, read_write> active_sums_new: array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             params:          vec4<u32>;
@group(0) @binding(5) var<storage, read_write> pref_scratch:    array<vec4<u32>>;
{{#l0_index_mode}}
@group(0) @binding(6) var<storage, read>       point_x:         array<vec4<u32>>;
@group(0) @binding(7) var<storage, read>       point_y:         array<vec4<u32>>;
{{/l0_index_mode}}

{{#l0_index_mode}}
const L0_SIGN_BIT: u32 = 0x80000000u;
const L0_IDX_MASK: u32 = 0x7fffffffu;

// Level-0 operand load: active_sums_old[idx] is (point index | sign<<31);
// gather the coordinate from the pool. `M` is unused here.
fn load_active_x(idx: u32, M: u32) -> array<u32, 8> {
    let pt = active_sums_old[idx] & L0_IDX_MASK;
    let q0 = point_x[2u * pt];
    let q1 = point_x[2u * pt + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_active_y(idx: u32, M: u32) -> array<u32, 8> {
    let packed = active_sums_old[idx];
    let pt = packed & L0_IDX_MASK;
    let q0 = point_y[2u * pt];
    let q1 = point_y[2u * pt + 1u];
    let y: array<u32, 8> = array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
    if ((packed & L0_SIGN_BIT) == 0u) {
        return y;
    }
    // Lever D: negate y on the fly (-y = 0 - y mod p) — the level-0 point
    // pool carries no precomputed -y plane.
    let zero: array<u32, 8> = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    return fr_sub_f8(zero, y);
}
{{/l0_index_mode}}
{{^l0_index_mode}}
fn load_active_x(idx: u32, M: u32) -> array<u32, 8> {
    let base = 0u * PG * M + PG * idx;
    let q0 = active_sums_old[base + 0u];
    let q1 = active_sums_old[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_active_y(idx: u32, M: u32) -> array<u32, 8> {
    let base = 1u * PG * M + PG * idx;
    let q0 = active_sums_old[base + 0u];
    let q1 = active_sums_old[base + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
{{/l0_index_mode}}

fn store_active_new(plane: u32, idx: u32, M: u32, val: array<u32, 8>) {
    let base = plane * PG * M + PG * idx;
    active_sums_new[base + 0u] = vec4<u32>(val[0], val[1], val[2], val[3]);
    active_sums_new[base + 1u] = vec4<u32>(val[4], val[5], val[6], val[7]);
}

// pref_scratch holds the forward prefix products (then the per-slot
// inverses), 8x u32 = two vec4 per entry. Thread-major — global slot =
// t*S + k — so each thread's S entries are contiguous and stay
// cache-resident across the forward/backward gap.
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
    let T = params.x;
    let M_old = params.y;
    let M_new = params.z;
    let t = gid.x{{#tiled}} + params.w{{/tiled}};
    if (t >= T) { return; }

    // pref_scratch index. Lever A (tiled) sizes pref_scratch to a single
    // tile of T_TILE threads, so it is indexed by the tile-local thread id
    // (gid.x); params.w carries the tile's global base. Untiled callers
    // pass params.w = 0 and pref_scratch spans all T threads.
{{#tiled}}
    let pref_base = gid.x * S;
{{/tiled}}
{{^tiled}}
    let pref_base = t * S;
{{/tiled}}

    let block_base = 2u * S * t;

    // Forward: compute S dx values and accumulate the prefix product.
    var acc: array<u32, 8> = get_r_f8();
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let idx_l = pair_block_plan[block_base + 2u * k + 0u];
        let idx_r = pair_block_plan[block_base + 2u * k + 1u];
        let p_lx: array<u32, 8> = load_active_x(idx_l, M_old);
        let p_rx: array<u32, 8> = load_active_x(idx_r, M_old);
        let dx: array<u32, 8> = fr_sub_f8(p_rx, p_lx);
        if (k == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product_f8(acc, dx);
        }
        store_pref(pref_base + k, acc);
    }

    // Single inversion per pair_block. The safegcd inverse is 20x13-limb; the
    // accumulate is 8x u32, so expand on the way in and contract the
    // result — one conversion pair per pair_block.
    var acc20: BigInt = unpack256_to_limbs(acc);
    var inv20: BigInt = {{ inv_fn }}(acc20);
    var inv: array<u32, 8> = pack_limbs_to_256(&inv20);

{{^merged_peel}}
    // Inverse pass: walk k descending, derive inv_dx[k] = 1/dx_k from the
    // running inverse + the stored forward prefix products, and write it
    // back into pref_scratch slot k. The running `inv` is loop-carried
    // only in this multiply-only loop, so it is NOT live across the
    // affine-add peel below. store_pref(k) is safe: a later (smaller-k)
    // iteration only reads slots < k, an earlier one only wrote slots > k.
    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;
        var inv_dx: array<u32, 8>;
        if (k == 0u) {
            inv_dx = inv;
        } else {
            let pp: array<u32, 8> = load_pref(pref_base + (k - 1u));
            inv_dx = montgomery_product_f8(inv, pp);
            // Advance the running inverse by dx_k for the next iteration;
            // dx_k is recomputed from the slot's x-coordinates.
            let idx_l = pair_block_plan[block_base + 2u * k + 0u];
            let idx_r = pair_block_plan[block_base + 2u * k + 1u];
            let p_lx: array<u32, 8> = load_active_x(idx_l, M_old);
            let p_rx: array<u32, 8> = load_active_x(idx_r, M_old);
            let dx_back: array<u32, 8> = fr_sub_f8(p_rx, p_lx);
            inv = montgomery_product_f8(inv, dx_back);
        }
        store_pref(pref_base + k, inv_dx);
    }

    // Backward peel: emit S pair sums, scatter to active_sums_new. Reads
    // the per-slot inverse inv_dx[k] from pref_scratch — no running
    // inverse is live across the affine add. Each coordinate is loaded
    // just before first use to minimise the simultaneously-live set.
    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;
        let idx_l = pair_block_plan[block_base + 2u * k + 0u];
        let idx_r = pair_block_plan[block_base + 2u * k + 1u];

        let inv_dx: array<u32, 8> = load_pref(pref_base + k);

        // lambda = (p_ry - p_ly) / dx_k.
        let p_ly: array<u32, 8> = load_active_y(idx_l, M_old);
        let p_ry: array<u32, 8> = load_active_y(idx_r, M_old);
        var lambda: array<u32, 8> = fr_sub_f8(p_ry, p_ly);
        lambda = montgomery_product_f8(lambda, inv_dx);

        // r_x = lambda^2 - p_lx - p_rx.
        let p_lx: array<u32, 8> = load_active_x(idx_l, M_old);
        let p_rx: array<u32, 8> = load_active_x(idx_r, M_old);
        var r_x: array<u32, 8> = montgomery_product_f8(lambda, lambda);
        let x_sum: array<u32, 8> = fr_add_f8(p_lx, p_rx);
        r_x = fr_sub_f8(r_x, x_sum);

        // r_y = lambda * (p_lx - r_x) - p_ly.
        var r_y: array<u32, 8> = fr_sub_f8(p_lx, r_x);
        r_y = montgomery_product_f8(lambda, r_y);
        r_y = fr_sub_f8(r_y, p_ly);

        let dst_idx = scatter_plan[t * S + k];
        store_active_new(0u, dst_idx, M_new, r_x);
        store_active_new(1u, dst_idx, M_new, r_y);
    }
{{/merged_peel}}
{{#merged_peel}}
    // Merged inverse + peel (Apple/big-register-file variant). One descending
    // pass derives inv_dx[k] AND emits the pair sum in the same iteration, so
    // the x-coordinates load ONCE (vs the split path's 3x) and inv_dx is never
    // round-tripped through pref_scratch. The cost is `inv` staying live across
    // the affine add (~8 extra registers) — affordable on Apple, spill-prone on
    // Adreno/Mali, hence gated. pref_scratch is read-only here (forward prefix
    // products); the inversion `inv` advances in-loop by dx_k.
    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;
        let idx_l = pair_block_plan[block_base + 2u * k + 0u];
        let idx_r = pair_block_plan[block_base + 2u * k + 1u];

        // inv_dx[k] = 1/dx_k, captured before `inv` advances.
        var inv_dx: array<u32, 8>;
        if (k == 0u) {
            inv_dx = inv;
        } else {
            let pp: array<u32, 8> = load_pref(pref_base + (k - 1u));
            inv_dx = montgomery_product_f8(inv, pp);
        }

        // x-coordinates: one load, reused for the inverse advance and r_x/r_y.
        let p_lx: array<u32, 8> = load_active_x(idx_l, M_old);
        let p_rx: array<u32, 8> = load_active_x(idx_r, M_old);

        // Advance the running inverse by dx_k for the next (smaller-k) slot.
        if (k != 0u) {
            let dx_k: array<u32, 8> = fr_sub_f8(p_rx, p_lx);
            inv = montgomery_product_f8(inv, dx_k);
        }

        // lambda = (p_ry - p_ly) / dx_k.
        let p_ly: array<u32, 8> = load_active_y(idx_l, M_old);
        let p_ry: array<u32, 8> = load_active_y(idx_r, M_old);
        var lambda: array<u32, 8> = fr_sub_f8(p_ry, p_ly);
        lambda = montgomery_product_f8(lambda, inv_dx);

        // r_x = lambda^2 - p_lx - p_rx.
        var r_x: array<u32, 8> = montgomery_product_f8(lambda, lambda);
        let x_sum: array<u32, 8> = fr_add_f8(p_lx, p_rx);
        r_x = fr_sub_f8(r_x, x_sum);

        // r_y = lambda * (p_lx - r_x) - p_ly.
        var r_y: array<u32, 8> = fr_sub_f8(p_lx, r_x);
        r_y = montgomery_product_f8(lambda, r_y);
        r_y = fr_sub_f8(r_y, p_ly);

        let dst_idx = scatter_plan[t * S + k];
        store_active_new(0u, dst_idx, M_new, r_x);
        store_active_new(1u, dst_idx, M_new, r_y);
    }
{{/merged_peel}}

    {{{ recompile }}}
}
