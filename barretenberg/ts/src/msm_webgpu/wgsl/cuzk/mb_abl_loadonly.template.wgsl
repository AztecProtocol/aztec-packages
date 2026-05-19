// ABLATION 1 of msm_bucket_s16: pure memory floor.
//
// Identical SoA+vec4 layout, 8192-thread launch and S=16 streamed-point
// access pattern as ba_msm_bucket_bench, but with ZERO field arithmetic
// (no montmul, no fr_sub, no fr_inv_by_a). Every loaded limb is folded
// into an XOR accumulator and written to the output so the compiler
// cannot dead-code-eliminate the coalesced loads. The (full - this)
// delta isolates everything above the bare load/store floor.

const S: u32 = {{ s }}u;
const VG: u32 = 5u; // 20 limbs / 4 = 5 vec4 groups

@group(0) @binding(0) var<storage, read>       inp:    array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       unused: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> outp:   array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             params: vec4<u32>;

fn load_be(plane_base: u32, e: u32, N: u32) -> BigInt {
    var b: BigInt;
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = inp[plane_base + v * N + e];
        b.limbs[4u * v + 0u] = q.x;
        b.limbs[4u * v + 1u] = q.y;
        b.limbs[4u * v + 2u] = q.z;
        b.limbs[4u * v + 3u] = q.w;
    }
    return b;
}

fn store_be(plane_base: u32, e: u32, N: u32, val: ptr<function, BigInt>) {
    for (var v = 0u; v < VG; v = v + 1u) {
        let q = vec4<u32>(
            (*val).limbs[4u * v + 0u],
            (*val).limbs[4u * v + 1u],
            (*val).limbs[4u * v + 2u],
            (*val).limbs[4u * v + 3u],
        );
        outp[plane_base + v * N + e] = q;
    }
}

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let N = params.x;
    let T = params.y;
    let t = gid.x;
    if (t >= T) { return; }

    let plane = VG * N;
    let ax_base = 0u * plane;
    let ay_base = 1u * plane;
    let px_base = 2u * plane;
    let py_base = 3u * plane;

    var acc_x = load_be(ax_base, t, N);
    var acc_y = load_be(ay_base, t, N);

    // Forward pass over the streamed points (same coalesced access
    // pattern as msm_bucket_s16's forward loop): XOR-fold every limb.
    var sink: BigInt;
    for (var i = 0u; i < S; i = i + 1u) {
        let e = t + i * T;
        var p_x = load_be(px_base, e, N);
        for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
            sink.limbs[w] = sink.limbs[w] ^ p_x.limbs[w] ^ acc_x.limbs[w];
        }
        acc_x = p_x;
    }

    // Backward pass: load p_x + p_y for every streamed point (matches
    // the full kernel's backward load volume) and fold them too.
    for (var jj = 0u; jj < S; jj = jj + 1u) {
        let i = S - 1u - jj;
        let e = t + i * T;
        var p_x = load_be(px_base, e, N);
        var p_y = load_be(py_base, e, N);
        for (var w = 0u; w < NUM_WORDS; w = w + 1u) {
            sink.limbs[w] = sink.limbs[w] ^ p_x.limbs[w] ^ p_y.limbs[w] ^ acc_y.limbs[w];
        }

        var r_x = sink;
        var r_y = p_y;
        store_be(0u * plane, e, N, &r_x);
        store_be(1u * plane, e, N, &r_y);
    }
}
