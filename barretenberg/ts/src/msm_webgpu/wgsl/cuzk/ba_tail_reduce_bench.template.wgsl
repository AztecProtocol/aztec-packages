{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

// Tail kernel for the bench-msm-tree pipeline: reduces a single
// tail-sized bucket (count < 2*S) to one sum per thread. Each thread
// reads its bucket's count points sequentially from the SoA-packed
// point pool and accumulates them via direct affine adds (one
// fr_inv_by_a per step).
//
// Pragmatic v1 — no batched inversion across threads. Each step pays
// one full fr_inv_by_a (~80 mont mul equivalents). For typical
// Poisson(lambda=16) MSM workloads, tail buckets carry a minority of
// total work (~10-30%); the contribution to overall bucket-accumulate
// ns/in-pt is small enough that this simple design is acceptable for
// a v1 complete-replacement kernel set. A workgroup-scan
// batched-inversion variant is a follow-on optimisation that would
// drop tail cost to ~25 ns/add (matching the main pair-tree).
//
// Bindings:
//   binding 0: csr_indices  — sorted point indices, 1-based (index 0 reserved).
//   binding 1: tail_plan    — three u32 per tail thread:
//                             [bucket_id, csr_start, count].
//   binding 2: point_pool   — SoA-packed pool (2 planes, PG=2 vec4/elem).
//   binding 3: bucket_sums  — SoA-packed output (2 planes, PG=2 vec4/bucket),
//                             one packed point per bucket. Pre-zeroed by host.
//   binding 4: params       — params.x=T (tail thread count),
//                             params.y=N (pool size),
//                             params.z=B (bucket_sums slot count).
//
// Bounded loop: the per-thread accumulate loop iterates up to compile-
// time TAIL_CAP = 2*S - 1, breaking early when i >= count. No
// data-dependent unbounded loops.

const TAIL_CAP: u32 = {{ tail_cap }}u;
const PG: u32 = 2u;

@group(0) @binding(0) var<storage, read>       csr_indices:  array<u32>;
@group(0) @binding(1) var<storage, read>       tail_plan:    array<u32>;
@group(0) @binding(2) var<storage, read>       point_pool:   array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> bucket_sums:  array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             params:       vec4<u32>;

fn load_pool(plane: u32, idx: u32, N: u32) -> BigInt {
    let plane_base = plane * PG * N;
    let base = plane_base + PG * idx;
    let q0 = point_pool[base + 0u];
    let q1 = point_pool[base + 1u];
    var w: array<u32, 8>;
    w[0] = q0.x; w[1] = q0.y; w[2] = q0.z; w[3] = q0.w;
    w[4] = q1.x; w[5] = q1.y; w[6] = q1.z; w[7] = q1.w;
    return unpack256_to_limbs(w);
}

fn store_bucket(plane: u32, b: u32, B: u32, val: ptr<function, BigInt>) {
    let plane_base = plane * PG * B;
    let base = plane_base + PG * b;
    let w = pack_limbs_to_256(val);
    bucket_sums[base + 0u] = vec4<u32>(w[0], w[1], w[2], w[3]);
    bucket_sums[base + 1u] = vec4<u32>(w[4], w[5], w[6], w[7]);
}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let T = params.x;
    let N = params.y;
    let B = params.z;

    let t = gid.x;
    if (t >= T) { return; }

    let bucket_id = tail_plan[3u * t + 0u];
    let csr_start = tail_plan[3u * t + 1u];
    let count     = tail_plan[3u * t + 2u];

    if (count == 0u) { return; }

    var acc_x: BigInt = load_pool(0u, csr_indices[csr_start], N);
    var acc_y: BigInt = load_pool(1u, csr_indices[csr_start], N);

    for (var i: u32 = 1u; i < TAIL_CAP; i = i + 1u) {
        if (i >= count) { break; }
        let pt_idx = csr_indices[csr_start + i];
        var p_x: BigInt = load_pool(0u, pt_idx, N);
        var p_y: BigInt = load_pool(1u, pt_idx, N);
        var dx: BigInt = fr_sub(&p_x, &acc_x);
        var inv_dx: BigInt = fr_inv_by_a(dx);
        var dy: BigInt = fr_sub(&p_y, &acc_y);
        var lambda: BigInt = montgomery_product(&dy, &inv_dx);
        var lambda_sq: BigInt = montgomery_product(&lambda, &lambda);
        var r_x: BigInt = fr_sub(&lambda_sq, &acc_x);
        r_x = fr_sub(&r_x, &p_x);
        var r_y: BigInt = fr_sub(&acc_x, &r_x);
        r_y = montgomery_product(&lambda, &r_y);
        r_y = fr_sub(&r_y, &acc_y);
        acc_x = r_x;
        acc_y = r_y;
    }

    store_bucket(0u, bucket_id, B, &acc_x);
    store_bucket(1u, bucket_id, B, &acc_y);

    {{{ recompile }}}
}
