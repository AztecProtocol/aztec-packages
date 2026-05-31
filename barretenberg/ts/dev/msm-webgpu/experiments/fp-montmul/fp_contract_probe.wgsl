// FMA-contraction probe. Three entry points, each doing a*b+c three ways.
// We disassemble the SPIR-V (naga output) to see whether naga emits
// OpExtInst Fma / contracts a*b+c, and malioc to see FMA vs A cycle split.

@group(0) @binding(0) var<storage, read> inbuf: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> outbuf: array<vec4<f32>>;

// (1) naive  a*b + c   — does the toolchain fuse this into one FMA?
@compute @workgroup_size(64)
fn naive(@builtin(global_invocation_id) gid: vec3<u32>) {
  let v = inbuf[gid.x];
  let r = v.x * v.y + v.z;
  outbuf[gid.x] = vec4<f32>(r, 0.0, 0.0, 0.0);
}

// (2) explicit fma() builtin
@compute @workgroup_size(64)
fn explicit_fma(@builtin(global_invocation_id) gid: vec3<u32>) {
  let v = inbuf[gid.x];
  let r = fma(v.x, v.y, v.z);
  outbuf[gid.x] = vec4<f32>(r, 0.0, 0.0, 0.0);
}

// (3) separated: force the product to be rounded before the add.
//     This is what error-free-transforms NEED: p = round(a*b) then
//     hi/lo recovered. If the compiler fuses across the `let`, EFT breaks.
@compute @workgroup_size(64)
fn separated(@builtin(global_invocation_id) gid: vec3<u32>) {
  let v = inbuf[gid.x];
  let m = v.x * v.y;
  let r = m + v.z;
  outbuf[gid.x] = vec4<f32>(r, 0.0, 0.0, 0.0);
}

// (4) TwoProduct error-free transform via fma: p = a*b (rounded),
//     e = fma(a,b,-p) recovers the exact rounding error. The whole
//     FP-bignum technique stands or falls on `e` being exact.
@compute @workgroup_size(64)
fn twoproduct(@builtin(global_invocation_id) gid: vec3<u32>) {
  let v = inbuf[gid.x];
  let a = v.x;
  let b = v.y;
  let p = a * b;            // rounded product
  let e = fma(a, b, -p);    // exact error: a*b - p, representable
  outbuf[gid.x] = vec4<f32>(p, e, 0.0, 0.0);
}
