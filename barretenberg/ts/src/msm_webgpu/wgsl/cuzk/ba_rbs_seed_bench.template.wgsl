// Register-blocked batch-affine, seed kernel: the ONLY kernel
// containing the field inversion (FIX A). Single thread, but it now
// walks ONLY the per-BLOCK totals (B = params.x = numBlocks ~= 256),
// NOT the per-thread array (which was ~16384 and caused the 1000+ ns
// catastrophe). One fr_inv_by_a of the grand product, amortised over
// ALL pairs. Identical two-pass exclusive-scan trick as ba_seg_inv,
// applied at BLOCK granularity:
//
//   pass 1 (forward):  blkseed[b] = Π_{c<b} blocktot[c] ; grand = Π_all
//   grandInv = 1 / grand
//   pass 2 (backward): blkseed[b] = blkseed[b] * suf ; suf *= blocktot[b]
//     with suf initialised to grandInv  ⇒  blkseed[b] = 1/blocktot[b]
//                                        = grandInv * Π_{c!=b} blocktot[c]
//
// Total serial work: ~2*B montmul + 1 fr_inv_by_a (B ~= 256).
//
// bindings: 0 blocktot (read), 1 blkseed (rw), 2 unused, 3
// params=(B,_,_,_) where B = numBlocks.

@group(0) @binding(0) var<storage, read>       blocktot: array<BigInt>;
@group(0) @binding(1) var<storage, read_write> blkseed:  array<BigInt>;
@group(0) @binding(2) var<storage, read_write> scratch:  array<BigInt>;
@group(0) @binding(3) var<uniform>             params:   vec4<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x != 0u) { return; }
    let B = params.x;

    var run: BigInt = get_r();
    for (var b = 0u; b < B; b = b + 1u) {
        blkseed[b] = run;
        var bt = blocktot[b];
        run = montgomery_product(&run, &bt);
    }
    var grand = run;
    var suf: BigInt = fr_inv_by_a(grand);

    for (var jj = 0u; jj < B; jj = jj + 1u) {
        let b = B - 1u - jj;
        var pre = blkseed[b];
        blkseed[b] = montgomery_product(&pre, &suf);
        var bt = blocktot[b];
        suf = montgomery_product(&suf, &bt);
    }
}
