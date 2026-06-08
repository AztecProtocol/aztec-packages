{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Sparse bucket reduction — v2 (batched). SPARSE_REDUCE_PLAN.md.
//
// One workgroup per window. Each thread owns S contiguous bucket-segments
// (slots). Each slot runs the gap-aware suffix sum over ITS segment, SKIPPING
// empty buckets (is_present==0) so the loop length is the slot's active count,
// not the segment width. The two affine adds the chain needs each iteration
// (running += bucket; alg += running) are BATCHED across the S slots — one
// safegcd inversion per S adds (the walker's forward-prefix-product /
// single-inverse / backward-peel) — so the inversions, not the bucket count,
// stop dominating. Ragged: a slot whose actives are exhausted feeds the pad
// denominator R into the batch and is skipped on the peel.
//
// Per slot: alg_s = Σ_{rel' in seg, active} (rel'+1)·V (segment-local mag) and
// seg_sum_s = Σ active V. Combine: S_w = Σ_s (alg_s + lo_s·seg_sum_s) via a
// workgroup tree-sum (lo_s lifts segment-local mags to absolute). Byte-identical
// to the dense tree; validate against v0/v1.
//
// Magnitude mag (1..B) lives at red_buf slot base+(mag-1); slot j holds mag j+1.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;
const S:  u32 = 8u;     // slots (segments) per thread

@group(0) @binding(0) var<storage, read_write> red_buf:      array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> is_present:   array<u32>;
@group(0) @binding(2) var<uniform>             cparams:      vec4<u32>;
@group(0) @binding(3) var<storage, read>       reduce_meta:  array<vec4<u32>>;
// cparams = (M, _, _, _). reduce_meta[w] = (base = reduce_off, B = num_buckets,..).

var<workgroup> sh_x: array<array<u32, 8>, WG>;
var<workgroup> sh_y: array<array<u32, 8>, WG>;
var<workgroup> sh_p: array<u32, WG>;

fn load_x(idx: u32) -> array<u32, 8> {
    let b = PG * idx; let q0 = red_buf[b]; let q1 = red_buf[b + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_y(idx: u32, M: u32) -> array<u32, 8> {
    let b = PG * M + PG * idx; let q0 = red_buf[b]; let q1 = red_buf[b + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn store_pt(idx: u32, M: u32, x: array<u32,8>, y: array<u32,8>) {
    let bx = PG * idx; let by = PG * M + PG * idx;
    red_buf[bx] = vec4<u32>(x[0],x[1],x[2],x[3]); red_buf[bx+1u] = vec4<u32>(x[4],x[5],x[6],x[7]);
    red_buf[by] = vec4<u32>(y[0],y[1],y[2],y[3]); red_buf[by+1u] = vec4<u32>(y[4],y[5],y[6],y[7]);
}
fn finv(a: array<u32, 8>) -> array<u32, 8> {
    var x: BigInt = unpack256_to_limbs(a); var i: BigInt = {{ inv_fn }}(x); return pack_limbs_to_256(&i);
}
fn sel8(a: array<u32,8>, b: array<u32,8>, c: bool) -> array<u32,8> {
    return array<u32,8>(select(a[0],b[0],c),select(a[1],b[1],c),select(a[2],b[2],c),select(a[3],b[3],c),
                        select(a[4],b[4],c),select(a[5],b[5],c),select(a[6],b[6],c),select(a[7],b[7],c));
}

// Per-thread slot state (private).
var<private> dx_x: array<array<u32,8>, 8>;   // d.x = src.x - dst.x per slot (this step)
var<private> pref: array<array<u32,8>, 8>;   // prefix product of dx

// Batched affine add dst[s] += src[s] over the S slots (one inversion). `op` masks
// which slots add this step; present flags handle empty operands (copy / skip).
// Mutates dst_x/dst_y/dst_p in place via the workgroup-shared-free private arrays
// passed by the caller through globals dstx etc. — done inline below instead.

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>, @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.x;
    let tid = lid.x;
    let M = cparams.x;
    let mrow = reduce_meta[w];
    let base = mrow.x;
    let B = mrow.y;
    let R = get_r_f8();

    // seg = ceil(B / (WG*S)); slot g = tid*S + s owns [g*seg, (g+1)*seg).
    let nseg = WG * S;
    let seg = (B + nseg - 1u) / nseg;

    var run_x: array<array<u32,8>, 8>;
    var run_y: array<array<u32,8>, 8>;
    var run_p: array<u32, 8>;
    var alg_x: array<array<u32,8>, 8>;
    var alg_y: array<array<u32,8>, 8>;
    var alg_p: array<u32, 8>;
    var cur:   array<u32, 8>;   // current rel within window (descending), == hi means start
    var lo_a:  array<u32, 8>;   // segment base rel
    var hi_a:  array<u32, 8>;
    var prev:  array<u32, 8>;   // previous active rel (for gap), init = hi
    var done:  array<u32, 8>;

    for (var s = 0u; s < S; s = s + 1u) {
        let g = tid * S + s;
        let lo = g * seg;
        var hi = lo + seg; if (hi > B) { hi = B; }
        lo_a[s] = lo; hi_a[s] = hi; prev[s] = hi; cur[s] = hi;
        run_p[s] = 0u; alg_p[s] = 0u;
        run_x[s] = R; run_y[s] = R; alg_x[s] = R; alg_y[s] = R;
        done[s] = select(0u, 1u, lo >= hi);
    }

    // Ragged batched loop. Each iteration: advance each live slot to its next
    // active bucket; flush the gap (alg += running·gap) un-batched; then batch
    // the running += V across slots.
    loop {
        var any = false;
        // Advance each live slot to next active bucket (scan down past empties).
        for (var s = 0u; s < S; s = s + 1u) {
            if (done[s] == 1u) { continue; }
            var c = cur[s];
            var found = false;
            // Scan [lo, cur[s]) descending for the next active bucket. Starting at
            // c==lo means the bottom was already processed → none remain.
            loop {
                if (c == lo_a[s]) { break; }
                c = c - 1u;
                if (is_present[base + c] != 0u) { found = true; break; }
                if (c == lo_a[s]) { break; }
            }
            if (found) {
                cur[s] = c;
                any = true;
            } else {
                // no more actives in this segment → finalize (tail flush) + done.
                if (run_p[s] == 1u) {
                    // tail: alg += running·(prev - lo + ... ) → weight prev-lo+1 locally
                    // gap-aware tail covers rel' in [lo, prev]; local weight prev-lo+1.
                    let gap = prev[s] - lo_a[s] + 1u;
                    var p = run_x[s]; var py = run_y[s]; var pp = R; var ppy = R; var has = false;
                    var kk = gap;
                    loop {
                        if ((kk & 1u) == 1u) {
                            if (!has) { pp = p; ppy = py; has = true; }
                            else { // affine add pp += p
                                let dxq = fr_sub_f8(p, pp); let dyq = fr_sub_f8(py, ppy);
                                let lam = montgomery_product_f8(dyq, finv(dxq));
                                var rx = montgomery_product_f8(lam, lam); rx = fr_sub_f8(rx, pp); rx = fr_sub_f8(rx, p);
                                var ry = fr_sub_f8(pp, rx); ry = montgomery_product_f8(lam, ry); ry = fr_sub_f8(ry, ppy);
                                pp = rx; ppy = ry;
                            }
                        }
                        kk = kk >> 1u; if (kk == 0u) { break; }
                        // double p
                        let x2 = montgomery_product_f8(p, p); var num = fr_add_f8(x2,x2); num = fr_add_f8(num,x2);
                        let den = fr_add_f8(py,py); let lam = montgomery_product_f8(num, finv(den));
                        let tx = fr_add_f8(p,p); var rx = montgomery_product_f8(lam,lam); rx = fr_sub_f8(rx,tx);
                        var ry = fr_sub_f8(p,rx); ry = montgomery_product_f8(lam,ry); ry = fr_sub_f8(ry,py);
                        p = rx; py = ry;
                    }
                    if (has) {
                        if (alg_p[s] == 0u) { alg_x[s] = pp; alg_y[s] = ppy; alg_p[s] = 1u; }
                        else {
                            let dxq = fr_sub_f8(pp, alg_x[s]); let dyq = fr_sub_f8(ppy, alg_y[s]);
                            let lam = montgomery_product_f8(dyq, finv(dxq));
                            var rx = montgomery_product_f8(lam,lam); rx = fr_sub_f8(rx, alg_x[s]); rx = fr_sub_f8(rx, pp);
                            var ry = fr_sub_f8(alg_x[s], rx); ry = montgomery_product_f8(lam,ry); ry = fr_sub_f8(ry, alg_y[s]);
                            alg_x[s] = rx; alg_y[s] = ry;
                        }
                    }
                }
                done[s] = 1u;
            }
        }
        if (!any) { break; }

        // Phase A (un-batched gap flush): alg_s += running_s·(prev_s - cur_s).
        for (var s = 0u; s < S; s = s + 1u) {
            if (done[s] == 1u || run_p[s] == 0u) { continue; }
            let gap = prev[s] - cur[s];
            var p = run_x[s]; var py = run_y[s]; var pp = R; var ppy = R; var has = false;
            var kk = gap;
            loop {
                if ((kk & 1u) == 1u) {
                    if (!has) { pp = p; ppy = py; has = true; }
                    else {
                        let dxq = fr_sub_f8(p, pp); let dyq = fr_sub_f8(py, ppy);
                        let lam = montgomery_product_f8(dyq, finv(dxq));
                        var rx = montgomery_product_f8(lam,lam); rx = fr_sub_f8(rx, pp); rx = fr_sub_f8(rx, p);
                        var ry = fr_sub_f8(pp, rx); ry = montgomery_product_f8(lam, ry); ry = fr_sub_f8(ry, ppy);
                        pp = rx; ppy = ry;
                    }
                }
                kk = kk >> 1u; if (kk == 0u) { break; }
                let x2 = montgomery_product_f8(p,p); var num = fr_add_f8(x2,x2); num = fr_add_f8(num,x2);
                let den = fr_add_f8(py,py); let lam = montgomery_product_f8(num, finv(den));
                let tx = fr_add_f8(p,p); var rx = montgomery_product_f8(lam,lam); rx = fr_sub_f8(rx,tx);
                var ry = fr_sub_f8(p,rx); ry = montgomery_product_f8(lam,ry); ry = fr_sub_f8(ry,py);
                p = rx; py = ry;
            }
            if (has) {
                if (alg_p[s] == 0u) { alg_x[s] = pp; alg_y[s] = ppy; alg_p[s] = 1u; }
                else {
                    let dxq = fr_sub_f8(pp, alg_x[s]); let dyq = fr_sub_f8(ppy, alg_y[s]);
                    let lam = montgomery_product_f8(dyq, finv(dxq));
                    var rx = montgomery_product_f8(lam,lam); rx = fr_sub_f8(rx, alg_x[s]); rx = fr_sub_f8(rx, pp);
                    var ry = fr_sub_f8(alg_x[s], rx); ry = montgomery_product_f8(lam,ry); ry = fr_sub_f8(ry, alg_y[s]);
                    alg_x[s] = rx; alg_y[s] = ry;
                }
            }
        }

        // Phase B (BATCHED): running_s += V_s[cur_s]. Forward prefix of dx.
        var accp = R;
        for (var s = 0u; s < S; s = s + 1u) {
            let live = (done[s] == 0u);
            let vx = sel8(R, load_x(base + cur[s]), live);
            let both = live && (run_p[s] == 1u);
            let dxv = sel8(R, fr_sub_f8(vx, run_x[s]), both);
            dx_x[s] = dxv;
            accp = montgomery_product_f8(accp, dxv);
            pref[s] = accp;
        }
        var inv = finv(accp);
        for (var jj = 0u; jj < S; jj = jj + 1u) {
            let s = S - 1u - jj;
            var inv_dx = inv;
            if (s > 0u) { inv_dx = montgomery_product_f8(inv, pref[s - 1u]); }
            inv = montgomery_product_f8(inv, dx_x[s]);
            let live = (done[s] == 0u);
            if (!live) { continue; }
            let vx = load_x(base + cur[s]);
            let vy = load_y(base + cur[s], M);
            if (run_p[s] == 0u) {
                run_x[s] = vx; run_y[s] = vy; run_p[s] = 1u;
            } else {
                var lam = fr_sub_f8(vy, run_y[s]);
                lam = montgomery_product_f8(lam, inv_dx);
                var rx = montgomery_product_f8(lam, lam); rx = fr_sub_f8(rx, run_x[s]); rx = fr_sub_f8(rx, vx);
                var ry = fr_sub_f8(run_x[s], rx); ry = montgomery_product_f8(lam, ry); ry = fr_sub_f8(ry, run_y[s]);
                run_x[s] = rx; run_y[s] = ry;
            }
            prev[s] = cur[s];
            // step cursor below this bucket for the next scan
            if (cur[s] == lo_a[s]) { /* will finalize next iter */ }
            cur[s] = select(cur[s], cur[s], false); // keep; scan loop decrements next iter
        }
        // mark slots at lo as needing finalize next pass: nudge cur so the scan exits
        for (var s = 0u; s < S; s = s + 1u) {
            if (done[s] == 0u && cur[s] == lo_a[s]) {
                // already consumed lo; force finalize by leaving cur==lo and !present below
                // handled by the scan reaching bottom next iteration
            }
        }
    }

    // Combine: contrib_s = alg_s + lo_s·seg_sum_s; thread partial = Σ_s contrib_s.
    var px = R; var py = R; var pp_present = 0u;
    for (var s = 0u; s < S; s = s + 1u) {
        // lo_s·seg_sum_s (seg_sum = running). double-and-add by lo_a[s].
        var cx = alg_x[s]; var cy = alg_y[s]; var cp = alg_p[s];
        if (run_p[s] == 1u && lo_a[s] > 0u) {
            var p = run_x[s]; var pyy = run_y[s]; var qx = R; var qy = R; var qp = false;
            var kk = lo_a[s];
            loop {
                if ((kk & 1u) == 1u) {
                    if (!qp) { qx = p; qy = pyy; qp = true; }
                    else {
                        let dxq = fr_sub_f8(p, qx); let dyq = fr_sub_f8(pyy, qy);
                        let lam = montgomery_product_f8(dyq, finv(dxq));
                        var rx = montgomery_product_f8(lam,lam); rx = fr_sub_f8(rx, qx); rx = fr_sub_f8(rx, p);
                        var ry = fr_sub_f8(qx, rx); ry = montgomery_product_f8(lam,ry); ry = fr_sub_f8(ry, qy);
                        qx = rx; qy = ry;
                    }
                }
                kk = kk >> 1u; if (kk == 0u) { break; }
                let x2 = montgomery_product_f8(p,p); var num = fr_add_f8(x2,x2); num = fr_add_f8(num,x2);
                let den = fr_add_f8(pyy,pyy); let lam = montgomery_product_f8(num, finv(den));
                let tx = fr_add_f8(p,p); var rx = montgomery_product_f8(lam,lam); rx = fr_sub_f8(rx,tx);
                var ry = fr_sub_f8(p,rx); ry = montgomery_product_f8(lam,ry); ry = fr_sub_f8(ry,pyy);
                p = rx; pyy = ry;
            }
            if (qp) {
                if (cp == 0u) { cx = qx; cy = qy; cp = 1u; }
                else {
                    let dxq = fr_sub_f8(qx, cx); let dyq = fr_sub_f8(qy, cy);
                    let lam = montgomery_product_f8(dyq, finv(dxq));
                    var rx = montgomery_product_f8(lam,lam); rx = fr_sub_f8(rx, cx); rx = fr_sub_f8(rx, qx);
                    var ry = fr_sub_f8(cx, rx); ry = montgomery_product_f8(lam,ry); ry = fr_sub_f8(ry, cy);
                    cx = rx; cy = ry;
                }
            }
        }
        if (cp == 1u) {
            if (pp_present == 0u) { px = cx; py = cy; pp_present = 1u; }
            else {
                let dxq = fr_sub_f8(cx, px); let dyq = fr_sub_f8(cy, py);
                let lam = montgomery_product_f8(dyq, finv(dxq));
                var rx = montgomery_product_f8(lam,lam); rx = fr_sub_f8(rx, px); rx = fr_sub_f8(rx, cx);
                var ry = fr_sub_f8(px, rx); ry = montgomery_product_f8(lam,ry); ry = fr_sub_f8(ry, py);
                px = rx; py = ry;
            }
        }
    }

    sh_x[tid] = px; sh_y[tid] = py; sh_p[tid] = pp_present;
    workgroupBarrier();
    var stride = WG >> 1u;
    loop {
        if (stride == 0u) { break; }
        if (tid < stride) {
            let ap = sh_p[tid]; let bp = sh_p[tid + stride];
            if (bp == 1u) {
                if (ap == 0u) { sh_x[tid] = sh_x[tid+stride]; sh_y[tid] = sh_y[tid+stride]; sh_p[tid] = 1u; }
                else {
                    let ax = sh_x[tid]; let ay = sh_y[tid]; let cbx = sh_x[tid+stride]; let cby = sh_y[tid+stride];
                    let dxq = fr_sub_f8(cbx, ax); let dyq = fr_sub_f8(cby, ay);
                    let lam = montgomery_product_f8(dyq, finv(dxq));
                    var rx = montgomery_product_f8(lam,lam); rx = fr_sub_f8(rx, ax); rx = fr_sub_f8(rx, cbx);
                    var ry = fr_sub_f8(ax, rx); ry = montgomery_product_f8(lam,ry); ry = fr_sub_f8(ry, ay);
                    sh_x[tid] = rx; sh_y[tid] = ry;
                }
            }
        }
        workgroupBarrier();
        stride = stride >> 1u;
    }
    if (tid == 0u && sh_p[0] == 1u) { store_pt(base, M, sh_x[0], sh_y[0]); }

    {{{ recompile }}}
}
