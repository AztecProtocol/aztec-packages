// =============================================================================
// 2-stage Montgomery multiply — BN254, 20x13-bit. Hand-maintained .wgsl.
// Stage 1: schoolbook product into scalar accumulators t0..t39 (register-
// resident). Stage 2: b=4 blocked Montgomery reduce, 5 serial steps with
// DEFERRED carry (canonicalise only the 4 active limbs/block; ~60-deep carry
// path vs the 240 of full resolve) — pound-for-pound with f8_native CIOS at W=1.
// Np4 = -p^-1 mod 2^52 = [905,1075,185,1039]. Validated vs bigint ref.
// =============================================================================

override CHAIN_K: u32 = 1u;

@group(0) @binding(0) var<storage, read>        inp:  array<u32>;  // per group: x[20], b[20]
@group(0) @binding(1) var<storage, read_write>  outp: array<u32>;  // per group: 20 result limbs

const MASK: u32 = 8191u;

@compute @workgroup_size(64)
fn blocked_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let grp = gid.x;
  let base = grp * 40u;
  var x0: u32 = inp[base + 0u];
  var x1: u32 = inp[base + 1u];
  var x2: u32 = inp[base + 2u];
  var x3: u32 = inp[base + 3u];
  var x4: u32 = inp[base + 4u];
  var x5: u32 = inp[base + 5u];
  var x6: u32 = inp[base + 6u];
  var x7: u32 = inp[base + 7u];
  var x8: u32 = inp[base + 8u];
  var x9: u32 = inp[base + 9u];
  var x10: u32 = inp[base + 10u];
  var x11: u32 = inp[base + 11u];
  var x12: u32 = inp[base + 12u];
  var x13: u32 = inp[base + 13u];
  var x14: u32 = inp[base + 14u];
  var x15: u32 = inp[base + 15u];
  var x16: u32 = inp[base + 16u];
  var x17: u32 = inp[base + 17u];
  var x18: u32 = inp[base + 18u];
  var x19: u32 = inp[base + 19u];
  let b0: u32 = inp[base + 20u];
  let b1: u32 = inp[base + 21u];
  let b2: u32 = inp[base + 22u];
  let b3: u32 = inp[base + 23u];
  let b4: u32 = inp[base + 24u];
  let b5: u32 = inp[base + 25u];
  let b6: u32 = inp[base + 26u];
  let b7: u32 = inp[base + 27u];
  let b8: u32 = inp[base + 28u];
  let b9: u32 = inp[base + 29u];
  let b10: u32 = inp[base + 30u];
  let b11: u32 = inp[base + 31u];
  let b12: u32 = inp[base + 32u];
  let b13: u32 = inp[base + 33u];
  let b14: u32 = inp[base + 34u];
  let b15: u32 = inp[base + 35u];
  let b16: u32 = inp[base + 36u];
  let b17: u32 = inp[base + 37u];
  let b18: u32 = inp[base + 38u];
  let b19: u32 = inp[base + 39u];
  var t0: u32;
  var t1: u32;
  var t2: u32;
  var t3: u32;
  var t4: u32;
  var t5: u32;
  var t6: u32;
  var t7: u32;
  var t8: u32;
  var t9: u32;
  var t10: u32;
  var t11: u32;
  var t12: u32;
  var t13: u32;
  var t14: u32;
  var t15: u32;
  var t16: u32;
  var t17: u32;
  var t18: u32;
  var t19: u32;
  var t20: u32;
  var t21: u32;
  var t22: u32;
  var t23: u32;
  var t24: u32;
  var t25: u32;
  var t26: u32;
  var t27: u32;
  var t28: u32;
  var t29: u32;
  var t30: u32;
  var t31: u32;
  var t32: u32;
  var t33: u32;
  var t34: u32;
  var t35: u32;
  var t36: u32;
  var t37: u32;
  var t38: u32;
  var t39: u32;

  for (var rep = 0u; rep < CHAIN_K; rep = rep + 1u) {
    // product columns
    t0 = x0*b0;
    t1 = x0*b1 + x1*b0;
    t2 = x0*b2 + x1*b1 + x2*b0;
    t3 = x0*b3 + x1*b2 + x2*b1 + x3*b0;
    t4 = x0*b4 + x1*b3 + x2*b2 + x3*b1 + x4*b0;
    t5 = x0*b5 + x1*b4 + x2*b3 + x3*b2 + x4*b1 + x5*b0;
    t6 = x0*b6 + x1*b5 + x2*b4 + x3*b3 + x4*b2 + x5*b1 + x6*b0;
    t7 = x0*b7 + x1*b6 + x2*b5 + x3*b4 + x4*b3 + x5*b2 + x6*b1 + x7*b0;
    t8 = x0*b8 + x1*b7 + x2*b6 + x3*b5 + x4*b4 + x5*b3 + x6*b2 + x7*b1 + x8*b0;
    t9 = x0*b9 + x1*b8 + x2*b7 + x3*b6 + x4*b5 + x5*b4 + x6*b3 + x7*b2 + x8*b1 + x9*b0;
    t10 = x0*b10 + x1*b9 + x2*b8 + x3*b7 + x4*b6 + x5*b5 + x6*b4 + x7*b3 + x8*b2 + x9*b1 + x10*b0;
    t11 = x0*b11 + x1*b10 + x2*b9 + x3*b8 + x4*b7 + x5*b6 + x6*b5 + x7*b4 + x8*b3 + x9*b2 + x10*b1 + x11*b0;
    t12 = x0*b12 + x1*b11 + x2*b10 + x3*b9 + x4*b8 + x5*b7 + x6*b6 + x7*b5 + x8*b4 + x9*b3 + x10*b2 + x11*b1 + x12*b0;
    t13 = x0*b13 + x1*b12 + x2*b11 + x3*b10 + x4*b9 + x5*b8 + x6*b7 + x7*b6 + x8*b5 + x9*b4 + x10*b3 + x11*b2 + x12*b1 + x13*b0;
    t14 = x0*b14 + x1*b13 + x2*b12 + x3*b11 + x4*b10 + x5*b9 + x6*b8 + x7*b7 + x8*b6 + x9*b5 + x10*b4 + x11*b3 + x12*b2 + x13*b1 + x14*b0;
    t15 = x0*b15 + x1*b14 + x2*b13 + x3*b12 + x4*b11 + x5*b10 + x6*b9 + x7*b8 + x8*b7 + x9*b6 + x10*b5 + x11*b4 + x12*b3 + x13*b2 + x14*b1 + x15*b0;
    t16 = x0*b16 + x1*b15 + x2*b14 + x3*b13 + x4*b12 + x5*b11 + x6*b10 + x7*b9 + x8*b8 + x9*b7 + x10*b6 + x11*b5 + x12*b4 + x13*b3 + x14*b2 + x15*b1 + x16*b0;
    t17 = x0*b17 + x1*b16 + x2*b15 + x3*b14 + x4*b13 + x5*b12 + x6*b11 + x7*b10 + x8*b9 + x9*b8 + x10*b7 + x11*b6 + x12*b5 + x13*b4 + x14*b3 + x15*b2 + x16*b1 + x17*b0;
    t18 = x0*b18 + x1*b17 + x2*b16 + x3*b15 + x4*b14 + x5*b13 + x6*b12 + x7*b11 + x8*b10 + x9*b9 + x10*b8 + x11*b7 + x12*b6 + x13*b5 + x14*b4 + x15*b3 + x16*b2 + x17*b1 + x18*b0;
    t19 = x0*b19 + x1*b18 + x2*b17 + x3*b16 + x4*b15 + x5*b14 + x6*b13 + x7*b12 + x8*b11 + x9*b10 + x10*b9 + x11*b8 + x12*b7 + x13*b6 + x14*b5 + x15*b4 + x16*b3 + x17*b2 + x18*b1 + x19*b0;
    t20 = x1*b19 + x2*b18 + x3*b17 + x4*b16 + x5*b15 + x6*b14 + x7*b13 + x8*b12 + x9*b11 + x10*b10 + x11*b9 + x12*b8 + x13*b7 + x14*b6 + x15*b5 + x16*b4 + x17*b3 + x18*b2 + x19*b1;
    t21 = x2*b19 + x3*b18 + x4*b17 + x5*b16 + x6*b15 + x7*b14 + x8*b13 + x9*b12 + x10*b11 + x11*b10 + x12*b9 + x13*b8 + x14*b7 + x15*b6 + x16*b5 + x17*b4 + x18*b3 + x19*b2;
    t22 = x3*b19 + x4*b18 + x5*b17 + x6*b16 + x7*b15 + x8*b14 + x9*b13 + x10*b12 + x11*b11 + x12*b10 + x13*b9 + x14*b8 + x15*b7 + x16*b6 + x17*b5 + x18*b4 + x19*b3;
    t23 = x4*b19 + x5*b18 + x6*b17 + x7*b16 + x8*b15 + x9*b14 + x10*b13 + x11*b12 + x12*b11 + x13*b10 + x14*b9 + x15*b8 + x16*b7 + x17*b6 + x18*b5 + x19*b4;
    t24 = x5*b19 + x6*b18 + x7*b17 + x8*b16 + x9*b15 + x10*b14 + x11*b13 + x12*b12 + x13*b11 + x14*b10 + x15*b9 + x16*b8 + x17*b7 + x18*b6 + x19*b5;
    t25 = x6*b19 + x7*b18 + x8*b17 + x9*b16 + x10*b15 + x11*b14 + x12*b13 + x13*b12 + x14*b11 + x15*b10 + x16*b9 + x17*b8 + x18*b7 + x19*b6;
    t26 = x7*b19 + x8*b18 + x9*b17 + x10*b16 + x11*b15 + x12*b14 + x13*b13 + x14*b12 + x15*b11 + x16*b10 + x17*b9 + x18*b8 + x19*b7;
    t27 = x8*b19 + x9*b18 + x10*b17 + x11*b16 + x12*b15 + x13*b14 + x14*b13 + x15*b12 + x16*b11 + x17*b10 + x18*b9 + x19*b8;
    t28 = x9*b19 + x10*b18 + x11*b17 + x12*b16 + x13*b15 + x14*b14 + x15*b13 + x16*b12 + x17*b11 + x18*b10 + x19*b9;
    t29 = x10*b19 + x11*b18 + x12*b17 + x13*b16 + x14*b15 + x15*b14 + x16*b13 + x17*b12 + x18*b11 + x19*b10;
    t30 = x11*b19 + x12*b18 + x13*b17 + x14*b16 + x15*b15 + x16*b14 + x17*b13 + x18*b12 + x19*b11;
    t31 = x12*b19 + x13*b18 + x14*b17 + x15*b16 + x16*b15 + x17*b14 + x18*b13 + x19*b12;
    t32 = x13*b19 + x14*b18 + x15*b17 + x16*b16 + x17*b15 + x18*b14 + x19*b13;
    t33 = x14*b19 + x15*b18 + x16*b17 + x17*b16 + x18*b15 + x19*b14;
    t34 = x15*b19 + x16*b18 + x17*b17 + x18*b16 + x19*b15;
    t35 = x16*b19 + x17*b18 + x18*b17 + x19*b16;
    t36 = x17*b19 + x18*b18 + x19*b17;
    t37 = x18*b19 + x19*b18;
    t38 = x19*b19;
    t39 = 0u;
    {   // --- block 0 (limbs 0..3) ---
    // canonicalise the 4 active limbs, carry-out -> t4
    t1 = t1 + (t0 >> 13u); t0 = t0 & MASK;
    t2 = t2 + (t1 >> 13u); t1 = t1 & MASK;
    t3 = t3 + (t2 >> 13u); t2 = t2 & MASK;
    t4 = t4 + (t3 >> 13u); t3 = t3 & MASK;
    let mm0 = t0*905u;
    let mm1 = t0*1075u + t1*905u;
    let mm2 = t0*185u + t1*1075u + t2*905u;
    let mm3 = t0*1039u + t1*185u + t2*1075u + t3*905u;
    let M0 = mm0 & MASK; let cm0 = mm0 >> 13u;
    let M1 = (mm1 + cm0) & MASK; let cm1 = (mm1 + cm0) >> 13u;
    let M2 = (mm2 + cm1) & MASK; let cm2 = (mm2 + cm1) >> 13u;
    let M3 = (mm3 + cm2) & MASK;
    // add M*p
    t0 = t0 + M0*7495u;
    t1 = t1 + M0*999u + M1*7495u;
    t2 = t2 + M0*1462u + M1*999u + M2*7495u;
    t3 = t3 + M0*280u + M1*1462u + M2*999u + M3*7495u;
    t4 = t4 + M0*5058u + M1*280u + M2*1462u + M3*999u;
    t5 = t5 + M0*1350u + M1*5058u + M2*280u + M3*1462u;
    t6 = t6 + M0*455u + M1*1350u + M2*5058u + M3*280u;
    t7 = t7 + M0*4653u + M1*455u + M2*1350u + M3*5058u;
    t8 = t8 + M0*362u + M1*4653u + M2*455u + M3*1350u;
    t9 = t9 + M0*3260u + M1*362u + M2*4653u + M3*455u;
    t10 = t10 + M0*5655u + M1*3260u + M2*362u + M3*4653u;
    t11 = t11 + M0*770u + M1*5655u + M2*3260u + M3*362u;
    t12 = t12 + M0*7016u + M1*770u + M2*5655u + M3*3260u;
    t13 = t13 + M0*2082u + M1*7016u + M2*770u + M3*5655u;
    t14 = t14 + M0*1761u + M1*2082u + M2*7016u + M3*770u;
    t15 = t15 + M0*5125u + M1*1761u + M2*2082u + M3*7016u;
    t16 = t16 + M0*305u + M1*5125u + M2*1761u + M3*2082u;
    t17 = t17 + M0*5015u + M1*305u + M2*5125u + M3*1761u;
    t18 = t18 + M0*6419u + M1*5015u + M2*305u + M3*5125u;
    t19 = t19 + M0*96u + M1*6419u + M2*5015u + M3*305u;
    t20 = t20 + M1*96u + M2*6419u + M3*5015u;
    t21 = t21 + M2*96u + M3*6419u;
    t22 = t22 + M3*96u;
    // zero the 4 active limbs (value now 0 mod 2^52), carry-out -> t4
    t1 = t1 + (t0 >> 13u); t0 = t0 & MASK;
    t2 = t2 + (t1 >> 13u); t1 = t1 & MASK;
    t3 = t3 + (t2 >> 13u); t2 = t2 & MASK;
    t4 = t4 + (t3 >> 13u); t3 = t3 & MASK;
    }
    {   // --- block 1 (limbs 4..7) ---
    // canonicalise the 4 active limbs, carry-out -> t8
    t5 = t5 + (t4 >> 13u); t4 = t4 & MASK;
    t6 = t6 + (t5 >> 13u); t5 = t5 & MASK;
    t7 = t7 + (t6 >> 13u); t6 = t6 & MASK;
    t8 = t8 + (t7 >> 13u); t7 = t7 & MASK;
    let mm0 = t4*905u;
    let mm1 = t4*1075u + t5*905u;
    let mm2 = t4*185u + t5*1075u + t6*905u;
    let mm3 = t4*1039u + t5*185u + t6*1075u + t7*905u;
    let M0 = mm0 & MASK; let cm0 = mm0 >> 13u;
    let M1 = (mm1 + cm0) & MASK; let cm1 = (mm1 + cm0) >> 13u;
    let M2 = (mm2 + cm1) & MASK; let cm2 = (mm2 + cm1) >> 13u;
    let M3 = (mm3 + cm2) & MASK;
    // add M*p
    t4 = t4 + M0*7495u;
    t5 = t5 + M0*999u + M1*7495u;
    t6 = t6 + M0*1462u + M1*999u + M2*7495u;
    t7 = t7 + M0*280u + M1*1462u + M2*999u + M3*7495u;
    t8 = t8 + M0*5058u + M1*280u + M2*1462u + M3*999u;
    t9 = t9 + M0*1350u + M1*5058u + M2*280u + M3*1462u;
    t10 = t10 + M0*455u + M1*1350u + M2*5058u + M3*280u;
    t11 = t11 + M0*4653u + M1*455u + M2*1350u + M3*5058u;
    t12 = t12 + M0*362u + M1*4653u + M2*455u + M3*1350u;
    t13 = t13 + M0*3260u + M1*362u + M2*4653u + M3*455u;
    t14 = t14 + M0*5655u + M1*3260u + M2*362u + M3*4653u;
    t15 = t15 + M0*770u + M1*5655u + M2*3260u + M3*362u;
    t16 = t16 + M0*7016u + M1*770u + M2*5655u + M3*3260u;
    t17 = t17 + M0*2082u + M1*7016u + M2*770u + M3*5655u;
    t18 = t18 + M0*1761u + M1*2082u + M2*7016u + M3*770u;
    t19 = t19 + M0*5125u + M1*1761u + M2*2082u + M3*7016u;
    t20 = t20 + M0*305u + M1*5125u + M2*1761u + M3*2082u;
    t21 = t21 + M0*5015u + M1*305u + M2*5125u + M3*1761u;
    t22 = t22 + M0*6419u + M1*5015u + M2*305u + M3*5125u;
    t23 = t23 + M0*96u + M1*6419u + M2*5015u + M3*305u;
    t24 = t24 + M1*96u + M2*6419u + M3*5015u;
    t25 = t25 + M2*96u + M3*6419u;
    t26 = t26 + M3*96u;
    // zero the 4 active limbs (value now 0 mod 2^52), carry-out -> t8
    t5 = t5 + (t4 >> 13u); t4 = t4 & MASK;
    t6 = t6 + (t5 >> 13u); t5 = t5 & MASK;
    t7 = t7 + (t6 >> 13u); t6 = t6 & MASK;
    t8 = t8 + (t7 >> 13u); t7 = t7 & MASK;
    }
    {   // --- block 2 (limbs 8..11) ---
    // canonicalise the 4 active limbs, carry-out -> t12
    t9 = t9 + (t8 >> 13u); t8 = t8 & MASK;
    t10 = t10 + (t9 >> 13u); t9 = t9 & MASK;
    t11 = t11 + (t10 >> 13u); t10 = t10 & MASK;
    t12 = t12 + (t11 >> 13u); t11 = t11 & MASK;
    let mm0 = t8*905u;
    let mm1 = t8*1075u + t9*905u;
    let mm2 = t8*185u + t9*1075u + t10*905u;
    let mm3 = t8*1039u + t9*185u + t10*1075u + t11*905u;
    let M0 = mm0 & MASK; let cm0 = mm0 >> 13u;
    let M1 = (mm1 + cm0) & MASK; let cm1 = (mm1 + cm0) >> 13u;
    let M2 = (mm2 + cm1) & MASK; let cm2 = (mm2 + cm1) >> 13u;
    let M3 = (mm3 + cm2) & MASK;
    // add M*p
    t8 = t8 + M0*7495u;
    t9 = t9 + M0*999u + M1*7495u;
    t10 = t10 + M0*1462u + M1*999u + M2*7495u;
    t11 = t11 + M0*280u + M1*1462u + M2*999u + M3*7495u;
    t12 = t12 + M0*5058u + M1*280u + M2*1462u + M3*999u;
    t13 = t13 + M0*1350u + M1*5058u + M2*280u + M3*1462u;
    t14 = t14 + M0*455u + M1*1350u + M2*5058u + M3*280u;
    t15 = t15 + M0*4653u + M1*455u + M2*1350u + M3*5058u;
    t16 = t16 + M0*362u + M1*4653u + M2*455u + M3*1350u;
    t17 = t17 + M0*3260u + M1*362u + M2*4653u + M3*455u;
    t18 = t18 + M0*5655u + M1*3260u + M2*362u + M3*4653u;
    t19 = t19 + M0*770u + M1*5655u + M2*3260u + M3*362u;
    t20 = t20 + M0*7016u + M1*770u + M2*5655u + M3*3260u;
    t21 = t21 + M0*2082u + M1*7016u + M2*770u + M3*5655u;
    t22 = t22 + M0*1761u + M1*2082u + M2*7016u + M3*770u;
    t23 = t23 + M0*5125u + M1*1761u + M2*2082u + M3*7016u;
    t24 = t24 + M0*305u + M1*5125u + M2*1761u + M3*2082u;
    t25 = t25 + M0*5015u + M1*305u + M2*5125u + M3*1761u;
    t26 = t26 + M0*6419u + M1*5015u + M2*305u + M3*5125u;
    t27 = t27 + M0*96u + M1*6419u + M2*5015u + M3*305u;
    t28 = t28 + M1*96u + M2*6419u + M3*5015u;
    t29 = t29 + M2*96u + M3*6419u;
    t30 = t30 + M3*96u;
    // zero the 4 active limbs (value now 0 mod 2^52), carry-out -> t12
    t9 = t9 + (t8 >> 13u); t8 = t8 & MASK;
    t10 = t10 + (t9 >> 13u); t9 = t9 & MASK;
    t11 = t11 + (t10 >> 13u); t10 = t10 & MASK;
    t12 = t12 + (t11 >> 13u); t11 = t11 & MASK;
    }
    {   // --- block 3 (limbs 12..15) ---
    // canonicalise the 4 active limbs, carry-out -> t16
    t13 = t13 + (t12 >> 13u); t12 = t12 & MASK;
    t14 = t14 + (t13 >> 13u); t13 = t13 & MASK;
    t15 = t15 + (t14 >> 13u); t14 = t14 & MASK;
    t16 = t16 + (t15 >> 13u); t15 = t15 & MASK;
    let mm0 = t12*905u;
    let mm1 = t12*1075u + t13*905u;
    let mm2 = t12*185u + t13*1075u + t14*905u;
    let mm3 = t12*1039u + t13*185u + t14*1075u + t15*905u;
    let M0 = mm0 & MASK; let cm0 = mm0 >> 13u;
    let M1 = (mm1 + cm0) & MASK; let cm1 = (mm1 + cm0) >> 13u;
    let M2 = (mm2 + cm1) & MASK; let cm2 = (mm2 + cm1) >> 13u;
    let M3 = (mm3 + cm2) & MASK;
    // add M*p
    t12 = t12 + M0*7495u;
    t13 = t13 + M0*999u + M1*7495u;
    t14 = t14 + M0*1462u + M1*999u + M2*7495u;
    t15 = t15 + M0*280u + M1*1462u + M2*999u + M3*7495u;
    t16 = t16 + M0*5058u + M1*280u + M2*1462u + M3*999u;
    t17 = t17 + M0*1350u + M1*5058u + M2*280u + M3*1462u;
    t18 = t18 + M0*455u + M1*1350u + M2*5058u + M3*280u;
    t19 = t19 + M0*4653u + M1*455u + M2*1350u + M3*5058u;
    t20 = t20 + M0*362u + M1*4653u + M2*455u + M3*1350u;
    t21 = t21 + M0*3260u + M1*362u + M2*4653u + M3*455u;
    t22 = t22 + M0*5655u + M1*3260u + M2*362u + M3*4653u;
    t23 = t23 + M0*770u + M1*5655u + M2*3260u + M3*362u;
    t24 = t24 + M0*7016u + M1*770u + M2*5655u + M3*3260u;
    t25 = t25 + M0*2082u + M1*7016u + M2*770u + M3*5655u;
    t26 = t26 + M0*1761u + M1*2082u + M2*7016u + M3*770u;
    t27 = t27 + M0*5125u + M1*1761u + M2*2082u + M3*7016u;
    t28 = t28 + M0*305u + M1*5125u + M2*1761u + M3*2082u;
    t29 = t29 + M0*5015u + M1*305u + M2*5125u + M3*1761u;
    t30 = t30 + M0*6419u + M1*5015u + M2*305u + M3*5125u;
    t31 = t31 + M0*96u + M1*6419u + M2*5015u + M3*305u;
    t32 = t32 + M1*96u + M2*6419u + M3*5015u;
    t33 = t33 + M2*96u + M3*6419u;
    t34 = t34 + M3*96u;
    // zero the 4 active limbs (value now 0 mod 2^52), carry-out -> t16
    t13 = t13 + (t12 >> 13u); t12 = t12 & MASK;
    t14 = t14 + (t13 >> 13u); t13 = t13 & MASK;
    t15 = t15 + (t14 >> 13u); t14 = t14 & MASK;
    t16 = t16 + (t15 >> 13u); t15 = t15 & MASK;
    }
    {   // --- block 4 (limbs 16..19) ---
    // canonicalise the 4 active limbs, carry-out -> t20
    t17 = t17 + (t16 >> 13u); t16 = t16 & MASK;
    t18 = t18 + (t17 >> 13u); t17 = t17 & MASK;
    t19 = t19 + (t18 >> 13u); t18 = t18 & MASK;
    t20 = t20 + (t19 >> 13u); t19 = t19 & MASK;
    let mm0 = t16*905u;
    let mm1 = t16*1075u + t17*905u;
    let mm2 = t16*185u + t17*1075u + t18*905u;
    let mm3 = t16*1039u + t17*185u + t18*1075u + t19*905u;
    let M0 = mm0 & MASK; let cm0 = mm0 >> 13u;
    let M1 = (mm1 + cm0) & MASK; let cm1 = (mm1 + cm0) >> 13u;
    let M2 = (mm2 + cm1) & MASK; let cm2 = (mm2 + cm1) >> 13u;
    let M3 = (mm3 + cm2) & MASK;
    // add M*p
    t16 = t16 + M0*7495u;
    t17 = t17 + M0*999u + M1*7495u;
    t18 = t18 + M0*1462u + M1*999u + M2*7495u;
    t19 = t19 + M0*280u + M1*1462u + M2*999u + M3*7495u;
    t20 = t20 + M0*5058u + M1*280u + M2*1462u + M3*999u;
    t21 = t21 + M0*1350u + M1*5058u + M2*280u + M3*1462u;
    t22 = t22 + M0*455u + M1*1350u + M2*5058u + M3*280u;
    t23 = t23 + M0*4653u + M1*455u + M2*1350u + M3*5058u;
    t24 = t24 + M0*362u + M1*4653u + M2*455u + M3*1350u;
    t25 = t25 + M0*3260u + M1*362u + M2*4653u + M3*455u;
    t26 = t26 + M0*5655u + M1*3260u + M2*362u + M3*4653u;
    t27 = t27 + M0*770u + M1*5655u + M2*3260u + M3*362u;
    t28 = t28 + M0*7016u + M1*770u + M2*5655u + M3*3260u;
    t29 = t29 + M0*2082u + M1*7016u + M2*770u + M3*5655u;
    t30 = t30 + M0*1761u + M1*2082u + M2*7016u + M3*770u;
    t31 = t31 + M0*5125u + M1*1761u + M2*2082u + M3*7016u;
    t32 = t32 + M0*305u + M1*5125u + M2*1761u + M3*2082u;
    t33 = t33 + M0*5015u + M1*305u + M2*5125u + M3*1761u;
    t34 = t34 + M0*6419u + M1*5015u + M2*305u + M3*5125u;
    t35 = t35 + M0*96u + M1*6419u + M2*5015u + M3*305u;
    t36 = t36 + M1*96u + M2*6419u + M3*5015u;
    t37 = t37 + M2*96u + M3*6419u;
    t38 = t38 + M3*96u;
    // zero the 4 active limbs (value now 0 mod 2^52), carry-out -> t20
    t17 = t17 + (t16 >> 13u); t16 = t16 & MASK;
    t18 = t18 + (t17 >> 13u); t17 = t17 & MASK;
    t19 = t19 + (t18 >> 13u); t18 = t18 & MASK;
    t20 = t20 + (t19 >> 13u); t19 = t19 & MASK;
    }
    // final carry-resolve of result limbs
    t21 = t21 + (t20 >> 13u); t20 = t20 & MASK;
    t22 = t22 + (t21 >> 13u); t21 = t21 & MASK;
    t23 = t23 + (t22 >> 13u); t22 = t22 & MASK;
    t24 = t24 + (t23 >> 13u); t23 = t23 & MASK;
    t25 = t25 + (t24 >> 13u); t24 = t24 & MASK;
    t26 = t26 + (t25 >> 13u); t25 = t25 & MASK;
    t27 = t27 + (t26 >> 13u); t26 = t26 & MASK;
    t28 = t28 + (t27 >> 13u); t27 = t27 & MASK;
    t29 = t29 + (t28 >> 13u); t28 = t28 & MASK;
    t30 = t30 + (t29 >> 13u); t29 = t29 & MASK;
    t31 = t31 + (t30 >> 13u); t30 = t30 & MASK;
    t32 = t32 + (t31 >> 13u); t31 = t31 & MASK;
    t33 = t33 + (t32 >> 13u); t32 = t32 & MASK;
    t34 = t34 + (t33 >> 13u); t33 = t33 & MASK;
    t35 = t35 + (t34 >> 13u); t34 = t34 & MASK;
    t36 = t36 + (t35 >> 13u); t35 = t35 & MASK;
    t37 = t37 + (t36 >> 13u); t36 = t36 & MASK;
    t38 = t38 + (t37 >> 13u); t37 = t37 & MASK;
    t39 = t39 + (t38 >> 13u); t38 = t38 & MASK;
    // result U = t[20:40] -> feed back as next multiplier
    x0 = t20; x1 = t21; x2 = t22; x3 = t23; x4 = t24; x5 = t25; x6 = t26; x7 = t27; x8 = t28; x9 = t29; x10 = t30; x11 = t31; x12 = t32; x13 = t33; x14 = t34; x15 = t35; x16 = t36; x17 = t37; x18 = t38; x19 = t39;
  }

  let obase = grp * 20u;
  outp[obase + 0u] = x0;
  outp[obase + 1u] = x1;
  outp[obase + 2u] = x2;
  outp[obase + 3u] = x3;
  outp[obase + 4u] = x4;
  outp[obase + 5u] = x5;
  outp[obase + 6u] = x6;
  outp[obase + 7u] = x7;
  outp[obase + 8u] = x8;
  outp[obase + 9u] = x9;
  outp[obase + 10u] = x10;
  outp[obase + 11u] = x11;
  outp[obase + 12u] = x12;
  outp[obase + 13u] = x13;
  outp[obase + 14u] = x14;
  outp[obase + 15u] = x15;
  outp[obase + 16u] = x16;
  outp[obase + 17u] = x17;
  outp[obase + 18u] = x18;
  outp[obase + 19u] = x19;
}
