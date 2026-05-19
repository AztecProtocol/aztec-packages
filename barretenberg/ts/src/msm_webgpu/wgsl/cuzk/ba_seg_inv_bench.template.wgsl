// Segmented batch-affine, kernel 2/3: the ONLY kernel containing the
// field inversion. Single thread, T = params.x segment totals. Computes
// seg_seed[t] = 1 / segtot[t] for every segment, using ONE fr_inv_by_a
// of the grand product (amortised over ALL pairs). O(1) register state
// (the seed buffer doubles as scratch for the forward prefix).
//
//   pass 1 (forward): seed[t] = Π_{u<t} segtot[u] ; grand = Π_all
//   grandInv = 1 / grand
//   pass 2 (backward): seed[t] = seed[t] * suf ; suf *= segtot[t]
//     with suf initialised to grandInv  ⇒  seed[t] = 1/segtot[t]
//
// bindings: 0 segtot (read), 1 segseed (rw), 2 unused, 3 params=(T,_,_,_).

@group(0) @binding(0) var<storage, read>       segtot:  array<BigInt>;
@group(0) @binding(1) var<storage, read_write> segseed: array<BigInt>;
@group(0) @binding(2) var<storage, read_write> scratch: array<BigInt>;
@group(0) @binding(3) var<uniform>             params:  vec4<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x != 0u) { return; }
    let T = params.x;

    var run: BigInt = get_r();
    for (var t = 0u; t < T; t = t + 1u) {
        segseed[t] = run;
        var st = segtot[t];
        run = montgomery_product(&run, &st);
    }
    var grand = run;
    var suf: BigInt = fr_inv_by_a(grand);

    for (var jj = 0u; jj < T; jj = jj + 1u) {
        let t = T - 1u - jj;
        var pre = segseed[t];
        segseed[t] = montgomery_product(&pre, &suf);
        var st = segtot[t];
        suf = montgomery_product(&suf, &st);
    }
}
