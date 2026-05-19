// Isolation bench #2: the PROPOSED batch-affine structure.
//
// Each thread independently runs the classic Montgomery batch-inverse over
// its OWN contiguous chunk of CH pairs, with the running prefix products
// held in a private register array — NOT laundered through a global
// storage buffer, and NO cross-thread Hillis-Steele scan, NO workgroup
// memory, NO workgroupBarrier. One fr_inv_by_a per CH pairs (gated by
// {{ do_invert }} so the harness can measure the non-inversion overhead in
// isolation: do_invert=false treats `acc` as already inverted — the
// arithmetic workload is then identical to the real path minus the single
// inversion, so the delta is exactly the inversion-amortisation cost).
//
// Per pair this is: 1 fr_sub (forward dx) + 1 mul (forward chain)
//                 + 1 mul (backward inv_dx) + 1 mul (backward acc update)
//                 + the affine formula (3 mul + 5 fr_sub)
//                 + (1/CH) * fr_inv_by_a.
// dx is computed ONCE (kept in `dxs`), never recomputed.
//
// CH is the compile-time Mustache constant {{ ch }} so both loops are
// statically bounded. xs = inputs (4 BigInt/pair AoS, same layout as the
// production bench_batch_affine kernel for a controlled comparison).
// params = (n_threads, CH); pair g = tid*CH + i.

const CH: u32 = {{ ch }}u;

@group(0) @binding(0) var<storage, read>       xs:      array<BigInt>;
@group(0) @binding(1) var<storage, read>       ys:      array<BigInt>;
@group(0) @binding(2) var<storage, read_write> outputs: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec2<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = params.x;
    let tid = gid.x;
    if (tid >= n) { return; }

    let chunk_base = tid * CH;

    var pref: array<BigInt, {{ ch }}>;
    var dxs: array<BigInt, {{ ch }}>;

    // Forward pass: inclusive prefix product of dx over the chunk.
    var acc: BigInt = get_r();
    for (var i = 0u; i < CH; i = i + 1u) {
        let g = chunk_base + i;
        let pb = g * 4u;
        var p_x = xs[pb + 0u];
        var q_x = xs[pb + 2u];
        var dx = fr_sub(&q_x, &p_x);
        dxs[i] = dx;
        if (i == 0u) {
            acc = dx;
        } else {
            acc = montgomery_product(&acc, &dx);
        }
        pref[i] = acc;
    }

    var inv: BigInt;
    if ({{ do_invert }}) {
        inv = fr_inv_by_a(acc);
    } else {
        inv = acc;
    }

    // Backward pass: emit one affine add per pair, descending.
    for (var j = 0u; j < CH; j = j + 1u) {
        let i = CH - 1u - j;
        let g = chunk_base + i;
        let pb = g * 4u;
        var p_x = xs[pb + 0u];
        var p_y = xs[pb + 1u];
        var q_x = xs[pb + 2u];
        var q_y = xs[pb + 3u];

        var inv_dx: BigInt;
        if (i == 0u) {
            inv_dx = inv;
        } else {
            var pp = pref[i - 1u];
            inv_dx = montgomery_product(&inv, &pp);
        }

        var dy = fr_sub(&q_y, &p_y);
        var slope = montgomery_product(&dy, &inv_dx);
        var slope_sq = montgomery_product(&slope, &slope);
        var t1 = fr_sub(&slope_sq, &p_x);
        var r_x = fr_sub(&t1, &q_x);
        var dxb = fr_sub(&p_x, &r_x);
        var ldx = montgomery_product(&slope, &dxb);
        var r_y = fr_sub(&ldx, &p_y);

        let ob = g * 2u;
        outputs[ob + 0u] = r_x;
        outputs[ob + 1u] = r_y;

        if (i != 0u) {
            var dxi = dxs[i];
            inv = montgomery_product(&inv, &dxi);
        }
    }
}
