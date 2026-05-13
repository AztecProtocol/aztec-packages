{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}

// Batch-affine "apply" kernel — given N pairs (P_i, Q_i) and N
// pre-computed inverse deltas (1 / (Q_i.x - P_i.x)), compute the N
// affine sums P_i + Q_i = R_i in parallel and write them out.
//
// The N field inversions implicit in N independent affine adds have
// already been collapsed into a single inversion via the batch-inverse
// kernel (Montgomery's trick) — this kernel is the pure parallel
// arithmetic phase that consumes those pre-computed inverses.
//
// CALLER CONTRACT: every pair (P_i, Q_i) must have P_i.x != Q_i.x and
// neither operand is the identity. The batch-inverse on the deltas is
// undefined for delta == 0; degenerate pairs (P == Q for doubling,
// P == -Q for cancellation, or one operand at infinity) must be
// filtered by the scheduler before they enter the batch.
//
// All inputs / outputs are in Montgomery form. Affine add formulas:
//   λ        = (Q.y - P.y) * inv_delta
//   R.x      = λ^2 - P.x - Q.x
//   R.y      = λ * (P.x - R.x) - P.y

@group(0) @binding(0)
var<storage, read> pair_p_x: array<BigInt>;

@group(0) @binding(1)
var<storage, read> pair_p_y: array<BigInt>;

@group(0) @binding(2)
var<storage, read> pair_q_x: array<BigInt>;

@group(0) @binding(3)
var<storage, read> pair_q_y: array<BigInt>;

@group(0) @binding(4)
var<storage, read> inv_deltas: array<BigInt>;

@group(0) @binding(5)
var<storage, read_write> sum_x: array<BigInt>;

@group(0) @binding(6)
var<storage, read_write> sum_y: array<BigInt>;

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

    var p_x: BigInt = pair_p_x[i];
    var p_y: BigInt = pair_p_y[i];
    var q_x: BigInt = pair_q_x[i];
    var q_y: BigInt = pair_q_y[i];
    var inv_d: BigInt = inv_deltas[i];

    // λ = (Q.y - P.y) * inv_delta
    var dy: BigInt = fr_sub(&q_y, &p_y);
    var lambda: BigInt = montgomery_product(&dy, &inv_d);

    // λ^2
    var lambda_sq: BigInt = montgomery_product(&lambda, &lambda);

    // R.x = λ^2 - P.x - Q.x
    var t1: BigInt = fr_sub(&lambda_sq, &p_x);
    var r_x: BigInt = fr_sub(&t1, &q_x);

    // R.y = λ * (P.x - R.x) - P.y
    var dx_back: BigInt = fr_sub(&p_x, &r_x);
    var ldx: BigInt = montgomery_product(&lambda, &dx_back);
    var r_y: BigInt = fr_sub(&ldx, &p_y);

    sum_x[i] = r_x;
    sum_y[i] = r_y;

    {{{ recompile }}}
}
