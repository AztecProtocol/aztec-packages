enable subgroups;

{{> vmpack_coop2_funcs }}

// Addition-schedule executor, PROJECTIVE layer: one entry per subgroup
// lane PAIR, the vmpack complete RCB homogeneous add (a=0, b3=9) with
// lazy reduction — the ufold's machinery via the shared partial, with
// the CSR/tree scaffolding deleted: entries arrive resolved.
//
// Entry: {srcA_slot | PROJ?, srcA_zslot, srcB_slot | PROJ?, srcB_zslot}.
// PROJ (bit 31): the source was produced in the projective region — load
// its Z from the z-slot's X cell. Otherwise the source is affine:
// Z := Montgomery 1 from the lane constant (no load).
// dst is implicit: X3,Y3 -> srcA's slot; Z3 -> srcB's X cell (the slot
// this entry frees). Coordinates are canonicalized (< p) before store —
// downstream consumers include the safegcd inverse.
//
// Idle pairs (entry index beyond the layer) clamp to entry 0 and
// compute on its inputs with stores suppressed: control flow stays
// uniform, so the pair's subgroup shuffles are always matched.
//
// lvl.x = k. sched_meta words: [k-1] = layer adds, [24+k-1] = entry
// base. sched_off.x = meta base (u32), .w = entries base (vec4).
// params.w = M_partials.

const TPB: u32 = {{ workgroup_size }}u;
const PG: u32 = 2u;
const PROJ_FLAG: u32 = 0x80000000u;
const IDX_MASK: u32 = 0x7fffffffu;

@group(0) @binding(0) var<storage, read>       sched_meta:    array<u32>;
@group(0) @binding(1) var<storage, read>       sched_entries: array<vec4<u32>>;
@group(0) @binding(2) var<storage, read_write> partials_buf:  array<vec4<u32>>;
@group(0) @binding(3) var<uniform>             lvl:           vec4<u32>;
@group(0) @binding(4) var<uniform>             params:        vec4<u32>;
@group(0) @binding(5) var<uniform>             sched_off:     vec4<u32>;

fn load_x8(slot: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * slot + 0u];
    let q1 = partials_buf[PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn load_y8(slot: u32, M: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * M + PG * slot + 0u];
    let q1 = partials_buf[PG * M + PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}
fn store_x8(slot: u32, v: array<u32, 8>) {
    partials_buf[PG * slot + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    partials_buf[PG * slot + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}
fn store_y8(slot: u32, M: u32, v: array<u32, 8>) {
    partials_buf[PG * M + PG * slot + 0u] = vec4<u32>(v[0], v[1], v[2], v[3]);
    partials_buf[PG * M + PG * slot + 1u] = vec4<u32>(v[4], v[5], v[6], v[7]);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(subgroup_invocation_id) sgid: u32) {
    let k = lvl.x;
    let mb = sched_off.x;
    // ADRENO COMPILER BUG — keep these indices hoisted into their own `let`s;
    // do NOT fold them back into the sched_meta[...] subscripts. The Adreno
    // (Qualcomm) WGSL compiler miscompiles a storage-buffer subscript whose
    // index is an *inline* expression built from uniform-buffer reads (here
    // mb = sched_off.x and k = lvl.x): `sched_meta[mb + 24u + (k - 1u)]` resolves
    // to the WRONG element, so ebase is wrong, every schedule entry then reads
    // the wrong point slots, and the whole MSM is silently wrong on the S25+
    // (it is correct on Apple/Mali). Materialising the index in a `let` first
    // makes the driver get it right. Apply this same hoist to any new
    // uniform-derived storage index — see sched_affine / sched_normalize.
    let kk = k - 1u;
    let eidx = mb + 24u + kk;
    let n_entries = sched_meta[mb + kk];
    let ebase = sched_off.w + sched_meta[eidx];
    let M_partials = params.w;

    let role = sgid & 1u;
    let r1 = role == 1u;
    var p = gid.x >> 1u;
    let live = p < n_entries;
    if (!live) { p = 0u; }
    // Zero-entry layers never dispatch (indirect arg 0), so entry 0 of a
    // dispatched layer always exists.
    let e = sched_entries[ebase + p];

    let slot_a = e.x & IDX_MASK;
    let slot_b = e.z & IDX_MASK;
    let x1 = half_of_256(load_x8(slot_a), role);
    let y1 = half_of_256(load_y8(slot_a, M_partials), role);
    var z1 = vm_one_lane(role);
    if ((e.x & PROJ_FLAG) != 0u) { z1 = half_of_256(load_x8(e.y), role); }
    let x2 = half_of_256(load_x8(slot_b), role);
    let y2 = half_of_256(load_y8(slot_b, M_partials), role);
    var z2 = vm_one_lane(role);
    if ((e.z & PROJ_FLAG) != 0u) { z2 = half_of_256(load_x8(e.w), role); }

    let out = padd_vm(role, r1, x1, y1, z1, x2, y2, z2);
    let x3 = gather_256(pack5(coop2_canon(out[0], role, r1)), r1);
    let y3 = gather_256(pack5(coop2_canon(out[1], role, r1)), r1);
    let z3 = gather_256(pack5(coop2_canon(out[2], role, r1)), r1);

    if (live && role == 0u) {
        store_x8(slot_a, x3);
        store_y8(slot_a, M_partials, y3);
        store_x8(slot_b, z3);
    }

    {{{ recompile }}}
}
