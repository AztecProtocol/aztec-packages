// Point-only variant of the SRS upload conversion. Reads raw affine (x, y)
// pairs from two packed u32 buffers and writes Montgomery-form packed 8x u32
// coordinates: x·R = montgomery_product_f8(x, R²) — one packed multiply per
// coordinate (inputs are canonical field elements, so no extra reduction).
//
// Purpose. When the caller holds a persistent GPU context and the base
// points are SRS-backed (i.e. stable across many MSM calls), we want to
// pay the Montgomery conversion cost **once** at SRS upload, not on every
// MSM.
//
// Input word order: the coordinate is eight canonical little-endian u32
// words. (The byte shuffle the previous 16-bit-word pipeline performed
// composes with its big-endian extract to the identity.)

{{> structs }}
{{{ dec_unpack }}}
{{> field8_funcs }}

// R² mod p, packed — the canonical -> Montgomery multiplier.
const R2_F8: array<u32, 8> = array<u32, 8>({{ r2_csv }});

@group(0) @binding(0)
var<storage, read> first_half: array<u32>;
@group(0) @binding(1)
var<storage, read> second_half: array<u32>;
@group(0) @binding(2)
var<storage, read_write> point_x: array<vec4<u32>>;
@group(0) @binding(3)
var<storage, read_write> point_y: array<vec4<u32>>;
@group(0) @binding(4)
var<uniform> input_size: u32;

@compute
@workgroup_size({{ workgroup_size }})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let gidx = global_id.x;
    let gidy = global_id.y;
    let id = gidx * {{ num_y_workgroups }}u + gidy;

    let INPUT_SIZE = input_size;
    // Dispatcher rounds totalThreads up to a multiple of (workgroup_size *
    // numXWorkgroups * numYWorkgroups) so the tile covers srsN; ids past
    // input_size are no-ops. Without this guard a non-power-of-two srsN
    // (e.g. 88_899 for the ECDSA-r1 transfer flow) would OOB-write past
    // the point_x / point_y buffers.
    if (id >= INPUT_SIZE) {
        return;
    }

    var xw: array<u32, 8>;
    var yw: array<u32, 8>;
    let h = INPUT_SIZE / 2u;
    for (var j = 0u; j < 8u; j++) {
        var x: u32;
        var y: u32;
        if (id < h) {
            x = first_half[id * 16u + j];
            y = first_half[id * 16u + j + 8u];
        } else {
            x = second_half[(id - h) * 16u + j];
            y = second_half[(id - h) * 16u + j + 8u];
        }
        xw[j] = x;
        yw[j] = y;
    }

    let xm = montgomery_product_f8(xw, R2_F8);
    let ym = montgomery_product_f8(yw, R2_F8);
    point_x[2u * id] = vec4<u32>(xm[0], xm[1], xm[2], xm[3]);
    point_x[2u * id + 1u] = vec4<u32>(xm[4], xm[5], xm[6], xm[7]);
    point_y[2u * id] = vec4<u32>(ym[0], ym[1], ym[2], ym[3]);
    point_y[2u * id + 1u] = vec4<u32>(ym[4], ym[5], ym[6], ym[7]);

    {{{ recompile }}}
}
