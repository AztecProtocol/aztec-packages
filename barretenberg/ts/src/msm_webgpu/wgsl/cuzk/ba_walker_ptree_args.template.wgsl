// Walker pair-tree: per-level arg chain (single thread, runs before each
// level). Reads the PREVIOUS level's performed-add count from ptree meta:
//   adds == 0          -> every bucket closed; stop (zero remaining levels)
//   0 < adds < THETA   -> thread-starved; stop the tree and record the
//                         switch level k* — the workgroup-fold tail takes
//                         the survivors (buckets with count > 2^(k*-1))
//   else               -> full level dispatch over the stream
// Also zeroes this level's add counter, and (k == 1 only) writes the
// finalize-copy dispatch args from active_count.
//
// meta layout (u32, in merge scratch at the ptree region):
//   [0..17]  adds performed per level k
//   [20]     stop/switch level k* (0 = tree still running; 18 = completed)
//   [21]     survivor count (written by ptree_scan)
// lvl.x = k; lvl.y = THETA.

const S: u32 = {{ s }}u;
const TPB: u32 = {{ workgroup_size }}u;
const FIN_TPB: u32 = 256u;

// active_meta: [0] = active bucket count, [1] = alloc total (= P_total) —
// both from walker_index v2's alloc pass.
@group(0) @binding(0) var<storage, read_write> ptree_meta:   array<u32>;
@group(0) @binding(1) var<storage, read>       active_meta:  array<u32>;
@group(0) @binding(2) var<storage, read_write> level_args:   array<u32>;
@group(0) @binding(3) var<uniform>             lvl:          vec4<u32>;

@compute @workgroup_size(1)
fn main() {
    let k = lvl.x;
    let THETA = lvl.y;
    let abase = 4u * k; // level k's args at level_args[4k .. 4k+2]

    ptree_meta[k] = 0u; // this level's add counter starts at zero

    if (k == 1u) {
        ptree_meta[20] = 0u;
        ptree_meta[21] = 0u;
        ptree_meta[25] = 0u;
        ptree_meta[26] = 0u;
        // finalize-copy args (slot 0 of level_args): one thread per active.
        let n_active = active_meta[0];
        level_args[0] = (n_active + FIN_TPB - 1u) / FIN_TPB;
        level_args[1] = 1u;
        level_args[2] = 1u;
    } else {
        let stopped = ptree_meta[20];
        if (stopped != 0u) {
            level_args[abase + 0u] = 0u;
            level_args[abase + 1u] = 1u;
            level_args[abase + 2u] = 1u;
            {{{ recompile }}}
            return;
        }
        let prev = ptree_meta[k - 1u];
        // Depth-aware stop: only hand the tail to the fold once the
        // deepest bucket's residuals (max_cnt / 2^(k-1); meta[27] from
        // the scatter) fit a bounded fold (<= 4096 = 16 serial madds per
        // TPB-256 thread).
        let depth_ok = (ptree_meta[27] >> (k - 1u)) <= 4096u;
        if (prev == 0u || (prev < THETA && depth_ok)) {
            // 0: complete (record 18 so no bucket matches the survivor
            // test); starved: record k — survivors have count > 2^(k-1).
            ptree_meta[20] = select(k, 18u, prev == 0u);
            level_args[abase + 0u] = 0u;
            level_args[abase + 1u] = 1u;
            level_args[abase + 2u] = 1u;
            {{{ recompile }}}
            return;
        }
    }

    let p_total = active_meta[1];
    if (k == 1u) { ptree_meta[28] = p_total; } // levels read it from meta
    level_args[abase + 0u] = (p_total + S * TPB - 1u) / (S * TPB);
    level_args[abase + 1u] = 1u;
    level_args[abase + 2u] = 1u;
    // Final level (lvl.z): no later args pass exists to record the stop, so
    // pre-record k* = k+1 — survivors are then cnt > 2^k at stride 2^k,
    // which is exactly the post-level-k residual spacing.
    if (lvl.z == 1u) { ptree_meta[20] = k + 1u; }

    {{{ recompile }}}
}
