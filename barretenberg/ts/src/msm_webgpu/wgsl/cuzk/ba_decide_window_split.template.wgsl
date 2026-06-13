// Variable-window split decision (split-c Phase 2). Single-workgroup, single-thread
// GPU port of choose_var_window_split / predict_schedule_cost /
// build_var_window_schedule (var_window_split.ts, itself a port of the C++ reference
// scalar_multiplication.cpp @ pippenger-refactor-full-11-may). The cost model and
// grid search are kept verbatim; the window-bits picker is the GPU's pickC (a
// logN->c lookup), so a split's lower region uses pickC(n) == the unsplit c and the
// NO_SPLIT path reproduces today's uniform WindowDesc byte-for-byte.
//
// Reads the 256-bin MSB histogram (from ba_msb_histogram), writes WindowDesc[] and a
// schedule summary. The decision input is the 256 bins, not n — no O(n) work here.

@group(0) @binding(0) var<storage, read>       msb_hist:    array<u32>;       // 256 bins
@group(0) @binding(1) var<storage, read_write> window_desc: array<u32>;       // WD_STRIDE * rows
@group(0) @binding(2) var<storage, read_write> summary:     array<u32>;       // see layout below
@group(0) @binding(3) var<uniform>             params:      vec4<u32>;
// params.x = n, params.y = c_env (envelope c = max width = pickC(n); the host sized
//   red_buf for 2^(c_env-1) per-window stride), params.z = wd_rows (rows to fill,
//   padded), params.w = unused.

// summary layout (u32): [0]=is_split [1]=b_star [2]=c_lo [3]=c_hi [4]=n_large
//   [5]=W_lo [6]=W_hi [7]=num_windows [8]=eff_num_bits

const WD_STRIDE: u32 = 8u;
const PLANNER_TPB: u32 = 256u;
const VAR_WINDOW_MAX_WINDOWS: u32 = 128u;
const NUM_BITS_MAX: u32 = 254u;
const COST_T: u32 = 64u; // cost-model parallel width; Phase-3 calibration knob

// GPU window-bits: a logN -> c lookup (mirrors pickC in msm_v2.ts). Returns 13 for
// any logN outside the table (matches the ?? 13 fallback).
fn pick_c(np: u32) -> u32 {
    if (np == 0u) { return 13u; }
    let logn = u32(round(log2(f32(np))));
    if (logn == 7u || logn == 8u) { return 4u; }
    if (logn == 9u) { return 5u; }
    if (logn >= 10u && logn <= 14u) { return 8u; }
    if (logn == 15u) { return 10u; }
    if (logn == 16u || logn == 17u) { return 13u; }
    if (logn >= 18u && logn <= 20u) { return 15u; }
    return 13u;
}

fn bucket_cost(W: u32, c: u32) -> u32 {
    if (W == 0u) { return 0u; }
    let B = (1u << (c - 1u)) + 1u;
    let base = W * B;
    if (B <= 2u * COST_T + 1u) { return (base * 8u) / 5u; } // trivial-stride 1.6x
    return base;
}

// predict_schedule_cost. Fits u32 for the supported MSM range (logN <= 20).
fn predict_cost(n: u32, n_large: u32, wlo: u32, whi: u32, clo: u32, chi: u32) -> u32 {
    let scan = n * wlo + n_large * whi;
    let bucket = COST_T * (bucket_cost(wlo, clo) + bucket_cost(whi, chi));
    let per_window = COST_T * 256u * (wlo + whi);
    return scan + 4u * bucket + per_window;
}

@compute @workgroup_size(1)
fn main() {
    let n = params.x;
    let c_env = params.y;
    let wd_rows = params.z;

    // Effective bit length = highest non-empty MSB bin, capped at NUM_BITS_MAX.
    var eff = NUM_BITS_MAX;
    for (var bin = 255u; bin > 1u; bin = bin - 1u) {
        if (msb_hist[bin] != 0u) { eff = min(bin, NUM_BITS_MAX); break; }
    }

    let n_active = n - msb_hist[0];
    let c_unsplit = pick_c(n);
    let w_unsplit = (eff + 2u + c_unsplit - 1u) / c_unsplit;
    let cost_unsplit = predict_cost(n, 0u, w_unsplit, 0u, c_unsplit, c_unsplit);

    var best_cost = cost_unsplit;
    var best_b = 0u;
    var best_clo = 0u;
    var best_chi = 0u;
    var found = false;

    // SPLIT_GRID = {16, 32, ..., 224} (b = 16*(gi+1)).
    if (n != 0u && eff != 0u && eff <= NUM_BITS_MAX) {
        for (var gi = 0u; gi < 14u; gi = gi + 1u) {
            let b = 16u * (gi + 1u);
            if (b >= eff) { continue; }
            // n_large = #{msb >= b-1} = sum bins[b..255].
            var n_large = 0u;
            for (var i = b; i < 256u; i = i + 1u) { n_large = n_large + msb_hist[i]; }
            if (n_large >= n_active) { continue; }
            let n_small = n_active - n_large;
            if (n_large == 0u || n_small == 0u) { continue; }
            if (n_large * 2u > n) { continue; }
            if (n_small * 10u < n) { continue; }
            if (n_large < 64u || n_large * 20u < n_active) { continue; }
            if (b + 32u > eff) { continue; }
            let clo = pick_c(n);
            let chi = pick_c(n_large);
            if (clo == 0u || chi == 0u || chi >= clo) { continue; }
            let wlo = (b + clo - 1u) / clo;
            let whi = ((eff - b) + chi - 1u) / chi;
            if (wlo + whi > VAR_WINDOW_MAX_WINDOWS) { continue; }
            let cost = predict_cost(n, n_large, wlo, whi, clo, chi);
            if (cost < best_cost) {
                best_cost = cost; best_b = b; best_clo = clo; best_chi = chi; found = true;
            }
        }
    }
    // Accept only if predicted <= 85% of unsplit (17/20 avoids the *100 u32 overflow).
    let is_split = found && (best_cost * 20u <= cost_unsplit * 17u);

    // Build the per-window schedule into WindowDesc. NO_SPLIT = uniform fill over
    // NUM_BITS_MAX+2 bits (data-independent — matches today's host fill byte-for-byte).
    // SPLIT = lower region [0,b_star) at c_lo then upper [b_star, eff+2) at c_hi.
    let stride_max = 1u << (c_env - 1u); // reduce_off envelope stride (host-sized)
    var n_large_out = 0u;
    var w_lo = 0u;
    var w_hi = 0u;

    var w = 0u;          // window index
    var bit_base = 0u;   // prefix of widths
    var work_off = 0u;   // prefix of num_columns

    // Region filler (inlined twice). bits_total / region_c chosen per branch below.
    if (!is_split) {
        // NO_SPLIT = ceil(NUM_BITS/c) windows ALL of width c (NOT remainder-tiled):
        // the top window's high bits are zero, so this matches today's host fill
        // byte-for-byte. (The split branches remainder-tile, like the C++ reference.)
        let nw = (NUM_BITS_MAX + c_unsplit - 1u) / c_unsplit;
        loop {
            if (w >= nw || w >= VAR_WINDOW_MAX_WINDOWS) { break; }
            let cw = c_unsplit;
            let stride_w = 1u << (cw - 1u);
            let num_cols = ((stride_w + 1u + PLANNER_TPB - 1u) / PLANNER_TPB) * PLANNER_TPB;
            let o = w * WD_STRIDE;
            window_desc[o + 0u] = cw;
            window_desc[o + 1u] = bit_base;
            window_desc[o + 2u] = stride_w;
            window_desc[o + 3u] = work_off;
            window_desc[o + 4u] = w * stride_max;
            window_desc[o + 5u] = num_cols;
            bit_base = bit_base + cw;
            work_off = work_off + num_cols;
            w = w + 1u;
        }
        w_lo = w;
    } else {
        let total_bits = eff + 2u;
        let lower_bits = min(best_b, total_bits);
        // Lower region (c_lo).
        var remaining = lower_bits;
        loop {
            if (remaining == 0u || w >= VAR_WINDOW_MAX_WINDOWS) { break; }
            let cw = min(best_clo, remaining);
            let stride_w = 1u << (cw - 1u);
            let num_cols = ((stride_w + 1u + PLANNER_TPB - 1u) / PLANNER_TPB) * PLANNER_TPB;
            let o = w * WD_STRIDE;
            window_desc[o + 0u] = cw;
            window_desc[o + 1u] = bit_base;
            window_desc[o + 2u] = stride_w;
            window_desc[o + 3u] = work_off;
            window_desc[o + 4u] = w * stride_max;
            window_desc[o + 5u] = num_cols;
            bit_base = bit_base + cw;
            work_off = work_off + num_cols;
            remaining = remaining - cw;
            w = w + 1u;
        }
        w_lo = w;
        // Upper region (c_hi).
        remaining = total_bits - lower_bits;
        loop {
            if (remaining == 0u || w >= VAR_WINDOW_MAX_WINDOWS) { break; }
            let cw = min(best_chi, remaining);
            let stride_w = 1u << (cw - 1u);
            let num_cols = ((stride_w + 1u + PLANNER_TPB - 1u) / PLANNER_TPB) * PLANNER_TPB;
            let o = w * WD_STRIDE;
            window_desc[o + 0u] = cw;
            window_desc[o + 1u] = bit_base;
            window_desc[o + 2u] = stride_w;
            window_desc[o + 3u] = work_off;
            window_desc[o + 4u] = w * stride_max;
            window_desc[o + 5u] = num_cols;
            bit_base = bit_base + cw;
            work_off = work_off + num_cols;
            remaining = remaining - cw;
            w = w + 1u;
        }
        w_hi = w - w_lo;
        // n_large = #{msb >= b_star-1} = sum bins[b_star..255].
        for (var i = best_b; i < 256u; i = i + 1u) { n_large_out = n_large_out + msb_hist[i]; }
    }
    let num_windows = w;

    // Pad the remaining rows up to wd_rows with the uniform-c sequence so short
    // batches resolve to cleared-zero row_ptr (Phase 0.3 padding contract).
    loop {
        if (w >= wd_rows || w >= VAR_WINDOW_MAX_WINDOWS) { break; }
        let cw = c_env;
        let stride_w = 1u << (cw - 1u);
        let num_cols = ((stride_w + 1u + PLANNER_TPB - 1u) / PLANNER_TPB) * PLANNER_TPB;
        let o = w * WD_STRIDE;
        window_desc[o + 0u] = cw;
        window_desc[o + 1u] = bit_base;
        window_desc[o + 2u] = stride_w;
        window_desc[o + 3u] = work_off;
        window_desc[o + 4u] = w * stride_max;
        window_desc[o + 5u] = num_cols;
        bit_base = bit_base + cw;
        work_off = work_off + num_cols;
        w = w + 1u;
    }

    summary[0] = select(0u, 1u, is_split);
    summary[1] = best_b;
    summary[2] = best_clo;
    summary[3] = best_chi;
    summary[4] = n_large_out;
    summary[5] = w_lo;
    summary[6] = w_hi;
    summary[7] = num_windows;
    summary[8] = eff;

    {{{ recompile }}}
}
