{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> fr_pow_funcs }}
{{> bigint_by_funcs }}
{{> by_inverse_a_funcs }}

// Layer-wide batch inverse for the tree-reduce SMVP (iter 4).
//
// Replaces the per-WG `fr_inv_by_a` previously run inside phase1/phase2
// with ONE Montgomery batch inverse covering all WGs of the layer.
// Concretely:
//   1. Forward pass: prefix-product over `wg_spill[0..nw]` (the per-WG
//      block_totals written by phase1_a / phase2_a).
//   2. Single `fr_inv_by_a` on the global product.
//   3. Backward pass: derive each per-WG inverse and write back into
//      `wg_spill[0..nw]` (overwriting the block_totals — phase1_d /
//      phase2_d read the slot as the per-WG inverse).
//
// Dispatched as a single workgroup (1, 1, 1). Single-threaded because:
//   - nw is at most a few hundred, dominated by the inverse + scan
//     latency rather than throughput;
//   - the prefix scan + back-walk is intrinsically serial;
//   - skipping workgroup-memory plumbing keeps the kernel small and
//     avoids a barrier per stage.

const MAX_WGS: u32 = {{ max_wgs }}u;

@group(0) @binding(0)
var<storage, read> num_wgs_per_layer: array<u32>;

@group(0) @binding(1)
var<storage, read> layer_counts: array<u32>;

@group(0) @binding(2)
var<storage, read> num_active_count_buckets: array<u32>;

// Same buffer phase1_a / phase2_a wrote into:
//   [0, MAX_WGS) — per-WG product on entry; per-WG inverse on exit.
@group(0) @binding(3)
var<storage, read_write> wg_spill: array<BigInt>;

// Scratch for the forward-pass prefix products. Reused across layers.
@group(0) @binding(4)
var<storage, read_write> prefix_scratch_inverse: array<BigInt>;

struct Params {
    layer_idx: u32,
    is_layer_zero: u32,
}
@group(0) @binding(5)
var<uniform> params: Params;

fn get_r() -> BigInt {
    var r: BigInt;
{{{ r_limbs }}}
    return r;
}

@compute
@workgroup_size(1)
fn main() {
    let layer_idx = params.layer_idx;
    let nw = num_wgs_per_layer[layer_idx];
    if (nw == 0u) { return; }
    let in_count = layer_counts[layer_idx];
    let active_count = num_active_count_buckets[0];
    if (params.is_layer_zero == 0u && in_count <= active_count) {
        // Mirrors the scan kernel's gate: phase2_a only runs when this
        // layer has more buckets than active. If phase2_a didn't run,
        // wg_spill[0..nw] is not populated for this layer and we must
        // not consume it.
        return;
    }

    var prefix: BigInt = wg_spill[0u];
    prefix_scratch_inverse[0u] = prefix;
    for (var i: u32 = 1u; i < nw; i = i + 1u) {
        var w: BigInt = wg_spill[i];
        prefix = montgomery_product(&prefix, &w);
        prefix_scratch_inverse[i] = prefix;
    }

    var inv_acc: BigInt = fr_inv_by_a(prefix);

    for (var k: u32 = 0u; k < nw; k = k + 1u) {
        let i = nw - 1u - k;
        if (i == 0u) {
            wg_spill[0u] = inv_acc;
        } else {
            var prev_prefix: BigInt = prefix_scratch_inverse[i - 1u];
            var inv_this: BigInt = montgomery_product(&inv_acc, &prev_prefix);
            var this_w: BigInt = wg_spill[i];
            inv_acc = montgomery_product(&inv_acc, &this_w);
            wg_spill[i] = inv_this;
        }
    }

    {{{ recompile }}}
}
