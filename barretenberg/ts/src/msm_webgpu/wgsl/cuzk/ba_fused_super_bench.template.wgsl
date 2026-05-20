{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// Fused super-kernel for the bin-packed pair-tree MSM bucket-accumulate.
//
// Combines marshal + disjoint + scatter into one kernel. Each thread t
// handles one chunk of S pairs:
//   1. Read 2*S source indices from chunk_plan (idx_l, idx_r per slot).
//   2. Read S destination indices from scatter_plan.
//   3. Load S pair-x values from active_sums_old, compute S dx values
//      and forward prefix product, all in registers.
//   4. Single field inversion on the prefix product.
//   5. Backward peel: per slot k from S-1 down to 0:
//        - load .x and .y for both operands
//        - lean affine add -> R_x, R_y
//        - write directly to active_sums_new at scatter_plan[t*S + k]
//        - update inv for next (smaller-k) iteration
//
// vs v2 (4 kernels: marshal, disjoint, scatter, carry): the chain_buf
// and tempOut scratch buffers are eliminated. All intermediate state
// lives in registers. Per-level dispatch count drops from 4 to 2
// (fused + carry).
//
// PARAMS:
//   params.x = T_chunks  (active threads, one per chunk)
//   params.y = M_old     (active_sums_old vec4-stride length)
//   params.z = M_new     (active_sums_new vec4-stride length)
//
// Layout (both active_sums buffers): 2 planes (P.x, P.y), PG=2 vec4 per
// element. plane_p flat vec4 base = p * PG * M, element e at offset
// PG * e.

const S: u32 = {{ s }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       chunk_plan:      array<u32>;
@group(0) @binding(1) var<storage, read>       scatter_plan:    array<u32>;
@group(0) @binding(2) var<storage, read>       active_sums_old: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> active_sums_new: array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             params:          vec4<u32>;

fn load_active_x(idx: u32, M: u32) -> BigInt {
    let plane_base = 0u * PG * M;
    let base = plane_base + PG * idx;
    let q0 = active_sums_old[base + 0u];
    let q1 = active_sums_old[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn load_active_y(idx: u32, M: u32) -> BigInt {
    let plane_base = 1u * PG * M;
    let base = plane_base + PG * idx;
    let q0 = active_sums_old[base + 0u];
    let q1 = active_sums_old[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn store_active_new(plane: u32, idx: u32, M: u32, val: ptr<function, BigInt>) {
    let plane_base = plane * PG * M;
    let base = plane_base + PG * idx;
    let w = pack_limbs_to_256(val);
    active_sums_new[base + 0u] = vec4<u32>(w[0], w[1], w[2], w[3]);
    active_sums_new[base + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = params.x;
    let M_old = params.y;
    let M_new = params.z;
    let t = gid.x;
    if (t >= T) { return; }

    let chunk_base = 2u * S * t;

    // Forward: compute S dx values and accumulate prefix product.
    // Read pair indices from chunk_plan, load .x for each operand, compute dx.
    // pref holds the prefix products PACKED (8x u32) rather than as
    // 20-limb BigInt: it is the only per-thread array that scales with
    // S, so packing it ~2.5x cuts the dominant register cost. acc stays
    // limb-form (it feeds montgomery_product directly).
    var pref: array<array<u32, 8>, {{ s }}>;
    var acc: BigInt = get_r();
    for (var k: u32 = 0u; k < S; k = k + 1u) {
        let idx_l = chunk_plan[chunk_base + 2u * k + 0u];
        let idx_r = chunk_plan[chunk_base + 2u * k + 1u];
        var p_lx: BigInt = load_active_x(idx_l, M_old);
        var p_rx: BigInt = load_active_x(idx_r, M_old);
        var dx: BigInt = fr_sub(&p_rx, &p_lx);
        if (k == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[k] = pack_limbs_to_256(&acc);
    }

    // Single inversion per chunk.
    var inv: BigInt = {{ inv_fn }}(acc);

    // Backward peel: emit S pair sums, scatter to active_sums_new.
    for (var jj: u32 = 0u; jj < S; jj = jj + 1u) {
        let k = S - 1u - jj;
        let idx_l = chunk_plan[chunk_base + 2u * k + 0u];
        let idx_r = chunk_plan[chunk_base + 2u * k + 1u];

        var p_lx: BigInt = load_active_x(idx_l, M_old);
        var p_ly: BigInt = load_active_y(idx_l, M_old);
        var p_rx: BigInt = load_active_x(idx_r, M_old);
        var p_ry: BigInt = load_active_y(idx_r, M_old);

        var inv_dx: BigInt;
        if (k == 0u) {
            inv_dx = inv;
        } else {
            var pw = pref[k - 1u];
            var pp = unpack256_to_limbs(pw);
            inv_dx = montgomery_product(&inv, &pp);
        }

        var lambda: BigInt = fr_sub(&p_ry, &p_ly);
        lambda = montgomery_product(&lambda, &inv_dx);
        var r_x: BigInt = montgomery_product(&lambda, &lambda);
        r_x = fr_sub(&r_x, &p_lx);
        r_x = fr_sub(&r_x, &p_rx);
        var r_y: BigInt = fr_sub(&p_lx, &r_x);
        r_y = montgomery_product(&lambda, &r_y);
        r_y = fr_sub(&r_y, &p_ly);

        let dst_idx = scatter_plan[t * S + k];
        store_active_new(0u, dst_idx, M_new, &r_x);
        store_active_new(1u, dst_idx, M_new, &r_y);

        if (k > 0u) {
            var dx_back: BigInt = fr_sub(&p_rx, &p_lx);
            inv = montgomery_product(&inv, &dx_back);
        }
    }

    {{{ recompile }}}
}
