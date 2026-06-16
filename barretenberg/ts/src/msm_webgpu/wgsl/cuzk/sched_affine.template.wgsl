{{> inverse_funcs }}

{{> field8_funcs }}

// Addition-schedule executor, AFFINE layer: S entries per thread sharing
// ONE batched inversion (forward dx prefix -> safegcd -> backward peel),
// incomplete add (the walker discipline: partials are run-sums over an
// SRS, so equal/negated operands are dlog-excluded), result to the
// entry's dst — srcA's slot, or red_buf when the RED flag marks a
// bucket-closing add. Entries arrive resolved; the kernel does no pair
// discovery. The three serial multiplies of the affine add route through
// ONE call site (driver inlining cost is quasi-quadratic in multiplier
// bodies per kernel).
//
// Entry: {srcA_slot, 0, srcB_slot, dst | RED_FLAG?}.
//
// lvl.x = k (layer, 1-based). sched_meta words: [k-1] = layer adds,
// [24 + k-1] = layer entry base. sched_off.x = meta base (u32 units),
// sched_off.w = entries base (vec4 units). params.w = M_partials;
// batch_offset.z = red_buf Y-plane stride.

const S: u32 = {{ s }}u;
const TPB: u32 = {{ workgroup_size }}u;
const PG: u32 = 2u;
const RED_FLAG: u32 = 0x80000000u;
const IDX_MASK: u32 = 0x7fffffffu;

@group(0) @binding(0) var<storage, read>       sched_meta:    array<u32>;
@group(0) @binding(1) var<storage, read>       sched_entries: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> partials_buf:  array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> red_buf:       array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             lvl:           vec4<u32>;
@group(0) @binding(5) var<uniform>             params:        vec4<u32>;
@group(0) @binding(6) var<uniform>             batch_offset:  vec4<u32>;
@group(0) @binding(7) var<uniform>             sched_off:     vec4<u32>;

fn load_x(slot: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * slot + 0u];
    let q1 = partials_buf[PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_y(slot: u32, M: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * M + PG * slot + 0u];
    let q1 = partials_buf[PG * M + PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn fr_select_f8(a: array<u32, 8>, b: array<u32, 8>, cond: bool) -> array<u32, 8> {
    return array<u32, 8>(
        select(a[0], b[0], cond), select(a[1], b[1], cond),
        select(a[2], b[2], cond), select(a[3], b[3], cond),
        select(a[4], b[4], cond), select(a[5], b[5], cond),
        select(a[6], b[6], cond), select(a[7], b[7], cond));
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let k = lvl.x;
    let mb = sched_off.x;
    // Hoist the entry-base index: Adreno miscompiles the inline subscript
    // sched_meta[mb + 24u + (k - 1u)] (wrong element -> wrong ebase -> all-wrong
    // on S25+). See sched_coop2 for the same fix.
    let kk = k - 1u;
    let eidx = mb + 24u + kk;
    let n_entries = sched_meta[mb + kk];
    let ebase = sched_off.w + sched_meta[eidx];
    let M_partials = params.w;
    let base = gid.x * S;

    var lslot: array<u32, {{ s }}>;
    var rslot: array<u32, {{ s }}>;
    var dst:   array<u32, {{ s }}>;
    var live:  array<u32, {{ s }}>;
    var n_live: u32 = 0u;
    for (var s_i: u32 = 0u; s_i < S; s_i = s_i + 1u) {
        live[s_i] = 0u;
        let p = base + s_i;
        if (p >= n_entries) { continue; }
        let e = sched_entries[ebase + p];
        lslot[s_i] = e.x;
        rslot[s_i] = e.z;
        dst[s_i] = e.w;
        live[s_i] = 1u;
        n_live = n_live + 1u;
    }

    // Idle threads skip the whole batch (prefix, ~30-mul safegcd, peel).
    if (n_live > 0u) {
        let R: array<u32, 8> = get_r_f8();
        var pref: array<array<u32, 8>, {{ s }}>;
        var prod: array<u32, 8> = R;
        for (var s_i: u32 = 0u; s_i < S; s_i = s_i + 1u) {
            var dx: array<u32, 8> = R;
            if (live[s_i] >= 1u) {
                let x_l = load_x(lslot[s_i]);
                let x_r = load_x(rslot[s_i]);
                dx = fr_sub_f8(x_r, x_l);
                // Doubling violation (x_r == x_l) would zero the batch
                // product; substitute identity — that bucket alone is
                // garbage (standing incomplete-add assumption).
                dx = fr_select_f8(dx, R, is_zero_f8(dx));
            }
            if (s_i == 0u) {
                prod = dx;
            } else {
                prod = montgomery_product_f8(prod, dx);
            }
            if (s_i + 1u < S) { pref[s_i] = prod; }
        }

        var inv = {{ inv_fn }}(prod);

        for (var s_j: u32 = 0u; s_j < S; s_j = s_j + 1u) {
            let s_i = S - 1u - s_j;
            var inv_dx: array<u32, 8>;
            var dx_b: array<u32, 8> = R;
            if (live[s_i] >= 1u) {
                let x_l = load_x(lslot[s_i]);
                let x_r = load_x(rslot[s_i]);
                dx_b = fr_sub_f8(x_r, x_l);
                dx_b = fr_select_f8(dx_b, R, is_zero_f8(dx_b));
            }
            if (s_i == 0u) {
                inv_dx = inv;
            } else {
                inv_dx = montgomery_product_f8(inv, pref[s_i - 1u]);
                inv = montgomery_product_f8(inv, dx_b);
            }
            if (live[s_i] == 0u) { continue; }

            let x_l = load_x(lslot[s_i]);
            let x_r = load_x(rslot[s_i]);
            let y_l = load_y(lslot[s_i], M_partials);
            let y_r = load_y(rslot[s_i], M_partials);
            // λ = (y_r−y_l)·inv_dx; x_n = λ² − (x_l+x_r); y_n = λ·(x_l−x_n)
            // − y_l — three SERIAL multiplies through ONE call site.
            var lambda: array<u32, 8>;
            var x_n: array<u32, 8>;
            var y_n: array<u32, 8>;
            var mp: array<u32, 8> = fr_sub_f8(y_r, y_l);
            var mq: array<u32, 8> = inv_dx;
            for (var t: u32 = 0u; t < 3u; t = t + 1u) {
                let m = montgomery_product_f8(mp, mq);
                switch t {
                    case 0u: {
                        lambda = m;
                        mp = m;
                        mq = m;
                    }
                    case 1u: {
                        x_n = fr_sub_f8(m, fr_add_f8(x_l, x_r));
                        mp = lambda;
                        mq = fr_sub_f8(x_l, x_n);
                    }
                    case 2u: {
                        y_n = fr_sub_f8(m, y_l);
                    }
                    default: {}
                }
            }

            let d = dst[s_i];
            if ((d & RED_FLAG) != 0u) {
                let rs = d & IDX_MASK;
                let bx = PG * rs;
                let by = PG * batch_offset.z + PG * rs;
                red_buf[bx + 0u] = vec4<u32>(x_n[0], x_n[1], x_n[2], x_n[3]);
                red_buf[bx + 1u] = vec4<u32>(x_n[4], x_n[5], x_n[6], x_n[7]);
                red_buf[by + 0u] = vec4<u32>(y_n[0], y_n[1], y_n[2], y_n[3]);
                red_buf[by + 1u] = vec4<u32>(y_n[4], y_n[5], y_n[6], y_n[7]);
            } else {
                partials_buf[PG * d + 0u] = vec4<u32>(x_n[0], x_n[1], x_n[2], x_n[3]);
                partials_buf[PG * d + 1u] = vec4<u32>(x_n[4], x_n[5], x_n[6], x_n[7]);
                partials_buf[PG * M_partials + PG * d + 0u] = vec4<u32>(y_n[0], y_n[1], y_n[2], y_n[3]);
                partials_buf[PG * M_partials + PG * d + 1u] = vec4<u32>(y_n[4], y_n[5], y_n[6], y_n[7]);
            }
        }
    }

    {{{ recompile }}}
}
