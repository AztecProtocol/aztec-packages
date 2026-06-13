// Dense probe: enough FP work to make malioc's A/FMA/CVT split meaningful.
// Compare a chain of explicit fma() (should land on FMA pipe) against a chain
// of integer u32 multiplies (should land on SFU) — same op count.

@group(0) @binding(0) var<storage, read> inbuf: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> outbuf: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> iin: array<vec4<u32>>;
@group(0) @binding(3) var<storage, read_write> iout: array<vec4<u32>>;

// 32 explicit FMAs in a dependent chain.
@compute @workgroup_size(64)
fn fma_chain(@builtin(global_invocation_id) gid: vec3<u32>) {
  let v = inbuf[gid.x];
  var a = v.x; let b = v.y; let c = v.z;
  for (var i = 0; i < 32; i = i + 1) {
    a = fma(a, b, c);
  }
  outbuf[gid.x] = vec4<f32>(a, 0.0, 0.0, 0.0);
}

// 32 TwoProduct EFTs in a chain — measures the real per-product cost of the
// error-free transform (2 FP ops: 1 mul + 1 fma, plus a negate).
@compute @workgroup_size(64)
fn twoprod_chain(@builtin(global_invocation_id) gid: vec3<u32>) {
  let v = inbuf[gid.x];
  var a = v.x; let b = v.y;
  var acc = 0.0;
  for (var i = 0; i < 32; i = i + 1) {
    let p = a * b;
    let e = fma(a, b, -p);
    acc = acc + e;
    a = p;
  }
  outbuf[gid.x] = vec4<f32>(a, acc, 0.0, 0.0);
}

// 32 integer 32-bit multiplies in a chain — the SFU-bound reference.
@compute @workgroup_size(64)
fn imul_chain(@builtin(global_invocation_id) gid: vec3<u32>) {
  let v = iin[gid.x];
  var a = v.x; let b = v.y; let c = v.z;
  for (var i = 0u; i < 32u; i = i + 1u) {
    a = a * b + c;
  }
  iout[gid.x] = vec4<u32>(a, 0u, 0u, 0u);
}
