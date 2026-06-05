// Seed the Jacobian Z-plane from the affine is_present flags, once, before
// the Jacobian reduction levels run. Present bucket => Z = R (Montgomery one,
// i.e. affine point lifted to Jacobian with Z = 1). Absent => Z = 0 (point at
// infinity). One thread per red_buf slot.

const PG: u32 = 2u;
const WG: u32 = {{ workgroup_size }}u;

@group(0) @binding(0) var<storage, read>       is_present: array<u32>;
@group(0) @binding(1) var<storage, read_write> red_z:      array<vec4<u32>>;
@group(0) @binding(2) var<uniform>             zparams:    vec4<u32>; // (num_slots, _, _, _)

fn get_r_f8() -> array<u32, 8> {
    return array<u32, 8>({{ r8_csv }});
}

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let slot = gid.x;
    if (slot >= zparams.x) { return; }
    let base = PG * slot;
    if (is_present[slot] != 0u) {
        let R = get_r_f8();
        red_z[base + 0u] = vec4<u32>(R[0], R[1], R[2], R[3]);
        red_z[base + 1u] = vec4<u32>(R[4], R[5], R[6], R[7]);
    } else {
        red_z[base + 0u] = vec4<u32>(0u, 0u, 0u, 0u);
        red_z[base + 1u] = vec4<u32>(0u, 0u, 0u, 0u);
    }
}
