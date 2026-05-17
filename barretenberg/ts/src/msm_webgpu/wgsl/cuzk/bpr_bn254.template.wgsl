{{> structs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_funcs }}
{{> ec_funcs }}

/// Used as input buffers for the bucket sums from SMVP, but also repurposed to
/// store the m points.
@group(0) @binding(0)
var<storage, read_write> bucket_sum_x: array<BigInt>;
@group(0) @binding(1)
var<storage, read_write> bucket_sum_y: array<BigInt>;
@group(0) @binding(2)
var<storage, read_write> bucket_sum_z: array<BigInt>;

// Output buffers to store the g points
@group(0) @binding(3)
var<storage, read_write> g_points_x: array<BigInt>;
@group(0) @binding(4)
var<storage, read_write> g_points_y: array<BigInt>;
@group(0) @binding(5)
var<storage, read_write> g_points_z: array<BigInt>;

// Unfiform storage buffer.
@group(0) @binding(6)
var<uniform> params: vec3<u32>;

{{#capture_debug}}
// Debug capture for stage_2's inline add-2007-bl formula. Layout: 8 BigInts
// per thread, indexed as debug_capture[thread_id * 8 + k]:
//   k=0: g.x   (input loaded by load_g_point at top of stage_2)
//   k=1: g.z
//   k=2: sm.x  (output of double_and_add)
//   k=3: sm.z
//   k=4: X3_out (read from outer scope after the if/else)
//   k=5: Y3_out (read from outer scope after the if/else)
//   k=6: Z3_out read inside the formula-else branch at the computation site
//   k=7: Z3_out read outside the if/else (final value written to g_points_z[t])
@group(0) @binding(7)
var<storage, read_write> debug_capture: array<BigInt>;
{{/capture_debug}}

// Microbench sink. Used by bench_null and bench_no_store variants to
// give the kernel one observable workgroup-level write per thread,
// preventing the WGSL compiler from DCEing the entire kernel body.
// Always declared (zero cost when unused). NOT a binding — workgroup
// scope only.
var<workgroup> bench_sink: atomic<u32>;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

fn get_paf() -> Point {
    var result: Point;
    result.y = get_r();
    return result;
}

/// This double-and-add code is adapted from the ZPrize test harness:
/// https://github.com/demox-labs/webgpu-msm/blob/main/src/reference/webgpu/wgsl/Curve.ts#L78.
//
// Inner add uses add_points_no_collision (not add_points). On Dawn/Metal the
// general add_points's `bigint_eq(&U1,&U2) && bigint_eq(&S1,&S2)` collision
// check was firing spuriously after `temp = double_point(temp)` ran on a prior
// iteration, routing into the double_point(p1) fallback and producing 2*result
// instead of result+temp. double_and_add starts from identity and adds distinct
// points each iteration, so the collision branch is mathematically unreachable
// here; dropping it sidesteps the codegen trap.
fn double_and_add(point: Point, scalar: u32) -> Point {
    /// Set result to the point at infinity.
    var result: Point = get_paf();

    var s = scalar;
    var temp = point;

    while (s != 0u) {
        if ((s & 1u) == 1u) {
            result = add_points_no_collision(result, temp);
        }
        temp = double_point(temp);
        s = s >> 1u;
    }
    return result;
}

fn load_bucket_sum(idx: u32) -> Point {
    return Point(
        bucket_sum_x[idx],
        bucket_sum_y[idx],
        bucket_sum_z[idx]
    );
}

// Separate helper for g_points. Must NOT inline an equivalent
// `Point(g_points_x[t], g_points_y[t], g_points_z[t])` in stage_2's main
// body — doing so produces an inputs-look-fine-but-downstream-fails result
// on at least some WebGPU backends (Dawn / macOS Metal, circa 2026). The
// indirection through a function with an explicit `return Point(...)`
// dodges whatever composite-construction issue that path hits. See
// diagnostic v7..v9 in src/submission/miscellaneous/tests/
// jacobian_bn254.test.ts for the localization.
fn load_g_point(t: u32) -> Point {
    return Point(
        g_points_x[t],
        g_points_y[t],
        g_points_z[t]
    );
}

// Symmetric helper to load_g_point. Currently unused — the inline stage_2
// formula writes g_points_*[t] directly. Kept available for future call-sites
// that need to dodge caller-side struct-slot quirks on Dawn/Metal.
fn store_g_point(t: u32, p: Point) {
    g_points_x[t] = p.x;
    g_points_y[t] = p.y;
    g_points_z[t] = p.z;
}

// Microbench helpers. Synthesize a Point from per-thread/per-iter seeds so
// the compiler cannot constant-fold or DCE the inner-loop arithmetic in the
// bench_compute_only variant. Z = R (Mont 1) keeps the synthesized point on
// the non-identity branch of add_points (the realistic hot path). The X/Y
// limbs are mathematically garbage but the bit pattern still drives every
// montgomery_product, fr_sub, and fr_add — exercising real ALU cost.
fn bench_synth_point(seed_a: u32, seed_b: u32) -> Point {
    var p: Point;
    p.x.limbs[0] = (seed_a ^ seed_b) | 1u;
    for (var k = 1u; k < {{ num_words }}u; k = k + 1u) {
        p.x.limbs[k] = seed_a + seed_b * k + 17u;
    }
    p.y = p.x;
    p.z = get_r();
    return p;
}

// Cheap mix-and-replace used by the bench_memory_only variant. XORs every
// limb of `b` into `m`. Touches both inputs (so the loads can't be DCEd)
// while running ~num_words u32 ops per call instead of ~400 (one Mont mul).
fn bench_xor_into(a: Point, b: Point) -> Point {
    var r: Point;
    for (var k = 0u; k < {{ num_words }}u; k = k + 1u) {
        r.x.limbs[k] = a.x.limbs[k] ^ b.x.limbs[k];
        r.y.limbs[k] = a.y.limbs[k] ^ b.y.limbs[k];
        r.z.limbs[k] = a.z.limbs[k] ^ b.z.limbs[k];
    }
    return r;
}

@compute
@workgroup_size({{ workgroup_size }})
fn stage_1(@builtin(global_invocation_id) global_id: vec3<u32>) {    
    let thread_id = global_id.x; 
    let num_threads_per_subtask = {{ workgroup_size }}u;

    let subtask_idx = params[0]; // 0, 2, 4, 6, ...
    let num_columns = params[1]; // 65536
    let num_subtasks_per_bpr = params[2]; // Must be a power of 2

    /// Number of buckets per subtask.
    let num_buckets_per_subtask = num_columns / 2u; // 2 ** 15 = 32768

    // e.g. if each iteration handles 2 subtasks and there are 32768 buckets
    // per subtask, the number of buckets handled per BPR iteration is 65536
    let num_buckets_per_bpr = num_buckets_per_subtask * num_subtasks_per_bpr;

    /// Number of buckets to reduce per thread.
    let buckets_per_thread = num_buckets_per_subtask / 
                             num_threads_per_subtask;

    let multiplier = subtask_idx + (thread_id / num_threads_per_subtask);
    let offset = num_buckets_per_subtask * multiplier;

    var idx = offset;
    if (thread_id % num_threads_per_subtask != 0u) {
        idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) * 
              buckets_per_thread + offset;
    }

{{#bench_compute_only}}
    // Microbench: synthesize the initial m so this load is also stripped.
    var m = bench_synth_point(thread_id, idx);
{{/bench_compute_only}}
{{^bench_compute_only}}
    var m = load_bucket_sum(idx);
{{/bench_compute_only}}
    var g = m;

{{#assume_affine_buckets}}
    // Optimised path for batch-affine SMVP output where every input
    // bucket is either Z = R (affine packaged into Jacobian) or Z = 0
    // (identity). Wins:
    //   • `m += b` uses mixed-add (7M+4S) instead of full add (11M+5S).
    //   • `g += m` uses no-collision Jacobian add (skips bigint_eq).
    //
    // Two state flags handle edge cases without bigint_eq:
    //   m_is_zero  — m is currently identity (Z = 0). Assignment
    //                replaces mixed-add so the formula never sees Z1=0.
    //   m_eq_g     — m == g and both non-identity. The next g update
    //                must use double_point(m) instead of add_no_collision
    //                to avoid the same-point trap.
    //
    // FUNCTION-CALL form (NOT inlined). Aggressive inlining of all
    // three Point-returning helpers (double_point, add_mixed_no_collision,
    // add_no_collision) was attempted and produced a 2× SLOWDOWN vs the
    // legacy path because the inlined block declares ~30 BigInt locals
    // per formula (each 80 B, 20 u32 registers); Tint can't reuse
    // registers across `if`/`else` branches as effectively as it can
    // across function call boundaries, and the kernel started spilling
    // heavily to local memory.
    //
    // The function definitions in ec_bn254.template.wgsl already apply
    // the documented Tint Z-drop workaround (field-by-field assignment
    // before return — see `add_points_no_collision`'s comment "FIX (see
    // add_points above): field assignment, not constructor return."
    // at ec_bn254.template.wgsl:206-211). The mixed-add for m HAS been
    // empirically fast as a function call in this codebase via
    // `mixed_safe_buckets` (production-stable; saves ~9 ms vs legacy).
    // assume_affine adds the no-collision g update on top.

    var m_is_zero: bool = is_zero(m.z);
    var m_eq_g: bool = false;

    // Iter 0:
    if (buckets_per_thread > 1u) {
        let idx0 = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                   buckets_per_thread - 1u;
        let b0 = load_bucket_sum(offset + idx0);
        if (is_zero(b0.z)) {
            // b0 = identity: m unchanged; g doubles when m non-identity.
            if (!m_is_zero) {
                g = double_point(m);
            }
            // If m_is_zero: both stay identity, nothing to do.
        } else if (m_is_zero) {
            // m = identity, b0 non-identity: assign (mixed-add is wrong for Z1=0).
            m = b0; g = b0; m_is_zero = false; m_eq_g = true;
        } else {
            // Both non-identity. m += b0 (mixed-add); g += new_m (no-collision).
            // g_before = m_initial; new_m = m_initial + b0.
            // g_before != new_m (since b0 != identity), so add_no_collision is safe.
            m = add_points_mixed_no_collision(m, b0);
            g = add_points_no_collision(g, m);
            // m_eq_g stays false.
        }
    }

    // Iter 1+: m_is_zero and m_eq_g guide safe accumulation.
    for (var i = 1u; i < buckets_per_thread - 1u; i++) {
        let idx_i = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                    buckets_per_thread - 1u - i;
        let b = load_bucket_sum(offset + idx_i);

        if (is_zero(b.z)) {
            // m unchanged.
            if (m_is_zero) {
                // both identity, nothing to do
            } else if (m_eq_g) {
                // g == m: doubling instead of add_no_collision on equal pts.
                g = double_point(m);
                m_eq_g = false;
            } else {
                g = add_points_no_collision(g, m);
            }
        } else {
            // b non-identity.
            if (m_is_zero) {
                m = b; g = b; m_is_zero = false; m_eq_g = true;
            } else {
                m = add_points_mixed_no_collision(m, b);
                // If m_eq_g was set: old_g == old_m, new_m = old_m + b ≠ old_g
                // (since b ≠ identity). add_no_collision is safe either way.
                g = add_points_no_collision(g, m);
                m_eq_g = false;
            }
        }
    }
{{/assume_affine_buckets}}
{{^assume_affine_buckets}}
{{#mixed_safe_buckets}}
    // Inline mixed-add for the m update. Mirrors stage_2's inline
    // add-2007-bl pattern: the function-call form
    // (add_points_mixed_no_collision) drops Z at this BPR call site
    // due to the same Dawn/Metal codegen quirk that bit add_points'
    // constructor return. Inlining sidesteps the function-return
    // mechanism and writes m.x/y/z directly.
    //
    // Z3 is computed IMMEDIATELY after H (stage_2 trick) to keep H's
    // live range short and prevent Tint from reusing its register for
    // a later local in the formula body.
    //
    // Caller guarantees: non-identity bucket Z = R (Montgomery 1).
    // Identity bucket → outer `if (!is_zero(b.z))` skips the m update.
    for (var i = 0u; i < buckets_per_thread - 1u; i++) {
        let idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                  buckets_per_thread - 1u - i;
        let bi = offset + idx;
        let b = load_bucket_sum(bi);

        if (!is_zero(b.z)) {
            if (is_zero(m.z)) {
                // m = identity: copy b's affine coords, Z = mont_one.
                // Local block scope keeps `r` separate from the
                // formula's `r_local` used in the else-branch.
                var r: BigInt;
{{{ r_limbs }}}
                m.x = b.x;
                m.y = b.y;
                m.z = r;
            } else {
                // Mixed-add formula (Z2 = 1 assumed). Writes to m.x/y/z directly.
                var X1: BigInt = m.x; var Y1: BigInt = m.y; var Z1: BigInt = m.z;
                var X2: BigInt = b.x; var Y2: BigInt = b.y;

                var Z1Z1 = montgomery_product(&Z1, &Z1);
                var U2 = montgomery_product(&X2, &Z1Z1);
                var Y2Z1 = montgomery_product(&Y2, &Z1);
                var S2 = montgomery_product(&Y2Z1, &Z1Z1);

                var H = fr_sub(&U2, &X1);
                var HH = montgomery_product(&H, &H);

                // Z3 right after H — stage_2 trick to keep H live.
                var ZpH = fr_add(&Z1, &H);
                var ZpH_sq = montgomery_product(&ZpH, &ZpH);
                var Z3_local = fr_sub(&ZpH_sq, &Z1Z1);
                Z3_local = fr_sub(&Z3_local, &HH);

                // I = 4*HH
                var I = fr_add(&HH, &HH);
                I = fr_add(&I, &I);

                var J = montgomery_product(&H, &I);

                var S2mY1 = fr_sub(&S2, &Y1);
                var r_local = fr_add(&S2mY1, &S2mY1);

                var V = montgomery_product(&X1, &I);

                var r_sq = montgomery_product(&r_local, &r_local);
                var twoV = fr_add(&V, &V);
                var X3_local = fr_sub(&r_sq, &J);
                X3_local = fr_sub(&X3_local, &twoV);

                var VmX3 = fr_sub(&V, &X3_local);
                var rVX = montgomery_product(&r_local, &VmX3);
                var Y1J = montgomery_product(&Y1, &J);
                var twoY1J = fr_add(&Y1J, &Y1J);
                var Y3_local = fr_sub(&rVX, &twoY1J);

                m.x = X3_local;
                m.y = Y3_local;
                m.z = Z3_local;
            }
        }
        // g += m — full safe add (collision + identity handling).
        g = add_points(g, m);
    }
{{/mixed_safe_buckets}}
{{^mixed_safe_buckets}}
    // Legacy path: bucket Z is general Jacobian (e.g. legacy SMVP
    // output). Must use add_points (with collision fallback) — the
    // BPR running-sum pattern produces g == m whenever an identity
    // bucket follows a non-identity one in iter 0; add_points_no_collision
    // would silently return (0, 0, 0) and corrupt the reduction.
    //
    // Microbench variants (mutually exclusive flags, all default off):
    //   bench_null          — skip inner loop entirely (V_NULL)
    //   bench_compute_only  — strip bucket reads; keep adds (V1)
    //   bench_memory_only   — strip adds; keep bucket reads (V2)
    //   (none)              — production legacy add_points loop (V0/V3)
    //
    // The writes at the end of stage_1 are gated by bench_no_store
    // separately (V3) so we can isolate write cost from inner-loop cost.
{{#bench_null}}
    // V_NULL: do nothing. Measures dispatch + thread-launch + the few
    // header instructions; floor for everything else.
{{/bench_null}}
{{^bench_null}}
{{#bench_compute_only}}
    // V1: synthesize `b` per iteration so the bucket_sum_* reads are
    // gone. Keep both add_points calls so the compute path is unchanged.
    for (var i = 0u; i < buckets_per_thread - 1u; i ++) {
        let idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                  buckets_per_thread - 1u - i;
        let bi = offset + idx;
        let b = bench_synth_point(thread_id ^ i, bi);
        m = add_points(m, b);
        g = add_points(g, m);
    }
{{/bench_compute_only}}
{{^bench_compute_only}}
{{#bench_memory_only}}
    // V2: keep the bucket loads; replace add_points with cheap limb XOR.
    // bench_xor_into touches both args, so the loads can't be DCEd.
    for (var i = 0u; i < buckets_per_thread - 1u; i ++) {
        let idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                  buckets_per_thread - 1u - i;
        let bi = offset + idx;
        let b = load_bucket_sum(bi);
        m = bench_xor_into(m, b);
        g = bench_xor_into(g, m);
    }
{{/bench_memory_only}}
{{^bench_memory_only}}
{{#safe_first_add_no_collision}}
    // Production path with `add_points_no_collision` for the first add.
    //
    // The `m = m + b` site is collision-free with overwhelming probability:
    // m is the running sum so far, b is a fresh bucket sum from a DIFFERENT
    // bucket index. For random scalars the chance that two distinct bucket
    // sums share the same X coordinate is ~2/q ≈ 2^-253 — negligible. So
    // the bigint_eq collision branch in the legacy add_points never fires
    // here, and dropping it saves the two ~20-op bigint_eq checks per call
    // (and the warp-divergent fallback path) without any loss of correctness
    // for non-adversarial inputs.
    //
    // The second add `g = g + m` is NOT switched. In iter 0, g equals the
    // initial m, and if b0 is identity (~25% of buckets at chunk_size=15
    // N=2^16) then m_new == g — the collision case the safe `add_points`
    // routes to `double_point`. We can't drop the check there.
    //
    // Uses the GENERAL `add_points_no_collision` (already exercised by
    // stage_2's `double_and_add`), NOT `add_points_mixed_no_collision`.
    // The mixed variant has been independently shown to trigger Tint
    // codegen issues in this codebase (see feedback_bpr_mixed_safe_broken).
    for (var i = 0u; i < buckets_per_thread - 1u; i ++) {
        let idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                  buckets_per_thread - 1u - i;
        let bi = offset + idx;
        let b = load_bucket_sum(bi);
        m = add_points_no_collision(m, b);
        g = add_points(g, m);
    }
{{/safe_first_add_no_collision}}
{{^safe_first_add_no_collision}}
    // Production legacy path.
    for (var i = 0u; i < buckets_per_thread - 1u; i ++) {
        let idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) *
                  buckets_per_thread - 1u - i;
        let bi = offset + idx;
        let b = load_bucket_sum(bi);
        m = add_points(m, b);
        g = add_points(g, m);
    }
{{/safe_first_add_no_collision}}
{{/bench_memory_only}}
{{/bench_compute_only}}
{{/bench_null}}
{{/mixed_safe_buckets}}
{{/assume_affine_buckets}}

    let t = (subtask_idx / num_subtasks_per_bpr) *
            (num_threads_per_subtask * num_subtasks_per_bpr) +
            thread_id;

{{#bench_skip_writes}}
    // V_NULL / V3: skip the 6 storage writes (bucket_sum + g_points).
    // Funnel one observable write per thread into the workgroup atomic
    // sink so the WGSL compiler can't DCE the inner loop. atomicXor is
    // the cheapest read-modify-write that can't be folded; it produces
    // 1 LDS op per thread vs 6 storage writes in the production path.
    atomicXor(&bench_sink, m.x.limbs[0] ^ g.x.limbs[0] ^ t);
{{/bench_skip_writes}}
{{^bench_skip_writes}}
    bucket_sum_x[idx] = m.x;
    bucket_sum_y[idx] = m.y;
    bucket_sum_z[idx] = m.z;

    g_points_x[t] = g.x;
    g_points_y[t] = g.y;
    g_points_z[t] = g.z;
{{/bench_skip_writes}}

    {{{ recompile }}}
}

@compute
@workgroup_size({{ workgroup_size }})
fn stage_2(@builtin(global_invocation_id) global_id: vec3<u32>) {    
    let thread_id = global_id.x; 
    let num_threads_per_subtask = {{ workgroup_size }}u;

    let subtask_idx = params[0]; // 0, 2, 4, 6, ...
    let num_columns = params[1]; // 65536
    let num_subtasks_per_bpr = params[2]; // Must be a power of 2

    /// Number of buckets per subtask.
    let num_buckets_per_subtask = num_columns / 2u; // 2 ** 15 = 32768

    // e.g. if each iteration handles 2 subtasks and there are 32768 buckets
    // per subtask, the number of buckets handled per BPR iteration is 65536
    let num_buckets_per_bpr = num_buckets_per_subtask * num_subtasks_per_bpr;

    /// Number of buckets to reduce per thread.
    let buckets_per_thread = num_buckets_per_subtask / 
                             num_threads_per_subtask;

    let multiplier = subtask_idx + (thread_id / num_threads_per_subtask);
    let offset = num_buckets_per_subtask * multiplier;

    var idx = offset;
    if (thread_id % num_threads_per_subtask != 0u) {
        idx = (num_threads_per_subtask - (thread_id % num_threads_per_subtask)) * 
              buckets_per_thread + offset;
    }

    var m = load_bucket_sum(idx);

    let t = (subtask_idx / num_subtasks_per_bpr) *
            (num_threads_per_subtask * num_subtasks_per_bpr) +
            thread_id;
    var g = load_g_point(t);

    let s = buckets_per_thread * (num_threads_per_subtask - (thread_id % num_threads_per_subtask) - 1u);
    let sm: Point = double_and_add(m, s);

    // The add-2007-bl formula is inlined here (rather than calling
    // add_points(g, sm)) because on Dawn/Metal the function-return slot for
    // a Point loses its Z field at this call-site — multiple return-shape
    // workarounds were tried and all dropped Z. Inlining sidesteps the
    // function-return mechanism; X3, Y3, Z3 live in function-scope vars and
    // are written to g_points_*[t] directly after the if/else.
    var X3_out: BigInt;
    var Y3_out: BigInt;
    var Z3_out: BigInt;

    {{#capture_debug}}
    // Capture inputs to the inline formula at the OUTER scope so we always
    // see what stage_2 actually loaded, regardless of which branch fires.
    debug_capture[thread_id * 8u + 0u] = g.x;
    debug_capture[thread_id * 8u + 1u] = g.z;
    debug_capture[thread_id * 8u + 2u] = sm.x;
    debug_capture[thread_id * 8u + 3u] = sm.z;
    {{/capture_debug}}

    if (is_zero(g.z)) {
        X3_out = sm.x; Y3_out = sm.y; Z3_out = sm.z;
    } else if (is_zero(sm.z)) {
        X3_out = g.x; Y3_out = g.y; Z3_out = g.z;
    } else {
        var X1 = g.x;  var Y1 = g.y;  var Z1 = g.z;
        var X2 = sm.x; var Y2 = sm.y; var Z2 = sm.z;

        var Z1Z1 = montgomery_product(&Z1, &Z1);
        var Z2Z2 = montgomery_product(&Z2, &Z2);

        var U1 = montgomery_product(&X1, &Z2Z2);
        var U2 = montgomery_product(&X2, &Z1Z1);

        var Y1Z2 = montgomery_product(&Y1, &Z2);
        var S1 = montgomery_product(&Y1Z2, &Z2Z2);
        var Y2Z1 = montgomery_product(&Y2, &Z1);
        var S2 = montgomery_product(&Y2Z1, &Z1Z1);

        // Collision fallback: g == sm affinely -> double_point(g).
        if (bigint_eq(&U1, &U2) && bigint_eq(&S1, &S2)) {
            let dbl = double_point(g);
            X3_out = dbl.x; Y3_out = dbl.y; Z3_out = dbl.z;
        } else {
            var H = fr_sub(&U2, &U1);
            var S2mS1 = fr_sub(&S2, &S1);

            // Z3 is computed here, immediately after H is born, NOT at the
            // tail of the formula where add-2007-bl normally places it. On
            // Dawn/Metal, Tint's register allocator was reusing H's storage
            // slot for one of the ~8 BigInt locals that get declared between
            // H's last inner-formula use and the original Z3 site, causing
            // the Z3 multiply to read H = 0. Computing Z3 up-front keeps H's
            // live range short. Math is unchanged: the EFD trick
            // Z3 = ((Z1+Z2)^2 - Z1Z1 - Z2Z2) * H.
            var ZpZ = fr_add(&Z1, &Z2);
            var ZpZ_sq = montgomery_product(&ZpZ, &ZpZ);
            var zsum = fr_sub(&ZpZ_sq, &Z1Z1);
            zsum = fr_sub(&zsum, &Z2Z2);
            Z3_out = montgomery_product(&zsum, &H);

            {{#capture_debug}}
            // Z3_out at the computation site. Slot 7 captures the same var
            // outside the if/else and verifies it persists across the boundary.
            debug_capture[thread_id * 8u + 6u] = Z3_out;
            {{/capture_debug}}

            var twoH = fr_add(&H, &H);
            var I = montgomery_product(&twoH, &twoH);
            var J = montgomery_product(&H, &I);

            var r = fr_add(&S2mS1, &S2mS1);
            var V = montgomery_product(&U1, &I);

            var r_sq = montgomery_product(&r, &r);
            var twoV = fr_add(&V, &V);
            X3_out = fr_sub(&r_sq, &J);
            X3_out = fr_sub(&X3_out, &twoV);

            var VmX3 = fr_sub(&V, &X3_out);
            var rVX = montgomery_product(&r, &VmX3);
            var S1J = montgomery_product(&S1, &J);
            var twoS1J = fr_add(&S1J, &S1J);
            Y3_out = fr_sub(&rVX, &twoS1J);
        }
    }

    g_points_x[t] = X3_out;
    g_points_y[t] = Y3_out;
    g_points_z[t] = Z3_out;

    {{#capture_debug}}
    // Final values of the formula outputs, read from outer scope.
    debug_capture[thread_id * 8u + 4u] = X3_out;
    debug_capture[thread_id * 8u + 5u] = Y3_out;
    debug_capture[thread_id * 8u + 7u] = Z3_out;
    {{/capture_debug}}

    {{{ recompile }}}
}
