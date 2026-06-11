{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_by_funcs }}
{{> inverse_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Walker pair-tree, level kernel: one tree level of batched-affine pair
// additions over the WHOLE partial stream, in place.
//
// The scheduling unit is the ADDITION, not the bucket: at level k every
// bucket's surviving partials sit at segment-relative offsets j*2^k, and a
// pair is (rel, rel + 2^(k-1)) when the partner is inside the segment. One
// bucket with 256 partials contributes the same independent pair work as
// 128 buckets with 2 — identical scheduling, no classes, no planner: a
// thread tests stream positions directly (3 lookups) and idle slots join
// the batched inversion with identity dx.
//
// Each thread handles S consecutive candidate positions sharing ONE
// safegcd: forward dx prefix -> invert -> backward peel + affine add,
// result written to the LEFT slot of partials_buf (in place; the stream
// layout never moves). Performed adds are counted per workgroup and
// accumulated to pair_meta[level] — the arg-writer chain uses level k-1's
// count both to terminate (adds==0 <=> every bucket closed: a bucket with
// >=2 survivors performs >=1 add at every level) and to trigger the
// workgroup-fold tail when remaining work drops below the threshold.
//
// lvl.x = k (level, >=1); params.w = M_partials (partials_buf Y stride).
// pair_meta[level] = adds performed at this level (atomic).

const S: u32 = {{ s }}u;
const TPB: u32 = {{ workgroup_size }}u;
const PG: u32 = 2u;

// Discovery reads the scatter-built descriptors (rel, rem = cnt - rel —
// both static across levels): 2 coalesced words per slot instead of 4
// dependent random loads. desc_buf and partials_buf are sub-ranges of one
// arena buffer, so both are rw. P_total comes via pair_meta[28] (written
// by the level-1 args pass) — no partial_offset binding needed.
@group(0) @binding(0) var<storage, read>       arena_a2:       array<u32>;
@group(0) @binding(1) var<storage, read_write> partials_buf:   array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> pair_meta:      array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> desc_buf:       array<u32>;
// Direct-close: the pair that completes a bucket (rel == 0 and no
// residual beyond the partner) writes the bucket's final AFFINE sum
// straight to red_buf — resolve then only handles count==1 buckets and
// survivor routing, no full-width copy.
@group(0) @binding(4) var<storage, read_write> red_buf:        array<vec4<u32>>;
@group(0) @binding(5) var<storage, read>       window_desc:    array<u32>;
// rw (read-only use): partial_dest and red_buf share arena A1 — mixed
// ro+rw bindings of one buffer in a dispatch are illegal.
@group(0) @binding(6) var<storage, read_write> partial_dest:   array<u32>;
@group(0) @binding(7) var<uniform>             params:         vec4<u32>;
@group(0) @binding(8) var<uniform>             arena_off:      vec4<u32>;
@group(0) @binding(9) var<uniform>             lvl:            vec4<u32>;
@group(0) @binding(10) var<uniform>            batch_offset:   vec4<u32>;

const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;
const WD_STRIDE: u32 = 8u;
fn wd_reduce_off(g: u32) -> u32 { return window_desc[g * WD_STRIDE + 4u]; }

fn pl_at(i: u32) -> u32 { return arena_a2[arena_off.y + i]; }

fn write_red(bid: u32, x: array<u32, 8>, y: array<u32, 8>) {
    let window = bid >> WBID_SHIFT;
    let mag = bid & WBID_MAG_MASK;
    let rs = wd_reduce_off(window + batch_offset.x) + (mag - 1u);
    let bx = PG * rs;
    let by = PG * batch_offset.z + PG * rs;
    red_buf[bx + 0u] = vec4<u32>(x[0], x[1], x[2], x[3]);
    red_buf[bx + 1u] = vec4<u32>(x[4], x[5], x[6], x[7]);
    red_buf[by + 0u] = vec4<u32>(y[0], y[1], y[2], y[3]);
    red_buf[by + 1u] = vec4<u32>(y[4], y[5], y[6], y[7]);
}

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

var<workgroup> wg_adds: atomic<u32>;

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let k = lvl.x;
    let half = 1u << (k - 1u);
    let M_partials = params.w;
    let P_total = atomicLoad(&pair_meta[28]);
    let base = (gid.x) * S;

    if (lid.x == 0u) { atomicStore(&wg_adds, 0u); }
    workgroupBarrier();

    // Per-slot pair discovery. live[s]: this slot performs a real add.
    var lslot: array<u32, {{ s }}>;
    var rslot: array<u32, {{ s }}>;
    var live:  array<u32, {{ s }}>;
    var n_live: u32 = 0u;
    for (var s_i: u32 = 0u; s_i < S; s_i = s_i + 1u) {
        live[s_i] = 0u;
        let p = base + s_i;
        if (p >= P_total) { continue; }
        let rel = desc_buf[p];
        let rem = desc_buf[M_partials + p];
        // Left operand of a level-k pair: aligned to 2^k with an in-segment
        // partner at rel + 2^(k-1) (rel + half < cnt <=> half < rem).
        if ((rel & ((1u << k) - 1u)) == 0u && half < rem) {
            lslot[s_i] = pl_at(p);
            rslot[s_i] = pl_at(p + half);
            // live == 2: this pair CLOSES its bucket (head pair, nothing
            // beyond the partner) — its result goes to red_buf.
            live[s_i] = select(1u, 2u, rel == 0u && rem <= 2u * half);
            n_live = n_live + 1u;
        }
    }

    if (n_live > 0u) { atomicAdd(&wg_adds, n_live); }

    // Idle threads skip the whole batch (prefix, ~30-mul safegcd
    // inversion, peel): without this, a near-drained level dispatch
    // still walls at inversion-chain latency in every thread.
    if (n_live > 0u) {
        // Batched affine: forward prefix of dx (identity for idle slots).
        let R: array<u32, 8> = get_r_f8();
        var pref: array<array<u32, 8>, {{ s }}>;
        var prod: array<u32, 8> = R;
        for (var s_i: u32 = 0u; s_i < S; s_i = s_i + 1u) {
            var dx: array<u32, 8> = R;
            if (live[s_i] >= 1u) {
                let x_l = load_x(lslot[s_i]);
                let x_r = load_x(rslot[s_i]);
                dx = fr_sub_f8(x_r, x_l);
                // Doubling violation (x_r == x_l) would zero the batch product;
                // substitute identity — that bucket alone is garbage (standing
                // incomplete-add assumption, same blast radius as elsewhere).
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

        // Backward peel + affine add, result to the LEFT slot.
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
            var lambda = fr_sub_f8(y_r, y_l);
            lambda = montgomery_product_f8(lambda, inv_dx);
            var x_n = montgomery_product_f8(lambda, lambda);
            x_n = fr_sub_f8(x_n, fr_add_f8(x_l, x_r));
            var y_n = fr_sub_f8(x_l, x_n);
            y_n = montgomery_product_f8(lambda, y_n);
            y_n = fr_sub_f8(y_n, y_l);

            if (live[s_i] == 2u) {
                write_red(partial_dest[lslot[s_i]], x_n, y_n);
            } else {
                let d = lslot[s_i];
                partials_buf[PG * d + 0u] = vec4<u32>(x_n[0], x_n[1], x_n[2], x_n[3]);
                partials_buf[PG * d + 1u] = vec4<u32>(x_n[4], x_n[5], x_n[6], x_n[7]);
                partials_buf[PG * M_partials + PG * d + 0u] = vec4<u32>(y_n[0], y_n[1], y_n[2], y_n[3]);
                partials_buf[PG * M_partials + PG * d + 1u] = vec4<u32>(y_n[4], y_n[5], y_n[6], y_n[7]);
            }
        }
    }

    workgroupBarrier();
    if (lid.x == 0u) {
        let t = atomicLoad(&wg_adds);
        if (t > 0u) { atomicAdd(&pair_meta[k], t); }
    }

    {{{ recompile }}}
}
