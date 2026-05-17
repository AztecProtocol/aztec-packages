// Single-thread-per-input bench shader for `by_apply_matrix_fg` /
// `by_apply_matrix_de`. Each thread runs both passes on one input record
// and writes the resulting 4 × 9 limbs (f', g', d', e') as 36 i32 outputs.
//
// INPUT LAYOUT (44 u32 per thread):
//   Offset 0..7:   Mat fields { u, v, q, r, u_hi, v_hi, q_hi, r_hi } as i32.
//   Offset 8..16:  f limbs (9 × i32)
//   Offset 17..25: g limbs (9 × i32)
//   Offset 26..34: d limbs (9 × i32)
//   Offset 35..43: e limbs (9 × i32)
// All limbs are signed-canonical (lower limbs in [0, 2^29), top limb signed).
//
// OUTPUT LAYOUT (36 i32 per thread):
//   Offset 0..8:   f' limbs (9 × i32) — output of by_apply_matrix_fg
//   Offset 9..17:  g' limbs (9 × i32) — output of by_apply_matrix_fg
//   Offset 18..26: d' limbs (9 × i32) — output of by_apply_matrix_de
//   Offset 27..35: e' limbs (9 × i32) — output of by_apply_matrix_de
//
// CONSTANTS (Mustache injected):
//   p_limbs_by:   BigIntBY initializer for the BN254 base-field modulus p.
//   p_inv_by_lo:  low 32 bits of P_INV = p^(-1) mod 2^58.
//   p_inv_by_hi:  high 32 bits of P_INV (only the low 26 bits are non-zero).
//
// LOOP BOUNDS: only inherited loops — by_apply_matrix_fg and
// by_apply_matrix_de each use a single `for` bounded by BY_NUM_LIMBS
// (= 9u const). The dispatch entry shader itself has no loops.
//
// SAFETY: `if (tid >= n) return;` static guard, no data-dependent loops.

@group(0) @binding(0) var<storage, read>       inputs:  array<u32>;
@group(0) @binding(1) var<storage, read_write> outputs: array<i32>;
@group(0) @binding(2) var<uniform>             params:  vec2<u32>;

const APPLY_MATRIX_INPUT_STRIDE: u32 = 44u;  // 8 (Mat) + 4 * 9 (limbs)
const APPLY_MATRIX_OUTPUT_STRIDE: u32 = 36u; // 4 * 9 (limbs)
const P_INV_BY_LO: u32 = {{ p_inv_by_lo }}u;
const P_INV_BY_HI: u32 = {{ p_inv_by_hi }}u;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let tid = gid.x;
    if (tid >= n) { return; }

    let in_base: u32 = tid * APPLY_MATRIX_INPUT_STRIDE;
    let out_base: u32 = tid * APPLY_MATRIX_OUTPUT_STRIDE;

    // Decode Mat. The 8 i32 fields land in bindings as u32 — bitcast.
    let m: Mat = Mat(
        bitcast<i32>(inputs[in_base + 0u]),
        bitcast<i32>(inputs[in_base + 1u]),
        bitcast<i32>(inputs[in_base + 2u]),
        bitcast<i32>(inputs[in_base + 3u]),
        bitcast<i32>(inputs[in_base + 4u]),
        bitcast<i32>(inputs[in_base + 5u]),
        bitcast<i32>(inputs[in_base + 6u]),
        bitcast<i32>(inputs[in_base + 7u]),
    );

    // Decode f, g, d, e as BigIntBY (9 × i32 each).
    var f: BigIntBY;
    var g: BigIntBY;
    var d: BigIntBY;
    var e: BigIntBY;
    for (var i: u32 = 0u; i < BY_NUM_LIMBS; i = i + 1u) {
        f.l[i] = bitcast<i32>(inputs[in_base + 8u + i]);
        g.l[i] = bitcast<i32>(inputs[in_base + 17u + i]);
        d.l[i] = bitcast<i32>(inputs[in_base + 26u + i]);
        e.l[i] = bitcast<i32>(inputs[in_base + 35u + i]);
    }

    // Modulus p, fixed across all threads — Mustache-injected.
    var p: BigIntBY = BigIntBY(array<i32, 9>({{{ p_limbs_by }}}));

    // Apply matrix passes.
    by_apply_matrix_fg(m, &f, &g);
    by_apply_matrix_de(m, &d, &e, &p, P_INV_BY_LO, P_INV_BY_HI);

    // Write outputs.
    for (var i: u32 = 0u; i < BY_NUM_LIMBS; i = i + 1u) {
        outputs[out_base + 0u + i]  = f.l[i];
        outputs[out_base + 9u + i]  = g.l[i];
        outputs[out_base + 18u + i] = d.l[i];
        outputs[out_base + 27u + i] = e.l[i];
    }
}
