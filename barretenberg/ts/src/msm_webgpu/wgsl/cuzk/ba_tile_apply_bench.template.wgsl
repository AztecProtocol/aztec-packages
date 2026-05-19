// Fully-parallel "tile" batch-affine apply kernel: ONE thread = ONE pair
// g (full occupancy, no per-thread R loop). g sits at within-tile lane
// j = g % TPB in tile T = g / TPB. NO inversion code here ⇒ small
// footprint ⇒ max occupancy, matching the apply_precomputed_k1 floor.
//
// inv_dx_g = tileseed[T] * exclPrefix_g * exclSuffix_g
//   exclPrefix_g = prefixb[g-1]  (j>0)         else get_r()  (j==0)
//   exclSuffix_g = suffixb[g+1]  (j<TPB-1)     else get_r()  (j==TPB-1)
//   tileseed[T]  = 1 / Π_{all i in tile T} dx_i              (from K2)
// Correctness: exclPrefix·exclSuffix = Π_{i!=j} dx_i; times
// 1/Π_all = (Π_{i!=j})/(Π_all) = 1/dx_j. ✓
//
// Then the lean affine formula:
//   lambda = (q_y - p_y) * inv_dx ; r_x = lambda^2 - p_x - q_x ;
//   r_y = lambda * (p_x - r_x) - p_y
//
// bindings: 0 inp (AoS 4/pair, read), 1 prefixb (1/pair, read),
// 2 outp (2/pair, rw), 3 params=(n_pairs,_,_,_), 4 suffixb (1/pair,
// read), 5 tileseed (1/tile, read).

const TPB: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       inp:      array<BigInt>;
@group(0) @binding(1) var<storage, read>       prefixb:  array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outp:     array<BigInt>;
@group(0) @binding(3) var<uniform>             params:   vec4<u32>;
@group(0) @binding(4) var<storage, read>       suffixb:  array<BigInt>;
@group(0) @binding(5) var<storage, read>       tileseed: array<BigInt>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let g = gid.x;
    if (g >= n) { return; }

    let tile = g / TPB;
    let j = g % TPB;

    var exPre: BigInt;
    if (j == 0u) {
        exPre = get_r();
    } else {
        exPre = prefixb[g - 1u];
    }
    var exSuf: BigInt;
    if (j == TPB - 1u) {
        exSuf = get_r();
    } else {
        exSuf = suffixb[g + 1u];
    }

    var inv_dx = tileseed[tile];
    inv_dx = montgomery_product(&inv_dx, &exPre);
    inv_dx = montgomery_product(&inv_dx, &exSuf);

    let pb = g * 4u;
    var p_x = inp[pb + 0u];
    var p_y = inp[pb + 1u];
    var q_x = inp[pb + 2u];
    var q_y = inp[pb + 3u];

    var lambda = fr_sub(&q_y, &p_y);
    lambda = montgomery_product(&lambda, &inv_dx);
    var r_x = montgomery_product(&lambda, &lambda);
    r_x = fr_sub(&r_x, &p_x);
    r_x = fr_sub(&r_x, &q_x);
    var r_y = fr_sub(&p_x, &r_x);
    r_y = montgomery_product(&lambda, &r_y);
    r_y = fr_sub(&r_y, &p_y);

    let ob = g * 2u;
    outp[ob + 0u] = r_x;
    outp[ob + 1u] = r_y;
}
