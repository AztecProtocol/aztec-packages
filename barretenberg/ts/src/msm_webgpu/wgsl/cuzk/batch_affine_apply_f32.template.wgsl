// 23-bit f32 mirror of `batch_affine_apply.template.wgsl`. Parallel
// affine adds over the per-round pair pool after the shared batch
// inverse. All inputs/outputs are in f32-Montgomery form.

@group(0) @binding(0)
var<storage, read> pair_p_x: array<BigIntF32>;

@group(0) @binding(1)
var<storage, read> pair_p_y: array<BigIntF32>;

@group(0) @binding(2)
var<storage, read> pair_q_x: array<BigIntF32>;

@group(0) @binding(3)
var<storage, read> pair_q_y: array<BigIntF32>;

@group(0) @binding(4)
var<storage, read> inv_deltas: array<BigIntF32>;

@group(0) @binding(5)
var<storage, read_write> sum_x: array<BigIntF32>;

@group(0) @binding(6)
var<storage, read_write> sum_y: array<BigIntF32>;

@group(0) @binding(7)
var<uniform> params: vec4<u32>; // params[0] = N

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    let n = params[0];
    if (i >= n) {
        return;
    }

    var p_x: BigIntF32 = pair_p_x[i];
    var p_y: BigIntF32 = pair_p_y[i];
    var q_x: BigIntF32 = pair_q_x[i];
    var q_y: BigIntF32 = pair_q_y[i];
    var inv_d: BigIntF32 = inv_deltas[i];

    var dy: BigIntF32 = fr_sub_f32(&q_y, &p_y);
    var lambda: BigIntF32 = montgomery_product_f32(&dy, &inv_d);

    var lambda_sq: BigIntF32 = montgomery_product_f32(&lambda, &lambda);

    var t1: BigIntF32 = fr_sub_f32(&lambda_sq, &p_x);
    var r_x: BigIntF32 = fr_sub_f32(&t1, &q_x);

    var dx_back: BigIntF32 = fr_sub_f32(&p_x, &r_x);
    var ldx: BigIntF32 = montgomery_product_f32(&lambda, &dx_back);
    var r_y: BigIntF32 = fr_sub_f32(&ldx, &p_y);

    sum_x[i] = r_x;
    sum_y[i] = r_y;

    {{{ recompile }}}
}
