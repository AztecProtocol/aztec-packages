{{> inverse_funcs }}

{{> field8_funcs }}

// Addition-schedule normalize: deposit every projective-rooted bucket's
// sum into red_buf as affine, with the inversions BATCHED — C roots per
// thread share one safegcd via the prefix-product chain (the walker
// pattern). Replaces per-root normalization entirely: ~3 multiplies per
// root plus one ~30-mul inverse per C roots.
//
// Roots are homogeneous projective (X : Y : Z), Z != 0 (P + (−P) inside
// a bucket is dlog-excluded): x = X·Z⁻¹, y = Y·Z⁻¹.
//
// Normalize entry: {xy_slot, z_slot, red_slot, 0}; the list sits
// immediately after the schedule's entry region. count = sched_meta[19];
// list base (vec4 units) = entries base + total entries.
// params.w = M_partials; batch_offset.z = red_buf Y-plane stride.

const C: u32 = {{ norm_c }}u;
const TPB: u32 = {{ workgroup_size }}u;
const PG: u32 = 2u;
const MAX_LAYERS: u32 = 18u;

@group(0) @binding(0) var<storage, read>       sched_meta:    array<u32>;
@group(0) @binding(1) var<storage, read>       sched_entries: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read>       partials_buf:  array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> red_buf:       array<vec4<u32>>;
@group(0) @binding(4) var<uniform>             params:        vec4<u32>;
@group(0) @binding(5) var<uniform>             batch_offset:  vec4<u32>;
@group(0) @binding(6) var<uniform>             sched_off:     vec4<u32>;

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
    let mb = sched_off.x;
    let n_roots = sched_meta[mb + 19u];
    // Hoist the composed index: Adreno miscompiles the inline subscript
    // sched_meta[mb + 24u + (MAX_LAYERS - 1u)]. See sched_coop2 for the same fix.
    let lastL = MAX_LAYERS - 1u;
    let teidx = mb + 24u + lastL;
    let total_entries = sched_meta[teidx] + sched_meta[mb + lastL];
    let nbase = sched_off.w + total_entries;
    let M_partials = params.w;
    let base = gid.x * C;
    if (base >= n_roots) { return; }

    let R: array<u32, 8> = get_r_f8();

    // Forward: product chain over the C roots' Z values (identity for
    // tail-clipped lanes' slots).
    var pref: array<array<u32, 8>, {{ norm_c }}>;
    var prod: array<u32, 8> = R;
    for (var i: u32 = 0u; i < C; i = i + 1u) {
        var z: array<u32, 8> = R;
        if (base + i < n_roots) {
            let e = sched_entries[nbase + base + i];
            z = load_x(e.y);
        }
        if (i == 0u) {
            prod = z;
        } else {
            prod = montgomery_product_f8(prod, z);
        }
        if (i + 1u < C) { pref[i] = prod; }
    }

    var inv = {{ inv_fn }}(prod);

    // Backward peel: per-root z⁻¹, two multiplies to affine, red write.
    for (var j: u32 = 0u; j < C; j = j + 1u) {
        let i = C - 1u - j;
        var z_b: array<u32, 8> = R;
        let in_range = base + i < n_roots;
        var e: vec4<u32>;
        if (in_range) {
            e = sched_entries[nbase + base + i];
            z_b = load_x(e.y);
        }
        var zinv: array<u32, 8>;
        if (i == 0u) {
            zinv = inv;
        } else {
            zinv = montgomery_product_f8(inv, pref[i - 1u]);
            inv = montgomery_product_f8(inv, z_b);
        }
        if (!in_range) { continue; }

        let x_aff = montgomery_product_f8(load_x(e.x), zinv);
        let y_aff = montgomery_product_f8(load_y(e.x, M_partials), zinv);
        let rs = e.z;
        let bx = PG * rs;
        let by = PG * batch_offset.z + PG * rs;
        red_buf[bx + 0u] = vec4<u32>(x_aff[0], x_aff[1], x_aff[2], x_aff[3]);
        red_buf[bx + 1u] = vec4<u32>(x_aff[4], x_aff[5], x_aff[6], x_aff[7]);
        red_buf[by + 0u] = vec4<u32>(y_aff[0], y_aff[1], y_aff[2], y_aff[3]);
        red_buf[by + 1u] = vec4<u32>(y_aff[4], y_aff[5], y_aff[6], y_aff[7]);
    }

    {{{ recompile }}}
}
