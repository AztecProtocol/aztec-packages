// straus_main kernel for BN254 G1 — per-thread small MSM over a chunk of
// NUM_THREAD_MULS pairs from the input. One thread per chunk computes the
// chunk's Jacobian partial sum (windowed Booth-endo Straus). The combine
// kernel (P5) tree-folds the per-thread partials into a single affine
// result.
//
// NUM_THREAD_MULS is a compile-time mustache constant (NOT a uniform), so
// the shader is re-compiled per-`k`. The inner per-chunk loop is a counted
// `for (var ii = start; ii < end; ii = ii + 1u)` — deliberately NOT
// unrolled — so per-thread register footprint stays ~k-independent.
//
// The lookup table is read from a `var<storage, read>` buffer; k1/k2
// limbs are streamed from storage each iteration. Both decisions are
// deliberate (see plan §4 rules 1-3) and must not be relaxed.

{{> structs }}
{{> bigint_funcs }}
{{> field_funcs }}
{{> montgomery_product_funcs }}
{{> ec_funcs }}

const NUM_THREAD_MULS: u32 = {{ num_thread_muls }}u;
const N:               u32 = {{ n }}u;

@group(0) @binding(0) var<storage, read>       lut_x:   array<BigInt>;
@group(0) @binding(1) var<storage, read>       lut_y:   array<BigInt>;
@group(0) @binding(2) var<storage, read>       lut_z:   array<BigInt>;
@group(0) @binding(3) var<storage, read>       k1_lims: array<u32>;
@group(0) @binding(4) var<storage, read>       k2_lims: array<u32>;
@group(0) @binding(5) var<storage, read_write> part_x:  array<BigInt>;
@group(0) @binding(6) var<storage, read_write> part_y:  array<BigInt>;
@group(0) @binding(7) var<storage, read_write> part_z:  array<BigInt>;

fn get_beta_mont() -> BigInt {
    var b: BigInt;
{{{ beta_mont_limbs }}}
    return b;
}

fn get_p() -> BigInt {
    var p_const: BigInt;
{{{ p_limbs }}}
    return p_const;
}

fn fr_cond_neg(y: BigInt, flag: u32) -> BigInt {
    var p_const: BigInt = get_p();
    var y_copy: BigInt = y;
    var neg: BigInt;
    let _b = bigint_sub(&p_const, &y_copy, &neg);
    return select(y, neg, flag != 0u);
}

// Read the 5-bit signed-Booth raw window for window `w` from a 128-bit
// scalar half packed as 4 little-endian u32 limbs in `lims[0..4]`. The
// w=0 case has no lookback bit (treated as 0); higher windows read
// 5 contiguous bits starting at bit `4*w - 1`.
fn read_booth_5bits(lims: ptr<function, array<u32, 4>>, w: u32) -> u32 {
    if (w == 0u) {
        return ((*lims)[0u] & 0xfu) << 1u;
    }
    let start: u32 = 4u * w - 1u;
    let limb_idx: u32 = start / 32u;
    let off: u32 = start - limb_idx * 32u;
    var raw: u32 = (*lims)[limb_idx] >> off;
    if (off > 27u && limb_idx + 1u < 4u) {
        raw = raw | ((*lims)[limb_idx + 1u] << (32u - off));
    }
    return raw & 0x1fu;
}

// Signed-Booth packed digit for window `w` of the 128-bit half. Returns
// (sign << 31) | magnitude with magnitude ∈ [0, 8]. Mirrors the host
// `boothPackedDigit` in `src/msm_webgpu/straus/booth.ts`.
fn booth_packed_digit(lims: ptr<function, array<u32, 4>>, w: u32) -> u32 {
    let raw: u32 = read_booth_5bits(lims, w);
    let neg: u32 = (raw >> 4u) & 1u;
    let neg_mask: u32 = 0u - neg;
    let encode: u32 = (raw + 1u) >> 1u;
    let magnitude: u32 = ((encode + neg_mask) ^ neg_mask) & 0xfu;
    return (neg << 31u) | magnitude;
}

fn read_lut(i: u32, k: u32) -> Point {
    var p: Point;
    p.x = lut_x[i * 8u + k];
    p.y = lut_y[i * 8u + k];
    p.z = lut_z[i * 8u + k];
    return p;
}

fn load_half_limbs(h: u32, ii: u32) -> array<u32, 4> {
    let base: u32 = ii * 4u;
    if (h == 0u) {
        return array<u32, 4>(
            k1_lims[base + 0u],
            k1_lims[base + 1u],
            k1_lims[base + 2u],
            k1_lims[base + 3u],
        );
    }
    return array<u32, 4>(
        k2_lims[base + 0u],
        k2_lims[base + 1u],
        k2_lims[base + 2u],
        k2_lims[base + 3u],
    );
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let t: u32 = gid.x;
    let start: u32 = t * NUM_THREAD_MULS;
    if (start >= N) { return; }
    var end: u32 = start + NUM_THREAD_MULS;
    if (end > N) { end = N; }

    var acc: Point;
    var zero_bi: BigInt;
    acc.x = zero_bi;
    acc.y = zero_bi;
    acc.z = zero_bi;

    var beta: BigInt = get_beta_mont();

    for (var w_p1: u32 = 32u; w_p1 > 0u; w_p1 = w_p1 - 1u) {
        let w: u32 = w_p1 - 1u;
        for (var h: u32 = 0u; h < 2u; h = h + 1u) {
            for (var ii: u32 = start; ii < end; ii = ii + 1u) {
                var s_lims: array<u32, 4> = load_half_limbs(h, ii);
                let digit: u32 = booth_packed_digit(&s_lims, w);
                let magnitude: u32 = digit & 0x7fffffffu;
                if (magnitude == 0u) {
                    continue;
                }
                let sign: u32 = digit >> 31u;
                var to_add: Point = read_lut(ii, magnitude - 1u);
                to_add.y = fr_cond_neg(to_add.y, sign ^ h);
                if (h == 1u) {
                    var bx = to_add.x;
                    to_add.x = montgomery_product(&bx, &beta);
                }
                acc = add_points(acc, to_add);
            }
        }
        if (w != 0u) {
            for (var d: u32 = 0u; d < 4u; d = d + 1u) {
                acc = double_point(acc);
            }
        }
    }

    part_x[t] = acc.x;
    part_y[t] = acc.y;
    part_z[t] = acc.z;

    {{{ recompile }}}
}
