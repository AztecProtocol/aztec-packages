// Walker pair-tree: post-resolve args (single thread). The resolve pass
// (finalize MODE 0) routed every survivor into the micro / shallow / deep
// lists; this clamps the counters to list capacities and writes the
// fold + survivor-finalize dispatch args.
//
// meta: [20] k*, [21] micro count, [26] shallow count, [25] deep count,
// [22] residual stride. level_args slot 18 = shallow fold (TPB-64, one WG
// per survivor), slot 17 = deep fold (TPB-256), slot 19 = survivor
// finalize over all three lists.

const SN: u32 = {{ sn }}u;
const FIN_TPB: u32 = {{ fin_tpb }}u;
const MICRO_CAP:   u32 = 2048u;
const SHALLOW_CAP: u32 = 6144u;
const DEEP_CAP:    u32 = 2048u;

@group(0) @binding(0) var<storage, read_write> ptree_meta: array<atomic<u32>>;
@group(0) @binding(1) var<storage, read_write> level_args: array<u32>;

@compute @workgroup_size(1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x != 0u) { return; }
    let kstar = atomicLoad(&ptree_meta[20]);
    let thr = 1u << (max(kstar, 1u) - 1u);
    let n_m = min(atomicLoad(&ptree_meta[21]), MICRO_CAP);
    let n_s = min(atomicLoad(&ptree_meta[26]), SHALLOW_CAP);
    let n_d = min(atomicLoad(&ptree_meta[25]), DEEP_CAP);
    atomicStore(&ptree_meta[21], n_m);
    atomicStore(&ptree_meta[26], n_s);
    atomicStore(&ptree_meta[25], n_d);
    atomicStore(&ptree_meta[22], thr);
    level_args[4u * 18u + 0u] = n_s;
    level_args[4u * 18u + 1u] = 1u;
    level_args[4u * 18u + 2u] = 1u;
    level_args[4u * 17u + 0u] = n_d;
    level_args[4u * 17u + 1u] = 1u;
    level_args[4u * 17u + 2u] = 1u;
    let nt = n_m + n_s + n_d;
    level_args[4u * 19u + 0u] = (nt + FIN_TPB * SN - 1u) / (FIN_TPB * SN);
    level_args[4u * 19u + 1u] = 1u;
    level_args[4u * 19u + 2u] = 1u;

    {{{ recompile }}}
}
