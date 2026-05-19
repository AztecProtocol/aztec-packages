{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> packed_field_funcs }}

// Standalone single-dispatch microbench for the ba_rev_packed_carry
// batch-affine EC-add scheme:
//   per-thread descending suffix-product + single fr_inv_by_a +
//   ascending lean-apply, with packed 8x u32 storage at the I/O
//   boundary and 13-bit BigInt limbs in every register-resident var.
//
// Each thread independently processes BS consecutive pairs from a flat
// pool (no bucket indirection, no scheduler input). Threads in a
// workgroup share no data; the only reason for TPB threads/workgroup
// is SIMD-lockstep execution of the BY safegcd inversion so its
// latency amortises across the wave.
//
// DISPATCH
//   workgroups = TOTAL_PAIRS / (TPB * BS), threads/wg = TPB.
//   Thread gid = wid.x * TPB + lid.x owns pairs [gid*BS, (gid+1)*BS).
//
// PHASES (entirely per-thread; no workgroup memory)
//   A) Descending suffix-product over BS pairs. dx_k = Q.x_k - P.x_k.
//      suf[k] = product_{j >= k} dx_j. acc threads through dx_{BS-1},
//      dx_{BS-2}, ..., dx_0.
//   B) Single inv = fr_inv_by_a(suf[0]).
//   C) Ascending lean apply: for k = 0..BS-1
//        inv_dx_k = (k+1 < BS) ? inv * suf[k+1] : inv
//        lambda   = (Q.y - P.y) * inv_dx_k
//        R.x      = lambda^2 - P.x - Q.x
//        R.y      = lambda * (P.x - R.x) - P.y
//        if k+1 < BS: inv = inv * dx_k   (forward-propagate)
//
// LOOP BOUNDS — every loop bound is a compile-time Mustache const
// (BS, NUM_WORDS). No data-dependent unbounded loops.

const TPB: u32 = {{ tpb }}u;
const BS: u32  = {{ bs }}u;

@group(0) @binding(0) var<storage, read>       inputs_p_x: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read>       inputs_p_y: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read>       inputs_q_x: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read>       inputs_q_y: array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> outputs_x:  array<vec4<u32>>;
@group(0) @binding(5) var<storage, read_write> outputs_y:  array<vec4<u32>>;

@compute
@workgroup_size({{ tpb }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let tid = gid.x;
    let base = tid * BS;

    // Phase A — descending suffix-product over BS pairs.
    var suf: array<BigInt, {{ bs }}>;
    var acc: BigInt;
    for (var jj: u32 = 0u; jj < BS; jj = jj + 1u) {
        let k = BS - 1u - jj;
        let idx = base + k;
        var p_x: BigInt = field_load_ro(idx, &inputs_p_x);
        var q_x: BigInt = field_load_ro(idx, &inputs_q_x);
        var dx: BigInt = fr_sub(&q_x, &p_x);
        if (jj == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        suf[k] = acc;
    }

    // Phase B — single inversion per thread.
    var inv: BigInt = fr_inv_by_a(suf[0]);

    // Phase C — ascending lean apply.
    for (var k: u32 = 0u; k < BS; k = k + 1u) {
        let idx = base + k;
        var p_x: BigInt = field_load_ro(idx, &inputs_p_x);
        var p_y: BigInt = field_load_ro(idx, &inputs_p_y);
        var q_x: BigInt = field_load_ro(idx, &inputs_q_x);
        var q_y: BigInt = field_load_ro(idx, &inputs_q_y);

        var inv_dx: BigInt;
        if (k + 1u < BS) {
            var sp = suf[k + 1u];
            inv_dx = montgomery_product(&inv, &sp);
        } else {
            inv_dx = inv;
        }

        var dy: BigInt = fr_sub(&q_y, &p_y);
        var lambda: BigInt = montgomery_product(&dy, &inv_dx);
        var r_x: BigInt = montgomery_product(&lambda, &lambda);
        r_x = fr_sub(&r_x, &p_x);
        r_x = fr_sub(&r_x, &q_x);
        var dxb: BigInt = fr_sub(&p_x, &r_x);
        var r_y: BigInt = montgomery_product(&lambda, &dxb);
        r_y = fr_sub(&r_y, &p_y);

        field_store(idx, &outputs_x, &r_x);
        field_store(idx, &outputs_y, &r_y);

        if (k + 1u < BS) {
            var dxf: BigInt = fr_sub(&q_x, &p_x);
            inv = montgomery_product(&inv, &dxf);
        }
    }

    {{{ recompile }}}
}
