// AUTO-GENERATED fully-unrolled FP32 256-bit square (Design A, B=12).
// Plain exact products (2*12=24 mantissa), per-column hi/lo TwoSum.
// Isolated multiply kernel for malioc; no Montgomery reduction.

const B: f32 = 4096.0;
const BINV: f32 = 0.000244140625;

@group(0) @binding(0) var<storage, read> inbuf: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> outbuf: array<vec4<u32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let q0 = inbuf[i*2u];
  let q1 = inbuf[i*2u+1u];
  let w0=q0.x; let w1=q0.y; let w2=q0.z; let w3=q0.w;
  let w4=q1.x; let w5=q1.y; let w6=q1.z; let w7=q1.w;
  let x0 = f32((w0 >> 0u) & 0xFFFu);
  let x1 = f32((w0 >> 12u) & 0xFFFu);
  let x2 = f32(((w0 >> 24u) | (w1 << 8u)) & 0xFFFu);
  let x3 = f32((w1 >> 4u) & 0xFFFu);
  let x4 = f32((w1 >> 16u) & 0xFFFu);
  let x5 = f32(((w1 >> 28u) | (w2 << 4u)) & 0xFFFu);
  let x6 = f32((w2 >> 8u) & 0xFFFu);
  let x7 = f32((w2 >> 20u) & 0xFFFu);
  let x8 = f32((w3 >> 0u) & 0xFFFu);
  let x9 = f32((w3 >> 12u) & 0xFFFu);
  let x10 = f32(((w3 >> 24u) | (w4 << 8u)) & 0xFFFu);
  let x11 = f32((w4 >> 4u) & 0xFFFu);
  let x12 = f32((w4 >> 16u) & 0xFFFu);
  let x13 = f32(((w4 >> 28u) | (w5 << 4u)) & 0xFFFu);
  let x14 = f32((w5 >> 8u) & 0xFFFu);
  let x15 = f32((w5 >> 20u) & 0xFFFu);
  let x16 = f32((w6 >> 0u) & 0xFFFu);
  let x17 = f32((w6 >> 12u) & 0xFFFu);
  let x18 = f32(((w6 >> 24u) | (w7 << 8u)) & 0xFFFu);
  let x19 = f32((w7 >> 4u) & 0xFFFu);
  let x20 = f32((w7 >> 16u) & 0xFFFu);
  let x21 = f32((w7 >> 28u) & 0xFFFu);

  var h0: f32 = 0.0; var l0: f32 = 0.0;
  var h1: f32 = 0.0; var l1: f32 = 0.0;
  var h2: f32 = 0.0; var l2: f32 = 0.0;
  var h3: f32 = 0.0; var l3: f32 = 0.0;
  var h4: f32 = 0.0; var l4: f32 = 0.0;
  var h5: f32 = 0.0; var l5: f32 = 0.0;
  var h6: f32 = 0.0; var l6: f32 = 0.0;
  var h7: f32 = 0.0; var l7: f32 = 0.0;
  var h8: f32 = 0.0; var l8: f32 = 0.0;
  var h9: f32 = 0.0; var l9: f32 = 0.0;
  var h10: f32 = 0.0; var l10: f32 = 0.0;
  var h11: f32 = 0.0; var l11: f32 = 0.0;
  var h12: f32 = 0.0; var l12: f32 = 0.0;
  var h13: f32 = 0.0; var l13: f32 = 0.0;
  var h14: f32 = 0.0; var l14: f32 = 0.0;
  var h15: f32 = 0.0; var l15: f32 = 0.0;
  var h16: f32 = 0.0; var l16: f32 = 0.0;
  var h17: f32 = 0.0; var l17: f32 = 0.0;
  var h18: f32 = 0.0; var l18: f32 = 0.0;
  var h19: f32 = 0.0; var l19: f32 = 0.0;
  var h20: f32 = 0.0; var l20: f32 = 0.0;
  var h21: f32 = 0.0; var l21: f32 = 0.0;
  var h22: f32 = 0.0; var l22: f32 = 0.0;
  var h23: f32 = 0.0; var l23: f32 = 0.0;
  var h24: f32 = 0.0; var l24: f32 = 0.0;
  var h25: f32 = 0.0; var l25: f32 = 0.0;
  var h26: f32 = 0.0; var l26: f32 = 0.0;
  var h27: f32 = 0.0; var l27: f32 = 0.0;
  var h28: f32 = 0.0; var l28: f32 = 0.0;
  var h29: f32 = 0.0; var l29: f32 = 0.0;
  var h30: f32 = 0.0; var l30: f32 = 0.0;
  var h31: f32 = 0.0; var l31: f32 = 0.0;
  var h32: f32 = 0.0; var l32: f32 = 0.0;
  var h33: f32 = 0.0; var l33: f32 = 0.0;
  var h34: f32 = 0.0; var l34: f32 = 0.0;
  var h35: f32 = 0.0; var l35: f32 = 0.0;
  var h36: f32 = 0.0; var l36: f32 = 0.0;
  var h37: f32 = 0.0; var l37: f32 = 0.0;
  var h38: f32 = 0.0; var l38: f32 = 0.0;
  var h39: f32 = 0.0; var l39: f32 = 0.0;
  var h40: f32 = 0.0; var l40: f32 = 0.0;
  var h41: f32 = 0.0; var l41: f32 = 0.0;
  var h42: f32 = 0.0; var l42: f32 = 0.0;
  var h43: f32 = 0.0; var l43: f32 = 0.0;

  let p0 = x0 * x0; { let s0 = h0 + p0; let b0 = s0 - h0; let e0 = (h0 - (s0 - b0)) + (p0 - b0); h0 = s0; l0 = l0 + e0; }
  let p1 = x0 * x1; { let s1 = h1 + p1; let b1 = s1 - h1; let e1 = (h1 - (s1 - b1)) + (p1 - b1); h1 = s1; l1 = l1 + e1; }
  let p2 = x0 * x2; { let s2 = h2 + p2; let b2 = s2 - h2; let e2 = (h2 - (s2 - b2)) + (p2 - b2); h2 = s2; l2 = l2 + e2; }
  let p3 = x0 * x3; { let s3 = h3 + p3; let b3 = s3 - h3; let e3 = (h3 - (s3 - b3)) + (p3 - b3); h3 = s3; l3 = l3 + e3; }
  let p4 = x0 * x4; { let s4 = h4 + p4; let b4 = s4 - h4; let e4 = (h4 - (s4 - b4)) + (p4 - b4); h4 = s4; l4 = l4 + e4; }
  let p5 = x0 * x5; { let s5 = h5 + p5; let b5 = s5 - h5; let e5 = (h5 - (s5 - b5)) + (p5 - b5); h5 = s5; l5 = l5 + e5; }
  let p6 = x0 * x6; { let s6 = h6 + p6; let b6 = s6 - h6; let e6 = (h6 - (s6 - b6)) + (p6 - b6); h6 = s6; l6 = l6 + e6; }
  let p7 = x0 * x7; { let s7 = h7 + p7; let b7 = s7 - h7; let e7 = (h7 - (s7 - b7)) + (p7 - b7); h7 = s7; l7 = l7 + e7; }
  let p8 = x0 * x8; { let s8 = h8 + p8; let b8 = s8 - h8; let e8 = (h8 - (s8 - b8)) + (p8 - b8); h8 = s8; l8 = l8 + e8; }
  let p9 = x0 * x9; { let s9 = h9 + p9; let b9 = s9 - h9; let e9 = (h9 - (s9 - b9)) + (p9 - b9); h9 = s9; l9 = l9 + e9; }
  let p10 = x0 * x10; { let s10 = h10 + p10; let b10 = s10 - h10; let e10 = (h10 - (s10 - b10)) + (p10 - b10); h10 = s10; l10 = l10 + e10; }
  let p11 = x0 * x11; { let s11 = h11 + p11; let b11 = s11 - h11; let e11 = (h11 - (s11 - b11)) + (p11 - b11); h11 = s11; l11 = l11 + e11; }
  let p12 = x0 * x12; { let s12 = h12 + p12; let b12 = s12 - h12; let e12 = (h12 - (s12 - b12)) + (p12 - b12); h12 = s12; l12 = l12 + e12; }
  let p13 = x0 * x13; { let s13 = h13 + p13; let b13 = s13 - h13; let e13 = (h13 - (s13 - b13)) + (p13 - b13); h13 = s13; l13 = l13 + e13; }
  let p14 = x0 * x14; { let s14 = h14 + p14; let b14 = s14 - h14; let e14 = (h14 - (s14 - b14)) + (p14 - b14); h14 = s14; l14 = l14 + e14; }
  let p15 = x0 * x15; { let s15 = h15 + p15; let b15 = s15 - h15; let e15 = (h15 - (s15 - b15)) + (p15 - b15); h15 = s15; l15 = l15 + e15; }
  let p16 = x0 * x16; { let s16 = h16 + p16; let b16 = s16 - h16; let e16 = (h16 - (s16 - b16)) + (p16 - b16); h16 = s16; l16 = l16 + e16; }
  let p17 = x0 * x17; { let s17 = h17 + p17; let b17 = s17 - h17; let e17 = (h17 - (s17 - b17)) + (p17 - b17); h17 = s17; l17 = l17 + e17; }
  let p18 = x0 * x18; { let s18 = h18 + p18; let b18 = s18 - h18; let e18 = (h18 - (s18 - b18)) + (p18 - b18); h18 = s18; l18 = l18 + e18; }
  let p19 = x0 * x19; { let s19 = h19 + p19; let b19 = s19 - h19; let e19 = (h19 - (s19 - b19)) + (p19 - b19); h19 = s19; l19 = l19 + e19; }
  let p20 = x0 * x20; { let s20 = h20 + p20; let b20 = s20 - h20; let e20 = (h20 - (s20 - b20)) + (p20 - b20); h20 = s20; l20 = l20 + e20; }
  let p21 = x0 * x21; { let s21 = h21 + p21; let b21 = s21 - h21; let e21 = (h21 - (s21 - b21)) + (p21 - b21); h21 = s21; l21 = l21 + e21; }
  let p22 = x1 * x0; { let s22 = h1 + p22; let b22 = s22 - h1; let e22 = (h1 - (s22 - b22)) + (p22 - b22); h1 = s22; l1 = l1 + e22; }
  let p23 = x1 * x1; { let s23 = h2 + p23; let b23 = s23 - h2; let e23 = (h2 - (s23 - b23)) + (p23 - b23); h2 = s23; l2 = l2 + e23; }
  let p24 = x1 * x2; { let s24 = h3 + p24; let b24 = s24 - h3; let e24 = (h3 - (s24 - b24)) + (p24 - b24); h3 = s24; l3 = l3 + e24; }
  let p25 = x1 * x3; { let s25 = h4 + p25; let b25 = s25 - h4; let e25 = (h4 - (s25 - b25)) + (p25 - b25); h4 = s25; l4 = l4 + e25; }
  let p26 = x1 * x4; { let s26 = h5 + p26; let b26 = s26 - h5; let e26 = (h5 - (s26 - b26)) + (p26 - b26); h5 = s26; l5 = l5 + e26; }
  let p27 = x1 * x5; { let s27 = h6 + p27; let b27 = s27 - h6; let e27 = (h6 - (s27 - b27)) + (p27 - b27); h6 = s27; l6 = l6 + e27; }
  let p28 = x1 * x6; { let s28 = h7 + p28; let b28 = s28 - h7; let e28 = (h7 - (s28 - b28)) + (p28 - b28); h7 = s28; l7 = l7 + e28; }
  let p29 = x1 * x7; { let s29 = h8 + p29; let b29 = s29 - h8; let e29 = (h8 - (s29 - b29)) + (p29 - b29); h8 = s29; l8 = l8 + e29; }
  let p30 = x1 * x8; { let s30 = h9 + p30; let b30 = s30 - h9; let e30 = (h9 - (s30 - b30)) + (p30 - b30); h9 = s30; l9 = l9 + e30; }
  let p31 = x1 * x9; { let s31 = h10 + p31; let b31 = s31 - h10; let e31 = (h10 - (s31 - b31)) + (p31 - b31); h10 = s31; l10 = l10 + e31; }
  let p32 = x1 * x10; { let s32 = h11 + p32; let b32 = s32 - h11; let e32 = (h11 - (s32 - b32)) + (p32 - b32); h11 = s32; l11 = l11 + e32; }
  let p33 = x1 * x11; { let s33 = h12 + p33; let b33 = s33 - h12; let e33 = (h12 - (s33 - b33)) + (p33 - b33); h12 = s33; l12 = l12 + e33; }
  let p34 = x1 * x12; { let s34 = h13 + p34; let b34 = s34 - h13; let e34 = (h13 - (s34 - b34)) + (p34 - b34); h13 = s34; l13 = l13 + e34; }
  let p35 = x1 * x13; { let s35 = h14 + p35; let b35 = s35 - h14; let e35 = (h14 - (s35 - b35)) + (p35 - b35); h14 = s35; l14 = l14 + e35; }
  let p36 = x1 * x14; { let s36 = h15 + p36; let b36 = s36 - h15; let e36 = (h15 - (s36 - b36)) + (p36 - b36); h15 = s36; l15 = l15 + e36; }
  let p37 = x1 * x15; { let s37 = h16 + p37; let b37 = s37 - h16; let e37 = (h16 - (s37 - b37)) + (p37 - b37); h16 = s37; l16 = l16 + e37; }
  let p38 = x1 * x16; { let s38 = h17 + p38; let b38 = s38 - h17; let e38 = (h17 - (s38 - b38)) + (p38 - b38); h17 = s38; l17 = l17 + e38; }
  let p39 = x1 * x17; { let s39 = h18 + p39; let b39 = s39 - h18; let e39 = (h18 - (s39 - b39)) + (p39 - b39); h18 = s39; l18 = l18 + e39; }
  let p40 = x1 * x18; { let s40 = h19 + p40; let b40 = s40 - h19; let e40 = (h19 - (s40 - b40)) + (p40 - b40); h19 = s40; l19 = l19 + e40; }
  let p41 = x1 * x19; { let s41 = h20 + p41; let b41 = s41 - h20; let e41 = (h20 - (s41 - b41)) + (p41 - b41); h20 = s41; l20 = l20 + e41; }
  let p42 = x1 * x20; { let s42 = h21 + p42; let b42 = s42 - h21; let e42 = (h21 - (s42 - b42)) + (p42 - b42); h21 = s42; l21 = l21 + e42; }
  let p43 = x1 * x21; { let s43 = h22 + p43; let b43 = s43 - h22; let e43 = (h22 - (s43 - b43)) + (p43 - b43); h22 = s43; l22 = l22 + e43; }
  let p44 = x2 * x0; { let s44 = h2 + p44; let b44 = s44 - h2; let e44 = (h2 - (s44 - b44)) + (p44 - b44); h2 = s44; l2 = l2 + e44; }
  let p45 = x2 * x1; { let s45 = h3 + p45; let b45 = s45 - h3; let e45 = (h3 - (s45 - b45)) + (p45 - b45); h3 = s45; l3 = l3 + e45; }
  let p46 = x2 * x2; { let s46 = h4 + p46; let b46 = s46 - h4; let e46 = (h4 - (s46 - b46)) + (p46 - b46); h4 = s46; l4 = l4 + e46; }
  let p47 = x2 * x3; { let s47 = h5 + p47; let b47 = s47 - h5; let e47 = (h5 - (s47 - b47)) + (p47 - b47); h5 = s47; l5 = l5 + e47; }
  let p48 = x2 * x4; { let s48 = h6 + p48; let b48 = s48 - h6; let e48 = (h6 - (s48 - b48)) + (p48 - b48); h6 = s48; l6 = l6 + e48; }
  let p49 = x2 * x5; { let s49 = h7 + p49; let b49 = s49 - h7; let e49 = (h7 - (s49 - b49)) + (p49 - b49); h7 = s49; l7 = l7 + e49; }
  let p50 = x2 * x6; { let s50 = h8 + p50; let b50 = s50 - h8; let e50 = (h8 - (s50 - b50)) + (p50 - b50); h8 = s50; l8 = l8 + e50; }
  let p51 = x2 * x7; { let s51 = h9 + p51; let b51 = s51 - h9; let e51 = (h9 - (s51 - b51)) + (p51 - b51); h9 = s51; l9 = l9 + e51; }
  let p52 = x2 * x8; { let s52 = h10 + p52; let b52 = s52 - h10; let e52 = (h10 - (s52 - b52)) + (p52 - b52); h10 = s52; l10 = l10 + e52; }
  let p53 = x2 * x9; { let s53 = h11 + p53; let b53 = s53 - h11; let e53 = (h11 - (s53 - b53)) + (p53 - b53); h11 = s53; l11 = l11 + e53; }
  let p54 = x2 * x10; { let s54 = h12 + p54; let b54 = s54 - h12; let e54 = (h12 - (s54 - b54)) + (p54 - b54); h12 = s54; l12 = l12 + e54; }
  let p55 = x2 * x11; { let s55 = h13 + p55; let b55 = s55 - h13; let e55 = (h13 - (s55 - b55)) + (p55 - b55); h13 = s55; l13 = l13 + e55; }
  let p56 = x2 * x12; { let s56 = h14 + p56; let b56 = s56 - h14; let e56 = (h14 - (s56 - b56)) + (p56 - b56); h14 = s56; l14 = l14 + e56; }
  let p57 = x2 * x13; { let s57 = h15 + p57; let b57 = s57 - h15; let e57 = (h15 - (s57 - b57)) + (p57 - b57); h15 = s57; l15 = l15 + e57; }
  let p58 = x2 * x14; { let s58 = h16 + p58; let b58 = s58 - h16; let e58 = (h16 - (s58 - b58)) + (p58 - b58); h16 = s58; l16 = l16 + e58; }
  let p59 = x2 * x15; { let s59 = h17 + p59; let b59 = s59 - h17; let e59 = (h17 - (s59 - b59)) + (p59 - b59); h17 = s59; l17 = l17 + e59; }
  let p60 = x2 * x16; { let s60 = h18 + p60; let b60 = s60 - h18; let e60 = (h18 - (s60 - b60)) + (p60 - b60); h18 = s60; l18 = l18 + e60; }
  let p61 = x2 * x17; { let s61 = h19 + p61; let b61 = s61 - h19; let e61 = (h19 - (s61 - b61)) + (p61 - b61); h19 = s61; l19 = l19 + e61; }
  let p62 = x2 * x18; { let s62 = h20 + p62; let b62 = s62 - h20; let e62 = (h20 - (s62 - b62)) + (p62 - b62); h20 = s62; l20 = l20 + e62; }
  let p63 = x2 * x19; { let s63 = h21 + p63; let b63 = s63 - h21; let e63 = (h21 - (s63 - b63)) + (p63 - b63); h21 = s63; l21 = l21 + e63; }
  let p64 = x2 * x20; { let s64 = h22 + p64; let b64 = s64 - h22; let e64 = (h22 - (s64 - b64)) + (p64 - b64); h22 = s64; l22 = l22 + e64; }
  let p65 = x2 * x21; { let s65 = h23 + p65; let b65 = s65 - h23; let e65 = (h23 - (s65 - b65)) + (p65 - b65); h23 = s65; l23 = l23 + e65; }
  let p66 = x3 * x0; { let s66 = h3 + p66; let b66 = s66 - h3; let e66 = (h3 - (s66 - b66)) + (p66 - b66); h3 = s66; l3 = l3 + e66; }
  let p67 = x3 * x1; { let s67 = h4 + p67; let b67 = s67 - h4; let e67 = (h4 - (s67 - b67)) + (p67 - b67); h4 = s67; l4 = l4 + e67; }
  let p68 = x3 * x2; { let s68 = h5 + p68; let b68 = s68 - h5; let e68 = (h5 - (s68 - b68)) + (p68 - b68); h5 = s68; l5 = l5 + e68; }
  let p69 = x3 * x3; { let s69 = h6 + p69; let b69 = s69 - h6; let e69 = (h6 - (s69 - b69)) + (p69 - b69); h6 = s69; l6 = l6 + e69; }
  let p70 = x3 * x4; { let s70 = h7 + p70; let b70 = s70 - h7; let e70 = (h7 - (s70 - b70)) + (p70 - b70); h7 = s70; l7 = l7 + e70; }
  let p71 = x3 * x5; { let s71 = h8 + p71; let b71 = s71 - h8; let e71 = (h8 - (s71 - b71)) + (p71 - b71); h8 = s71; l8 = l8 + e71; }
  let p72 = x3 * x6; { let s72 = h9 + p72; let b72 = s72 - h9; let e72 = (h9 - (s72 - b72)) + (p72 - b72); h9 = s72; l9 = l9 + e72; }
  let p73 = x3 * x7; { let s73 = h10 + p73; let b73 = s73 - h10; let e73 = (h10 - (s73 - b73)) + (p73 - b73); h10 = s73; l10 = l10 + e73; }
  let p74 = x3 * x8; { let s74 = h11 + p74; let b74 = s74 - h11; let e74 = (h11 - (s74 - b74)) + (p74 - b74); h11 = s74; l11 = l11 + e74; }
  let p75 = x3 * x9; { let s75 = h12 + p75; let b75 = s75 - h12; let e75 = (h12 - (s75 - b75)) + (p75 - b75); h12 = s75; l12 = l12 + e75; }
  let p76 = x3 * x10; { let s76 = h13 + p76; let b76 = s76 - h13; let e76 = (h13 - (s76 - b76)) + (p76 - b76); h13 = s76; l13 = l13 + e76; }
  let p77 = x3 * x11; { let s77 = h14 + p77; let b77 = s77 - h14; let e77 = (h14 - (s77 - b77)) + (p77 - b77); h14 = s77; l14 = l14 + e77; }
  let p78 = x3 * x12; { let s78 = h15 + p78; let b78 = s78 - h15; let e78 = (h15 - (s78 - b78)) + (p78 - b78); h15 = s78; l15 = l15 + e78; }
  let p79 = x3 * x13; { let s79 = h16 + p79; let b79 = s79 - h16; let e79 = (h16 - (s79 - b79)) + (p79 - b79); h16 = s79; l16 = l16 + e79; }
  let p80 = x3 * x14; { let s80 = h17 + p80; let b80 = s80 - h17; let e80 = (h17 - (s80 - b80)) + (p80 - b80); h17 = s80; l17 = l17 + e80; }
  let p81 = x3 * x15; { let s81 = h18 + p81; let b81 = s81 - h18; let e81 = (h18 - (s81 - b81)) + (p81 - b81); h18 = s81; l18 = l18 + e81; }
  let p82 = x3 * x16; { let s82 = h19 + p82; let b82 = s82 - h19; let e82 = (h19 - (s82 - b82)) + (p82 - b82); h19 = s82; l19 = l19 + e82; }
  let p83 = x3 * x17; { let s83 = h20 + p83; let b83 = s83 - h20; let e83 = (h20 - (s83 - b83)) + (p83 - b83); h20 = s83; l20 = l20 + e83; }
  let p84 = x3 * x18; { let s84 = h21 + p84; let b84 = s84 - h21; let e84 = (h21 - (s84 - b84)) + (p84 - b84); h21 = s84; l21 = l21 + e84; }
  let p85 = x3 * x19; { let s85 = h22 + p85; let b85 = s85 - h22; let e85 = (h22 - (s85 - b85)) + (p85 - b85); h22 = s85; l22 = l22 + e85; }
  let p86 = x3 * x20; { let s86 = h23 + p86; let b86 = s86 - h23; let e86 = (h23 - (s86 - b86)) + (p86 - b86); h23 = s86; l23 = l23 + e86; }
  let p87 = x3 * x21; { let s87 = h24 + p87; let b87 = s87 - h24; let e87 = (h24 - (s87 - b87)) + (p87 - b87); h24 = s87; l24 = l24 + e87; }
  let p88 = x4 * x0; { let s88 = h4 + p88; let b88 = s88 - h4; let e88 = (h4 - (s88 - b88)) + (p88 - b88); h4 = s88; l4 = l4 + e88; }
  let p89 = x4 * x1; { let s89 = h5 + p89; let b89 = s89 - h5; let e89 = (h5 - (s89 - b89)) + (p89 - b89); h5 = s89; l5 = l5 + e89; }
  let p90 = x4 * x2; { let s90 = h6 + p90; let b90 = s90 - h6; let e90 = (h6 - (s90 - b90)) + (p90 - b90); h6 = s90; l6 = l6 + e90; }
  let p91 = x4 * x3; { let s91 = h7 + p91; let b91 = s91 - h7; let e91 = (h7 - (s91 - b91)) + (p91 - b91); h7 = s91; l7 = l7 + e91; }
  let p92 = x4 * x4; { let s92 = h8 + p92; let b92 = s92 - h8; let e92 = (h8 - (s92 - b92)) + (p92 - b92); h8 = s92; l8 = l8 + e92; }
  let p93 = x4 * x5; { let s93 = h9 + p93; let b93 = s93 - h9; let e93 = (h9 - (s93 - b93)) + (p93 - b93); h9 = s93; l9 = l9 + e93; }
  let p94 = x4 * x6; { let s94 = h10 + p94; let b94 = s94 - h10; let e94 = (h10 - (s94 - b94)) + (p94 - b94); h10 = s94; l10 = l10 + e94; }
  let p95 = x4 * x7; { let s95 = h11 + p95; let b95 = s95 - h11; let e95 = (h11 - (s95 - b95)) + (p95 - b95); h11 = s95; l11 = l11 + e95; }
  let p96 = x4 * x8; { let s96 = h12 + p96; let b96 = s96 - h12; let e96 = (h12 - (s96 - b96)) + (p96 - b96); h12 = s96; l12 = l12 + e96; }
  let p97 = x4 * x9; { let s97 = h13 + p97; let b97 = s97 - h13; let e97 = (h13 - (s97 - b97)) + (p97 - b97); h13 = s97; l13 = l13 + e97; }
  let p98 = x4 * x10; { let s98 = h14 + p98; let b98 = s98 - h14; let e98 = (h14 - (s98 - b98)) + (p98 - b98); h14 = s98; l14 = l14 + e98; }
  let p99 = x4 * x11; { let s99 = h15 + p99; let b99 = s99 - h15; let e99 = (h15 - (s99 - b99)) + (p99 - b99); h15 = s99; l15 = l15 + e99; }
  let p100 = x4 * x12; { let s100 = h16 + p100; let b100 = s100 - h16; let e100 = (h16 - (s100 - b100)) + (p100 - b100); h16 = s100; l16 = l16 + e100; }
  let p101 = x4 * x13; { let s101 = h17 + p101; let b101 = s101 - h17; let e101 = (h17 - (s101 - b101)) + (p101 - b101); h17 = s101; l17 = l17 + e101; }
  let p102 = x4 * x14; { let s102 = h18 + p102; let b102 = s102 - h18; let e102 = (h18 - (s102 - b102)) + (p102 - b102); h18 = s102; l18 = l18 + e102; }
  let p103 = x4 * x15; { let s103 = h19 + p103; let b103 = s103 - h19; let e103 = (h19 - (s103 - b103)) + (p103 - b103); h19 = s103; l19 = l19 + e103; }
  let p104 = x4 * x16; { let s104 = h20 + p104; let b104 = s104 - h20; let e104 = (h20 - (s104 - b104)) + (p104 - b104); h20 = s104; l20 = l20 + e104; }
  let p105 = x4 * x17; { let s105 = h21 + p105; let b105 = s105 - h21; let e105 = (h21 - (s105 - b105)) + (p105 - b105); h21 = s105; l21 = l21 + e105; }
  let p106 = x4 * x18; { let s106 = h22 + p106; let b106 = s106 - h22; let e106 = (h22 - (s106 - b106)) + (p106 - b106); h22 = s106; l22 = l22 + e106; }
  let p107 = x4 * x19; { let s107 = h23 + p107; let b107 = s107 - h23; let e107 = (h23 - (s107 - b107)) + (p107 - b107); h23 = s107; l23 = l23 + e107; }
  let p108 = x4 * x20; { let s108 = h24 + p108; let b108 = s108 - h24; let e108 = (h24 - (s108 - b108)) + (p108 - b108); h24 = s108; l24 = l24 + e108; }
  let p109 = x4 * x21; { let s109 = h25 + p109; let b109 = s109 - h25; let e109 = (h25 - (s109 - b109)) + (p109 - b109); h25 = s109; l25 = l25 + e109; }
  let p110 = x5 * x0; { let s110 = h5 + p110; let b110 = s110 - h5; let e110 = (h5 - (s110 - b110)) + (p110 - b110); h5 = s110; l5 = l5 + e110; }
  let p111 = x5 * x1; { let s111 = h6 + p111; let b111 = s111 - h6; let e111 = (h6 - (s111 - b111)) + (p111 - b111); h6 = s111; l6 = l6 + e111; }
  let p112 = x5 * x2; { let s112 = h7 + p112; let b112 = s112 - h7; let e112 = (h7 - (s112 - b112)) + (p112 - b112); h7 = s112; l7 = l7 + e112; }
  let p113 = x5 * x3; { let s113 = h8 + p113; let b113 = s113 - h8; let e113 = (h8 - (s113 - b113)) + (p113 - b113); h8 = s113; l8 = l8 + e113; }
  let p114 = x5 * x4; { let s114 = h9 + p114; let b114 = s114 - h9; let e114 = (h9 - (s114 - b114)) + (p114 - b114); h9 = s114; l9 = l9 + e114; }
  let p115 = x5 * x5; { let s115 = h10 + p115; let b115 = s115 - h10; let e115 = (h10 - (s115 - b115)) + (p115 - b115); h10 = s115; l10 = l10 + e115; }
  let p116 = x5 * x6; { let s116 = h11 + p116; let b116 = s116 - h11; let e116 = (h11 - (s116 - b116)) + (p116 - b116); h11 = s116; l11 = l11 + e116; }
  let p117 = x5 * x7; { let s117 = h12 + p117; let b117 = s117 - h12; let e117 = (h12 - (s117 - b117)) + (p117 - b117); h12 = s117; l12 = l12 + e117; }
  let p118 = x5 * x8; { let s118 = h13 + p118; let b118 = s118 - h13; let e118 = (h13 - (s118 - b118)) + (p118 - b118); h13 = s118; l13 = l13 + e118; }
  let p119 = x5 * x9; { let s119 = h14 + p119; let b119 = s119 - h14; let e119 = (h14 - (s119 - b119)) + (p119 - b119); h14 = s119; l14 = l14 + e119; }
  let p120 = x5 * x10; { let s120 = h15 + p120; let b120 = s120 - h15; let e120 = (h15 - (s120 - b120)) + (p120 - b120); h15 = s120; l15 = l15 + e120; }
  let p121 = x5 * x11; { let s121 = h16 + p121; let b121 = s121 - h16; let e121 = (h16 - (s121 - b121)) + (p121 - b121); h16 = s121; l16 = l16 + e121; }
  let p122 = x5 * x12; { let s122 = h17 + p122; let b122 = s122 - h17; let e122 = (h17 - (s122 - b122)) + (p122 - b122); h17 = s122; l17 = l17 + e122; }
  let p123 = x5 * x13; { let s123 = h18 + p123; let b123 = s123 - h18; let e123 = (h18 - (s123 - b123)) + (p123 - b123); h18 = s123; l18 = l18 + e123; }
  let p124 = x5 * x14; { let s124 = h19 + p124; let b124 = s124 - h19; let e124 = (h19 - (s124 - b124)) + (p124 - b124); h19 = s124; l19 = l19 + e124; }
  let p125 = x5 * x15; { let s125 = h20 + p125; let b125 = s125 - h20; let e125 = (h20 - (s125 - b125)) + (p125 - b125); h20 = s125; l20 = l20 + e125; }
  let p126 = x5 * x16; { let s126 = h21 + p126; let b126 = s126 - h21; let e126 = (h21 - (s126 - b126)) + (p126 - b126); h21 = s126; l21 = l21 + e126; }
  let p127 = x5 * x17; { let s127 = h22 + p127; let b127 = s127 - h22; let e127 = (h22 - (s127 - b127)) + (p127 - b127); h22 = s127; l22 = l22 + e127; }
  let p128 = x5 * x18; { let s128 = h23 + p128; let b128 = s128 - h23; let e128 = (h23 - (s128 - b128)) + (p128 - b128); h23 = s128; l23 = l23 + e128; }
  let p129 = x5 * x19; { let s129 = h24 + p129; let b129 = s129 - h24; let e129 = (h24 - (s129 - b129)) + (p129 - b129); h24 = s129; l24 = l24 + e129; }
  let p130 = x5 * x20; { let s130 = h25 + p130; let b130 = s130 - h25; let e130 = (h25 - (s130 - b130)) + (p130 - b130); h25 = s130; l25 = l25 + e130; }
  let p131 = x5 * x21; { let s131 = h26 + p131; let b131 = s131 - h26; let e131 = (h26 - (s131 - b131)) + (p131 - b131); h26 = s131; l26 = l26 + e131; }
  let p132 = x6 * x0; { let s132 = h6 + p132; let b132 = s132 - h6; let e132 = (h6 - (s132 - b132)) + (p132 - b132); h6 = s132; l6 = l6 + e132; }
  let p133 = x6 * x1; { let s133 = h7 + p133; let b133 = s133 - h7; let e133 = (h7 - (s133 - b133)) + (p133 - b133); h7 = s133; l7 = l7 + e133; }
  let p134 = x6 * x2; { let s134 = h8 + p134; let b134 = s134 - h8; let e134 = (h8 - (s134 - b134)) + (p134 - b134); h8 = s134; l8 = l8 + e134; }
  let p135 = x6 * x3; { let s135 = h9 + p135; let b135 = s135 - h9; let e135 = (h9 - (s135 - b135)) + (p135 - b135); h9 = s135; l9 = l9 + e135; }
  let p136 = x6 * x4; { let s136 = h10 + p136; let b136 = s136 - h10; let e136 = (h10 - (s136 - b136)) + (p136 - b136); h10 = s136; l10 = l10 + e136; }
  let p137 = x6 * x5; { let s137 = h11 + p137; let b137 = s137 - h11; let e137 = (h11 - (s137 - b137)) + (p137 - b137); h11 = s137; l11 = l11 + e137; }
  let p138 = x6 * x6; { let s138 = h12 + p138; let b138 = s138 - h12; let e138 = (h12 - (s138 - b138)) + (p138 - b138); h12 = s138; l12 = l12 + e138; }
  let p139 = x6 * x7; { let s139 = h13 + p139; let b139 = s139 - h13; let e139 = (h13 - (s139 - b139)) + (p139 - b139); h13 = s139; l13 = l13 + e139; }
  let p140 = x6 * x8; { let s140 = h14 + p140; let b140 = s140 - h14; let e140 = (h14 - (s140 - b140)) + (p140 - b140); h14 = s140; l14 = l14 + e140; }
  let p141 = x6 * x9; { let s141 = h15 + p141; let b141 = s141 - h15; let e141 = (h15 - (s141 - b141)) + (p141 - b141); h15 = s141; l15 = l15 + e141; }
  let p142 = x6 * x10; { let s142 = h16 + p142; let b142 = s142 - h16; let e142 = (h16 - (s142 - b142)) + (p142 - b142); h16 = s142; l16 = l16 + e142; }
  let p143 = x6 * x11; { let s143 = h17 + p143; let b143 = s143 - h17; let e143 = (h17 - (s143 - b143)) + (p143 - b143); h17 = s143; l17 = l17 + e143; }
  let p144 = x6 * x12; { let s144 = h18 + p144; let b144 = s144 - h18; let e144 = (h18 - (s144 - b144)) + (p144 - b144); h18 = s144; l18 = l18 + e144; }
  let p145 = x6 * x13; { let s145 = h19 + p145; let b145 = s145 - h19; let e145 = (h19 - (s145 - b145)) + (p145 - b145); h19 = s145; l19 = l19 + e145; }
  let p146 = x6 * x14; { let s146 = h20 + p146; let b146 = s146 - h20; let e146 = (h20 - (s146 - b146)) + (p146 - b146); h20 = s146; l20 = l20 + e146; }
  let p147 = x6 * x15; { let s147 = h21 + p147; let b147 = s147 - h21; let e147 = (h21 - (s147 - b147)) + (p147 - b147); h21 = s147; l21 = l21 + e147; }
  let p148 = x6 * x16; { let s148 = h22 + p148; let b148 = s148 - h22; let e148 = (h22 - (s148 - b148)) + (p148 - b148); h22 = s148; l22 = l22 + e148; }
  let p149 = x6 * x17; { let s149 = h23 + p149; let b149 = s149 - h23; let e149 = (h23 - (s149 - b149)) + (p149 - b149); h23 = s149; l23 = l23 + e149; }
  let p150 = x6 * x18; { let s150 = h24 + p150; let b150 = s150 - h24; let e150 = (h24 - (s150 - b150)) + (p150 - b150); h24 = s150; l24 = l24 + e150; }
  let p151 = x6 * x19; { let s151 = h25 + p151; let b151 = s151 - h25; let e151 = (h25 - (s151 - b151)) + (p151 - b151); h25 = s151; l25 = l25 + e151; }
  let p152 = x6 * x20; { let s152 = h26 + p152; let b152 = s152 - h26; let e152 = (h26 - (s152 - b152)) + (p152 - b152); h26 = s152; l26 = l26 + e152; }
  let p153 = x6 * x21; { let s153 = h27 + p153; let b153 = s153 - h27; let e153 = (h27 - (s153 - b153)) + (p153 - b153); h27 = s153; l27 = l27 + e153; }
  let p154 = x7 * x0; { let s154 = h7 + p154; let b154 = s154 - h7; let e154 = (h7 - (s154 - b154)) + (p154 - b154); h7 = s154; l7 = l7 + e154; }
  let p155 = x7 * x1; { let s155 = h8 + p155; let b155 = s155 - h8; let e155 = (h8 - (s155 - b155)) + (p155 - b155); h8 = s155; l8 = l8 + e155; }
  let p156 = x7 * x2; { let s156 = h9 + p156; let b156 = s156 - h9; let e156 = (h9 - (s156 - b156)) + (p156 - b156); h9 = s156; l9 = l9 + e156; }
  let p157 = x7 * x3; { let s157 = h10 + p157; let b157 = s157 - h10; let e157 = (h10 - (s157 - b157)) + (p157 - b157); h10 = s157; l10 = l10 + e157; }
  let p158 = x7 * x4; { let s158 = h11 + p158; let b158 = s158 - h11; let e158 = (h11 - (s158 - b158)) + (p158 - b158); h11 = s158; l11 = l11 + e158; }
  let p159 = x7 * x5; { let s159 = h12 + p159; let b159 = s159 - h12; let e159 = (h12 - (s159 - b159)) + (p159 - b159); h12 = s159; l12 = l12 + e159; }
  let p160 = x7 * x6; { let s160 = h13 + p160; let b160 = s160 - h13; let e160 = (h13 - (s160 - b160)) + (p160 - b160); h13 = s160; l13 = l13 + e160; }
  let p161 = x7 * x7; { let s161 = h14 + p161; let b161 = s161 - h14; let e161 = (h14 - (s161 - b161)) + (p161 - b161); h14 = s161; l14 = l14 + e161; }
  let p162 = x7 * x8; { let s162 = h15 + p162; let b162 = s162 - h15; let e162 = (h15 - (s162 - b162)) + (p162 - b162); h15 = s162; l15 = l15 + e162; }
  let p163 = x7 * x9; { let s163 = h16 + p163; let b163 = s163 - h16; let e163 = (h16 - (s163 - b163)) + (p163 - b163); h16 = s163; l16 = l16 + e163; }
  let p164 = x7 * x10; { let s164 = h17 + p164; let b164 = s164 - h17; let e164 = (h17 - (s164 - b164)) + (p164 - b164); h17 = s164; l17 = l17 + e164; }
  let p165 = x7 * x11; { let s165 = h18 + p165; let b165 = s165 - h18; let e165 = (h18 - (s165 - b165)) + (p165 - b165); h18 = s165; l18 = l18 + e165; }
  let p166 = x7 * x12; { let s166 = h19 + p166; let b166 = s166 - h19; let e166 = (h19 - (s166 - b166)) + (p166 - b166); h19 = s166; l19 = l19 + e166; }
  let p167 = x7 * x13; { let s167 = h20 + p167; let b167 = s167 - h20; let e167 = (h20 - (s167 - b167)) + (p167 - b167); h20 = s167; l20 = l20 + e167; }
  let p168 = x7 * x14; { let s168 = h21 + p168; let b168 = s168 - h21; let e168 = (h21 - (s168 - b168)) + (p168 - b168); h21 = s168; l21 = l21 + e168; }
  let p169 = x7 * x15; { let s169 = h22 + p169; let b169 = s169 - h22; let e169 = (h22 - (s169 - b169)) + (p169 - b169); h22 = s169; l22 = l22 + e169; }
  let p170 = x7 * x16; { let s170 = h23 + p170; let b170 = s170 - h23; let e170 = (h23 - (s170 - b170)) + (p170 - b170); h23 = s170; l23 = l23 + e170; }
  let p171 = x7 * x17; { let s171 = h24 + p171; let b171 = s171 - h24; let e171 = (h24 - (s171 - b171)) + (p171 - b171); h24 = s171; l24 = l24 + e171; }
  let p172 = x7 * x18; { let s172 = h25 + p172; let b172 = s172 - h25; let e172 = (h25 - (s172 - b172)) + (p172 - b172); h25 = s172; l25 = l25 + e172; }
  let p173 = x7 * x19; { let s173 = h26 + p173; let b173 = s173 - h26; let e173 = (h26 - (s173 - b173)) + (p173 - b173); h26 = s173; l26 = l26 + e173; }
  let p174 = x7 * x20; { let s174 = h27 + p174; let b174 = s174 - h27; let e174 = (h27 - (s174 - b174)) + (p174 - b174); h27 = s174; l27 = l27 + e174; }
  let p175 = x7 * x21; { let s175 = h28 + p175; let b175 = s175 - h28; let e175 = (h28 - (s175 - b175)) + (p175 - b175); h28 = s175; l28 = l28 + e175; }
  let p176 = x8 * x0; { let s176 = h8 + p176; let b176 = s176 - h8; let e176 = (h8 - (s176 - b176)) + (p176 - b176); h8 = s176; l8 = l8 + e176; }
  let p177 = x8 * x1; { let s177 = h9 + p177; let b177 = s177 - h9; let e177 = (h9 - (s177 - b177)) + (p177 - b177); h9 = s177; l9 = l9 + e177; }
  let p178 = x8 * x2; { let s178 = h10 + p178; let b178 = s178 - h10; let e178 = (h10 - (s178 - b178)) + (p178 - b178); h10 = s178; l10 = l10 + e178; }
  let p179 = x8 * x3; { let s179 = h11 + p179; let b179 = s179 - h11; let e179 = (h11 - (s179 - b179)) + (p179 - b179); h11 = s179; l11 = l11 + e179; }
  let p180 = x8 * x4; { let s180 = h12 + p180; let b180 = s180 - h12; let e180 = (h12 - (s180 - b180)) + (p180 - b180); h12 = s180; l12 = l12 + e180; }
  let p181 = x8 * x5; { let s181 = h13 + p181; let b181 = s181 - h13; let e181 = (h13 - (s181 - b181)) + (p181 - b181); h13 = s181; l13 = l13 + e181; }
  let p182 = x8 * x6; { let s182 = h14 + p182; let b182 = s182 - h14; let e182 = (h14 - (s182 - b182)) + (p182 - b182); h14 = s182; l14 = l14 + e182; }
  let p183 = x8 * x7; { let s183 = h15 + p183; let b183 = s183 - h15; let e183 = (h15 - (s183 - b183)) + (p183 - b183); h15 = s183; l15 = l15 + e183; }
  let p184 = x8 * x8; { let s184 = h16 + p184; let b184 = s184 - h16; let e184 = (h16 - (s184 - b184)) + (p184 - b184); h16 = s184; l16 = l16 + e184; }
  let p185 = x8 * x9; { let s185 = h17 + p185; let b185 = s185 - h17; let e185 = (h17 - (s185 - b185)) + (p185 - b185); h17 = s185; l17 = l17 + e185; }
  let p186 = x8 * x10; { let s186 = h18 + p186; let b186 = s186 - h18; let e186 = (h18 - (s186 - b186)) + (p186 - b186); h18 = s186; l18 = l18 + e186; }
  let p187 = x8 * x11; { let s187 = h19 + p187; let b187 = s187 - h19; let e187 = (h19 - (s187 - b187)) + (p187 - b187); h19 = s187; l19 = l19 + e187; }
  let p188 = x8 * x12; { let s188 = h20 + p188; let b188 = s188 - h20; let e188 = (h20 - (s188 - b188)) + (p188 - b188); h20 = s188; l20 = l20 + e188; }
  let p189 = x8 * x13; { let s189 = h21 + p189; let b189 = s189 - h21; let e189 = (h21 - (s189 - b189)) + (p189 - b189); h21 = s189; l21 = l21 + e189; }
  let p190 = x8 * x14; { let s190 = h22 + p190; let b190 = s190 - h22; let e190 = (h22 - (s190 - b190)) + (p190 - b190); h22 = s190; l22 = l22 + e190; }
  let p191 = x8 * x15; { let s191 = h23 + p191; let b191 = s191 - h23; let e191 = (h23 - (s191 - b191)) + (p191 - b191); h23 = s191; l23 = l23 + e191; }
  let p192 = x8 * x16; { let s192 = h24 + p192; let b192 = s192 - h24; let e192 = (h24 - (s192 - b192)) + (p192 - b192); h24 = s192; l24 = l24 + e192; }
  let p193 = x8 * x17; { let s193 = h25 + p193; let b193 = s193 - h25; let e193 = (h25 - (s193 - b193)) + (p193 - b193); h25 = s193; l25 = l25 + e193; }
  let p194 = x8 * x18; { let s194 = h26 + p194; let b194 = s194 - h26; let e194 = (h26 - (s194 - b194)) + (p194 - b194); h26 = s194; l26 = l26 + e194; }
  let p195 = x8 * x19; { let s195 = h27 + p195; let b195 = s195 - h27; let e195 = (h27 - (s195 - b195)) + (p195 - b195); h27 = s195; l27 = l27 + e195; }
  let p196 = x8 * x20; { let s196 = h28 + p196; let b196 = s196 - h28; let e196 = (h28 - (s196 - b196)) + (p196 - b196); h28 = s196; l28 = l28 + e196; }
  let p197 = x8 * x21; { let s197 = h29 + p197; let b197 = s197 - h29; let e197 = (h29 - (s197 - b197)) + (p197 - b197); h29 = s197; l29 = l29 + e197; }
  let p198 = x9 * x0; { let s198 = h9 + p198; let b198 = s198 - h9; let e198 = (h9 - (s198 - b198)) + (p198 - b198); h9 = s198; l9 = l9 + e198; }
  let p199 = x9 * x1; { let s199 = h10 + p199; let b199 = s199 - h10; let e199 = (h10 - (s199 - b199)) + (p199 - b199); h10 = s199; l10 = l10 + e199; }
  let p200 = x9 * x2; { let s200 = h11 + p200; let b200 = s200 - h11; let e200 = (h11 - (s200 - b200)) + (p200 - b200); h11 = s200; l11 = l11 + e200; }
  let p201 = x9 * x3; { let s201 = h12 + p201; let b201 = s201 - h12; let e201 = (h12 - (s201 - b201)) + (p201 - b201); h12 = s201; l12 = l12 + e201; }
  let p202 = x9 * x4; { let s202 = h13 + p202; let b202 = s202 - h13; let e202 = (h13 - (s202 - b202)) + (p202 - b202); h13 = s202; l13 = l13 + e202; }
  let p203 = x9 * x5; { let s203 = h14 + p203; let b203 = s203 - h14; let e203 = (h14 - (s203 - b203)) + (p203 - b203); h14 = s203; l14 = l14 + e203; }
  let p204 = x9 * x6; { let s204 = h15 + p204; let b204 = s204 - h15; let e204 = (h15 - (s204 - b204)) + (p204 - b204); h15 = s204; l15 = l15 + e204; }
  let p205 = x9 * x7; { let s205 = h16 + p205; let b205 = s205 - h16; let e205 = (h16 - (s205 - b205)) + (p205 - b205); h16 = s205; l16 = l16 + e205; }
  let p206 = x9 * x8; { let s206 = h17 + p206; let b206 = s206 - h17; let e206 = (h17 - (s206 - b206)) + (p206 - b206); h17 = s206; l17 = l17 + e206; }
  let p207 = x9 * x9; { let s207 = h18 + p207; let b207 = s207 - h18; let e207 = (h18 - (s207 - b207)) + (p207 - b207); h18 = s207; l18 = l18 + e207; }
  let p208 = x9 * x10; { let s208 = h19 + p208; let b208 = s208 - h19; let e208 = (h19 - (s208 - b208)) + (p208 - b208); h19 = s208; l19 = l19 + e208; }
  let p209 = x9 * x11; { let s209 = h20 + p209; let b209 = s209 - h20; let e209 = (h20 - (s209 - b209)) + (p209 - b209); h20 = s209; l20 = l20 + e209; }
  let p210 = x9 * x12; { let s210 = h21 + p210; let b210 = s210 - h21; let e210 = (h21 - (s210 - b210)) + (p210 - b210); h21 = s210; l21 = l21 + e210; }
  let p211 = x9 * x13; { let s211 = h22 + p211; let b211 = s211 - h22; let e211 = (h22 - (s211 - b211)) + (p211 - b211); h22 = s211; l22 = l22 + e211; }
  let p212 = x9 * x14; { let s212 = h23 + p212; let b212 = s212 - h23; let e212 = (h23 - (s212 - b212)) + (p212 - b212); h23 = s212; l23 = l23 + e212; }
  let p213 = x9 * x15; { let s213 = h24 + p213; let b213 = s213 - h24; let e213 = (h24 - (s213 - b213)) + (p213 - b213); h24 = s213; l24 = l24 + e213; }
  let p214 = x9 * x16; { let s214 = h25 + p214; let b214 = s214 - h25; let e214 = (h25 - (s214 - b214)) + (p214 - b214); h25 = s214; l25 = l25 + e214; }
  let p215 = x9 * x17; { let s215 = h26 + p215; let b215 = s215 - h26; let e215 = (h26 - (s215 - b215)) + (p215 - b215); h26 = s215; l26 = l26 + e215; }
  let p216 = x9 * x18; { let s216 = h27 + p216; let b216 = s216 - h27; let e216 = (h27 - (s216 - b216)) + (p216 - b216); h27 = s216; l27 = l27 + e216; }
  let p217 = x9 * x19; { let s217 = h28 + p217; let b217 = s217 - h28; let e217 = (h28 - (s217 - b217)) + (p217 - b217); h28 = s217; l28 = l28 + e217; }
  let p218 = x9 * x20; { let s218 = h29 + p218; let b218 = s218 - h29; let e218 = (h29 - (s218 - b218)) + (p218 - b218); h29 = s218; l29 = l29 + e218; }
  let p219 = x9 * x21; { let s219 = h30 + p219; let b219 = s219 - h30; let e219 = (h30 - (s219 - b219)) + (p219 - b219); h30 = s219; l30 = l30 + e219; }
  let p220 = x10 * x0; { let s220 = h10 + p220; let b220 = s220 - h10; let e220 = (h10 - (s220 - b220)) + (p220 - b220); h10 = s220; l10 = l10 + e220; }
  let p221 = x10 * x1; { let s221 = h11 + p221; let b221 = s221 - h11; let e221 = (h11 - (s221 - b221)) + (p221 - b221); h11 = s221; l11 = l11 + e221; }
  let p222 = x10 * x2; { let s222 = h12 + p222; let b222 = s222 - h12; let e222 = (h12 - (s222 - b222)) + (p222 - b222); h12 = s222; l12 = l12 + e222; }
  let p223 = x10 * x3; { let s223 = h13 + p223; let b223 = s223 - h13; let e223 = (h13 - (s223 - b223)) + (p223 - b223); h13 = s223; l13 = l13 + e223; }
  let p224 = x10 * x4; { let s224 = h14 + p224; let b224 = s224 - h14; let e224 = (h14 - (s224 - b224)) + (p224 - b224); h14 = s224; l14 = l14 + e224; }
  let p225 = x10 * x5; { let s225 = h15 + p225; let b225 = s225 - h15; let e225 = (h15 - (s225 - b225)) + (p225 - b225); h15 = s225; l15 = l15 + e225; }
  let p226 = x10 * x6; { let s226 = h16 + p226; let b226 = s226 - h16; let e226 = (h16 - (s226 - b226)) + (p226 - b226); h16 = s226; l16 = l16 + e226; }
  let p227 = x10 * x7; { let s227 = h17 + p227; let b227 = s227 - h17; let e227 = (h17 - (s227 - b227)) + (p227 - b227); h17 = s227; l17 = l17 + e227; }
  let p228 = x10 * x8; { let s228 = h18 + p228; let b228 = s228 - h18; let e228 = (h18 - (s228 - b228)) + (p228 - b228); h18 = s228; l18 = l18 + e228; }
  let p229 = x10 * x9; { let s229 = h19 + p229; let b229 = s229 - h19; let e229 = (h19 - (s229 - b229)) + (p229 - b229); h19 = s229; l19 = l19 + e229; }
  let p230 = x10 * x10; { let s230 = h20 + p230; let b230 = s230 - h20; let e230 = (h20 - (s230 - b230)) + (p230 - b230); h20 = s230; l20 = l20 + e230; }
  let p231 = x10 * x11; { let s231 = h21 + p231; let b231 = s231 - h21; let e231 = (h21 - (s231 - b231)) + (p231 - b231); h21 = s231; l21 = l21 + e231; }
  let p232 = x10 * x12; { let s232 = h22 + p232; let b232 = s232 - h22; let e232 = (h22 - (s232 - b232)) + (p232 - b232); h22 = s232; l22 = l22 + e232; }
  let p233 = x10 * x13; { let s233 = h23 + p233; let b233 = s233 - h23; let e233 = (h23 - (s233 - b233)) + (p233 - b233); h23 = s233; l23 = l23 + e233; }
  let p234 = x10 * x14; { let s234 = h24 + p234; let b234 = s234 - h24; let e234 = (h24 - (s234 - b234)) + (p234 - b234); h24 = s234; l24 = l24 + e234; }
  let p235 = x10 * x15; { let s235 = h25 + p235; let b235 = s235 - h25; let e235 = (h25 - (s235 - b235)) + (p235 - b235); h25 = s235; l25 = l25 + e235; }
  let p236 = x10 * x16; { let s236 = h26 + p236; let b236 = s236 - h26; let e236 = (h26 - (s236 - b236)) + (p236 - b236); h26 = s236; l26 = l26 + e236; }
  let p237 = x10 * x17; { let s237 = h27 + p237; let b237 = s237 - h27; let e237 = (h27 - (s237 - b237)) + (p237 - b237); h27 = s237; l27 = l27 + e237; }
  let p238 = x10 * x18; { let s238 = h28 + p238; let b238 = s238 - h28; let e238 = (h28 - (s238 - b238)) + (p238 - b238); h28 = s238; l28 = l28 + e238; }
  let p239 = x10 * x19; { let s239 = h29 + p239; let b239 = s239 - h29; let e239 = (h29 - (s239 - b239)) + (p239 - b239); h29 = s239; l29 = l29 + e239; }
  let p240 = x10 * x20; { let s240 = h30 + p240; let b240 = s240 - h30; let e240 = (h30 - (s240 - b240)) + (p240 - b240); h30 = s240; l30 = l30 + e240; }
  let p241 = x10 * x21; { let s241 = h31 + p241; let b241 = s241 - h31; let e241 = (h31 - (s241 - b241)) + (p241 - b241); h31 = s241; l31 = l31 + e241; }
  let p242 = x11 * x0; { let s242 = h11 + p242; let b242 = s242 - h11; let e242 = (h11 - (s242 - b242)) + (p242 - b242); h11 = s242; l11 = l11 + e242; }
  let p243 = x11 * x1; { let s243 = h12 + p243; let b243 = s243 - h12; let e243 = (h12 - (s243 - b243)) + (p243 - b243); h12 = s243; l12 = l12 + e243; }
  let p244 = x11 * x2; { let s244 = h13 + p244; let b244 = s244 - h13; let e244 = (h13 - (s244 - b244)) + (p244 - b244); h13 = s244; l13 = l13 + e244; }
  let p245 = x11 * x3; { let s245 = h14 + p245; let b245 = s245 - h14; let e245 = (h14 - (s245 - b245)) + (p245 - b245); h14 = s245; l14 = l14 + e245; }
  let p246 = x11 * x4; { let s246 = h15 + p246; let b246 = s246 - h15; let e246 = (h15 - (s246 - b246)) + (p246 - b246); h15 = s246; l15 = l15 + e246; }
  let p247 = x11 * x5; { let s247 = h16 + p247; let b247 = s247 - h16; let e247 = (h16 - (s247 - b247)) + (p247 - b247); h16 = s247; l16 = l16 + e247; }
  let p248 = x11 * x6; { let s248 = h17 + p248; let b248 = s248 - h17; let e248 = (h17 - (s248 - b248)) + (p248 - b248); h17 = s248; l17 = l17 + e248; }
  let p249 = x11 * x7; { let s249 = h18 + p249; let b249 = s249 - h18; let e249 = (h18 - (s249 - b249)) + (p249 - b249); h18 = s249; l18 = l18 + e249; }
  let p250 = x11 * x8; { let s250 = h19 + p250; let b250 = s250 - h19; let e250 = (h19 - (s250 - b250)) + (p250 - b250); h19 = s250; l19 = l19 + e250; }
  let p251 = x11 * x9; { let s251 = h20 + p251; let b251 = s251 - h20; let e251 = (h20 - (s251 - b251)) + (p251 - b251); h20 = s251; l20 = l20 + e251; }
  let p252 = x11 * x10; { let s252 = h21 + p252; let b252 = s252 - h21; let e252 = (h21 - (s252 - b252)) + (p252 - b252); h21 = s252; l21 = l21 + e252; }
  let p253 = x11 * x11; { let s253 = h22 + p253; let b253 = s253 - h22; let e253 = (h22 - (s253 - b253)) + (p253 - b253); h22 = s253; l22 = l22 + e253; }
  let p254 = x11 * x12; { let s254 = h23 + p254; let b254 = s254 - h23; let e254 = (h23 - (s254 - b254)) + (p254 - b254); h23 = s254; l23 = l23 + e254; }
  let p255 = x11 * x13; { let s255 = h24 + p255; let b255 = s255 - h24; let e255 = (h24 - (s255 - b255)) + (p255 - b255); h24 = s255; l24 = l24 + e255; }
  let p256 = x11 * x14; { let s256 = h25 + p256; let b256 = s256 - h25; let e256 = (h25 - (s256 - b256)) + (p256 - b256); h25 = s256; l25 = l25 + e256; }
  let p257 = x11 * x15; { let s257 = h26 + p257; let b257 = s257 - h26; let e257 = (h26 - (s257 - b257)) + (p257 - b257); h26 = s257; l26 = l26 + e257; }
  let p258 = x11 * x16; { let s258 = h27 + p258; let b258 = s258 - h27; let e258 = (h27 - (s258 - b258)) + (p258 - b258); h27 = s258; l27 = l27 + e258; }
  let p259 = x11 * x17; { let s259 = h28 + p259; let b259 = s259 - h28; let e259 = (h28 - (s259 - b259)) + (p259 - b259); h28 = s259; l28 = l28 + e259; }
  let p260 = x11 * x18; { let s260 = h29 + p260; let b260 = s260 - h29; let e260 = (h29 - (s260 - b260)) + (p260 - b260); h29 = s260; l29 = l29 + e260; }
  let p261 = x11 * x19; { let s261 = h30 + p261; let b261 = s261 - h30; let e261 = (h30 - (s261 - b261)) + (p261 - b261); h30 = s261; l30 = l30 + e261; }
  let p262 = x11 * x20; { let s262 = h31 + p262; let b262 = s262 - h31; let e262 = (h31 - (s262 - b262)) + (p262 - b262); h31 = s262; l31 = l31 + e262; }
  let p263 = x11 * x21; { let s263 = h32 + p263; let b263 = s263 - h32; let e263 = (h32 - (s263 - b263)) + (p263 - b263); h32 = s263; l32 = l32 + e263; }
  let p264 = x12 * x0; { let s264 = h12 + p264; let b264 = s264 - h12; let e264 = (h12 - (s264 - b264)) + (p264 - b264); h12 = s264; l12 = l12 + e264; }
  let p265 = x12 * x1; { let s265 = h13 + p265; let b265 = s265 - h13; let e265 = (h13 - (s265 - b265)) + (p265 - b265); h13 = s265; l13 = l13 + e265; }
  let p266 = x12 * x2; { let s266 = h14 + p266; let b266 = s266 - h14; let e266 = (h14 - (s266 - b266)) + (p266 - b266); h14 = s266; l14 = l14 + e266; }
  let p267 = x12 * x3; { let s267 = h15 + p267; let b267 = s267 - h15; let e267 = (h15 - (s267 - b267)) + (p267 - b267); h15 = s267; l15 = l15 + e267; }
  let p268 = x12 * x4; { let s268 = h16 + p268; let b268 = s268 - h16; let e268 = (h16 - (s268 - b268)) + (p268 - b268); h16 = s268; l16 = l16 + e268; }
  let p269 = x12 * x5; { let s269 = h17 + p269; let b269 = s269 - h17; let e269 = (h17 - (s269 - b269)) + (p269 - b269); h17 = s269; l17 = l17 + e269; }
  let p270 = x12 * x6; { let s270 = h18 + p270; let b270 = s270 - h18; let e270 = (h18 - (s270 - b270)) + (p270 - b270); h18 = s270; l18 = l18 + e270; }
  let p271 = x12 * x7; { let s271 = h19 + p271; let b271 = s271 - h19; let e271 = (h19 - (s271 - b271)) + (p271 - b271); h19 = s271; l19 = l19 + e271; }
  let p272 = x12 * x8; { let s272 = h20 + p272; let b272 = s272 - h20; let e272 = (h20 - (s272 - b272)) + (p272 - b272); h20 = s272; l20 = l20 + e272; }
  let p273 = x12 * x9; { let s273 = h21 + p273; let b273 = s273 - h21; let e273 = (h21 - (s273 - b273)) + (p273 - b273); h21 = s273; l21 = l21 + e273; }
  let p274 = x12 * x10; { let s274 = h22 + p274; let b274 = s274 - h22; let e274 = (h22 - (s274 - b274)) + (p274 - b274); h22 = s274; l22 = l22 + e274; }
  let p275 = x12 * x11; { let s275 = h23 + p275; let b275 = s275 - h23; let e275 = (h23 - (s275 - b275)) + (p275 - b275); h23 = s275; l23 = l23 + e275; }
  let p276 = x12 * x12; { let s276 = h24 + p276; let b276 = s276 - h24; let e276 = (h24 - (s276 - b276)) + (p276 - b276); h24 = s276; l24 = l24 + e276; }
  let p277 = x12 * x13; { let s277 = h25 + p277; let b277 = s277 - h25; let e277 = (h25 - (s277 - b277)) + (p277 - b277); h25 = s277; l25 = l25 + e277; }
  let p278 = x12 * x14; { let s278 = h26 + p278; let b278 = s278 - h26; let e278 = (h26 - (s278 - b278)) + (p278 - b278); h26 = s278; l26 = l26 + e278; }
  let p279 = x12 * x15; { let s279 = h27 + p279; let b279 = s279 - h27; let e279 = (h27 - (s279 - b279)) + (p279 - b279); h27 = s279; l27 = l27 + e279; }
  let p280 = x12 * x16; { let s280 = h28 + p280; let b280 = s280 - h28; let e280 = (h28 - (s280 - b280)) + (p280 - b280); h28 = s280; l28 = l28 + e280; }
  let p281 = x12 * x17; { let s281 = h29 + p281; let b281 = s281 - h29; let e281 = (h29 - (s281 - b281)) + (p281 - b281); h29 = s281; l29 = l29 + e281; }
  let p282 = x12 * x18; { let s282 = h30 + p282; let b282 = s282 - h30; let e282 = (h30 - (s282 - b282)) + (p282 - b282); h30 = s282; l30 = l30 + e282; }
  let p283 = x12 * x19; { let s283 = h31 + p283; let b283 = s283 - h31; let e283 = (h31 - (s283 - b283)) + (p283 - b283); h31 = s283; l31 = l31 + e283; }
  let p284 = x12 * x20; { let s284 = h32 + p284; let b284 = s284 - h32; let e284 = (h32 - (s284 - b284)) + (p284 - b284); h32 = s284; l32 = l32 + e284; }
  let p285 = x12 * x21; { let s285 = h33 + p285; let b285 = s285 - h33; let e285 = (h33 - (s285 - b285)) + (p285 - b285); h33 = s285; l33 = l33 + e285; }
  let p286 = x13 * x0; { let s286 = h13 + p286; let b286 = s286 - h13; let e286 = (h13 - (s286 - b286)) + (p286 - b286); h13 = s286; l13 = l13 + e286; }
  let p287 = x13 * x1; { let s287 = h14 + p287; let b287 = s287 - h14; let e287 = (h14 - (s287 - b287)) + (p287 - b287); h14 = s287; l14 = l14 + e287; }
  let p288 = x13 * x2; { let s288 = h15 + p288; let b288 = s288 - h15; let e288 = (h15 - (s288 - b288)) + (p288 - b288); h15 = s288; l15 = l15 + e288; }
  let p289 = x13 * x3; { let s289 = h16 + p289; let b289 = s289 - h16; let e289 = (h16 - (s289 - b289)) + (p289 - b289); h16 = s289; l16 = l16 + e289; }
  let p290 = x13 * x4; { let s290 = h17 + p290; let b290 = s290 - h17; let e290 = (h17 - (s290 - b290)) + (p290 - b290); h17 = s290; l17 = l17 + e290; }
  let p291 = x13 * x5; { let s291 = h18 + p291; let b291 = s291 - h18; let e291 = (h18 - (s291 - b291)) + (p291 - b291); h18 = s291; l18 = l18 + e291; }
  let p292 = x13 * x6; { let s292 = h19 + p292; let b292 = s292 - h19; let e292 = (h19 - (s292 - b292)) + (p292 - b292); h19 = s292; l19 = l19 + e292; }
  let p293 = x13 * x7; { let s293 = h20 + p293; let b293 = s293 - h20; let e293 = (h20 - (s293 - b293)) + (p293 - b293); h20 = s293; l20 = l20 + e293; }
  let p294 = x13 * x8; { let s294 = h21 + p294; let b294 = s294 - h21; let e294 = (h21 - (s294 - b294)) + (p294 - b294); h21 = s294; l21 = l21 + e294; }
  let p295 = x13 * x9; { let s295 = h22 + p295; let b295 = s295 - h22; let e295 = (h22 - (s295 - b295)) + (p295 - b295); h22 = s295; l22 = l22 + e295; }
  let p296 = x13 * x10; { let s296 = h23 + p296; let b296 = s296 - h23; let e296 = (h23 - (s296 - b296)) + (p296 - b296); h23 = s296; l23 = l23 + e296; }
  let p297 = x13 * x11; { let s297 = h24 + p297; let b297 = s297 - h24; let e297 = (h24 - (s297 - b297)) + (p297 - b297); h24 = s297; l24 = l24 + e297; }
  let p298 = x13 * x12; { let s298 = h25 + p298; let b298 = s298 - h25; let e298 = (h25 - (s298 - b298)) + (p298 - b298); h25 = s298; l25 = l25 + e298; }
  let p299 = x13 * x13; { let s299 = h26 + p299; let b299 = s299 - h26; let e299 = (h26 - (s299 - b299)) + (p299 - b299); h26 = s299; l26 = l26 + e299; }
  let p300 = x13 * x14; { let s300 = h27 + p300; let b300 = s300 - h27; let e300 = (h27 - (s300 - b300)) + (p300 - b300); h27 = s300; l27 = l27 + e300; }
  let p301 = x13 * x15; { let s301 = h28 + p301; let b301 = s301 - h28; let e301 = (h28 - (s301 - b301)) + (p301 - b301); h28 = s301; l28 = l28 + e301; }
  let p302 = x13 * x16; { let s302 = h29 + p302; let b302 = s302 - h29; let e302 = (h29 - (s302 - b302)) + (p302 - b302); h29 = s302; l29 = l29 + e302; }
  let p303 = x13 * x17; { let s303 = h30 + p303; let b303 = s303 - h30; let e303 = (h30 - (s303 - b303)) + (p303 - b303); h30 = s303; l30 = l30 + e303; }
  let p304 = x13 * x18; { let s304 = h31 + p304; let b304 = s304 - h31; let e304 = (h31 - (s304 - b304)) + (p304 - b304); h31 = s304; l31 = l31 + e304; }
  let p305 = x13 * x19; { let s305 = h32 + p305; let b305 = s305 - h32; let e305 = (h32 - (s305 - b305)) + (p305 - b305); h32 = s305; l32 = l32 + e305; }
  let p306 = x13 * x20; { let s306 = h33 + p306; let b306 = s306 - h33; let e306 = (h33 - (s306 - b306)) + (p306 - b306); h33 = s306; l33 = l33 + e306; }
  let p307 = x13 * x21; { let s307 = h34 + p307; let b307 = s307 - h34; let e307 = (h34 - (s307 - b307)) + (p307 - b307); h34 = s307; l34 = l34 + e307; }
  let p308 = x14 * x0; { let s308 = h14 + p308; let b308 = s308 - h14; let e308 = (h14 - (s308 - b308)) + (p308 - b308); h14 = s308; l14 = l14 + e308; }
  let p309 = x14 * x1; { let s309 = h15 + p309; let b309 = s309 - h15; let e309 = (h15 - (s309 - b309)) + (p309 - b309); h15 = s309; l15 = l15 + e309; }
  let p310 = x14 * x2; { let s310 = h16 + p310; let b310 = s310 - h16; let e310 = (h16 - (s310 - b310)) + (p310 - b310); h16 = s310; l16 = l16 + e310; }
  let p311 = x14 * x3; { let s311 = h17 + p311; let b311 = s311 - h17; let e311 = (h17 - (s311 - b311)) + (p311 - b311); h17 = s311; l17 = l17 + e311; }
  let p312 = x14 * x4; { let s312 = h18 + p312; let b312 = s312 - h18; let e312 = (h18 - (s312 - b312)) + (p312 - b312); h18 = s312; l18 = l18 + e312; }
  let p313 = x14 * x5; { let s313 = h19 + p313; let b313 = s313 - h19; let e313 = (h19 - (s313 - b313)) + (p313 - b313); h19 = s313; l19 = l19 + e313; }
  let p314 = x14 * x6; { let s314 = h20 + p314; let b314 = s314 - h20; let e314 = (h20 - (s314 - b314)) + (p314 - b314); h20 = s314; l20 = l20 + e314; }
  let p315 = x14 * x7; { let s315 = h21 + p315; let b315 = s315 - h21; let e315 = (h21 - (s315 - b315)) + (p315 - b315); h21 = s315; l21 = l21 + e315; }
  let p316 = x14 * x8; { let s316 = h22 + p316; let b316 = s316 - h22; let e316 = (h22 - (s316 - b316)) + (p316 - b316); h22 = s316; l22 = l22 + e316; }
  let p317 = x14 * x9; { let s317 = h23 + p317; let b317 = s317 - h23; let e317 = (h23 - (s317 - b317)) + (p317 - b317); h23 = s317; l23 = l23 + e317; }
  let p318 = x14 * x10; { let s318 = h24 + p318; let b318 = s318 - h24; let e318 = (h24 - (s318 - b318)) + (p318 - b318); h24 = s318; l24 = l24 + e318; }
  let p319 = x14 * x11; { let s319 = h25 + p319; let b319 = s319 - h25; let e319 = (h25 - (s319 - b319)) + (p319 - b319); h25 = s319; l25 = l25 + e319; }
  let p320 = x14 * x12; { let s320 = h26 + p320; let b320 = s320 - h26; let e320 = (h26 - (s320 - b320)) + (p320 - b320); h26 = s320; l26 = l26 + e320; }
  let p321 = x14 * x13; { let s321 = h27 + p321; let b321 = s321 - h27; let e321 = (h27 - (s321 - b321)) + (p321 - b321); h27 = s321; l27 = l27 + e321; }
  let p322 = x14 * x14; { let s322 = h28 + p322; let b322 = s322 - h28; let e322 = (h28 - (s322 - b322)) + (p322 - b322); h28 = s322; l28 = l28 + e322; }
  let p323 = x14 * x15; { let s323 = h29 + p323; let b323 = s323 - h29; let e323 = (h29 - (s323 - b323)) + (p323 - b323); h29 = s323; l29 = l29 + e323; }
  let p324 = x14 * x16; { let s324 = h30 + p324; let b324 = s324 - h30; let e324 = (h30 - (s324 - b324)) + (p324 - b324); h30 = s324; l30 = l30 + e324; }
  let p325 = x14 * x17; { let s325 = h31 + p325; let b325 = s325 - h31; let e325 = (h31 - (s325 - b325)) + (p325 - b325); h31 = s325; l31 = l31 + e325; }
  let p326 = x14 * x18; { let s326 = h32 + p326; let b326 = s326 - h32; let e326 = (h32 - (s326 - b326)) + (p326 - b326); h32 = s326; l32 = l32 + e326; }
  let p327 = x14 * x19; { let s327 = h33 + p327; let b327 = s327 - h33; let e327 = (h33 - (s327 - b327)) + (p327 - b327); h33 = s327; l33 = l33 + e327; }
  let p328 = x14 * x20; { let s328 = h34 + p328; let b328 = s328 - h34; let e328 = (h34 - (s328 - b328)) + (p328 - b328); h34 = s328; l34 = l34 + e328; }
  let p329 = x14 * x21; { let s329 = h35 + p329; let b329 = s329 - h35; let e329 = (h35 - (s329 - b329)) + (p329 - b329); h35 = s329; l35 = l35 + e329; }
  let p330 = x15 * x0; { let s330 = h15 + p330; let b330 = s330 - h15; let e330 = (h15 - (s330 - b330)) + (p330 - b330); h15 = s330; l15 = l15 + e330; }
  let p331 = x15 * x1; { let s331 = h16 + p331; let b331 = s331 - h16; let e331 = (h16 - (s331 - b331)) + (p331 - b331); h16 = s331; l16 = l16 + e331; }
  let p332 = x15 * x2; { let s332 = h17 + p332; let b332 = s332 - h17; let e332 = (h17 - (s332 - b332)) + (p332 - b332); h17 = s332; l17 = l17 + e332; }
  let p333 = x15 * x3; { let s333 = h18 + p333; let b333 = s333 - h18; let e333 = (h18 - (s333 - b333)) + (p333 - b333); h18 = s333; l18 = l18 + e333; }
  let p334 = x15 * x4; { let s334 = h19 + p334; let b334 = s334 - h19; let e334 = (h19 - (s334 - b334)) + (p334 - b334); h19 = s334; l19 = l19 + e334; }
  let p335 = x15 * x5; { let s335 = h20 + p335; let b335 = s335 - h20; let e335 = (h20 - (s335 - b335)) + (p335 - b335); h20 = s335; l20 = l20 + e335; }
  let p336 = x15 * x6; { let s336 = h21 + p336; let b336 = s336 - h21; let e336 = (h21 - (s336 - b336)) + (p336 - b336); h21 = s336; l21 = l21 + e336; }
  let p337 = x15 * x7; { let s337 = h22 + p337; let b337 = s337 - h22; let e337 = (h22 - (s337 - b337)) + (p337 - b337); h22 = s337; l22 = l22 + e337; }
  let p338 = x15 * x8; { let s338 = h23 + p338; let b338 = s338 - h23; let e338 = (h23 - (s338 - b338)) + (p338 - b338); h23 = s338; l23 = l23 + e338; }
  let p339 = x15 * x9; { let s339 = h24 + p339; let b339 = s339 - h24; let e339 = (h24 - (s339 - b339)) + (p339 - b339); h24 = s339; l24 = l24 + e339; }
  let p340 = x15 * x10; { let s340 = h25 + p340; let b340 = s340 - h25; let e340 = (h25 - (s340 - b340)) + (p340 - b340); h25 = s340; l25 = l25 + e340; }
  let p341 = x15 * x11; { let s341 = h26 + p341; let b341 = s341 - h26; let e341 = (h26 - (s341 - b341)) + (p341 - b341); h26 = s341; l26 = l26 + e341; }
  let p342 = x15 * x12; { let s342 = h27 + p342; let b342 = s342 - h27; let e342 = (h27 - (s342 - b342)) + (p342 - b342); h27 = s342; l27 = l27 + e342; }
  let p343 = x15 * x13; { let s343 = h28 + p343; let b343 = s343 - h28; let e343 = (h28 - (s343 - b343)) + (p343 - b343); h28 = s343; l28 = l28 + e343; }
  let p344 = x15 * x14; { let s344 = h29 + p344; let b344 = s344 - h29; let e344 = (h29 - (s344 - b344)) + (p344 - b344); h29 = s344; l29 = l29 + e344; }
  let p345 = x15 * x15; { let s345 = h30 + p345; let b345 = s345 - h30; let e345 = (h30 - (s345 - b345)) + (p345 - b345); h30 = s345; l30 = l30 + e345; }
  let p346 = x15 * x16; { let s346 = h31 + p346; let b346 = s346 - h31; let e346 = (h31 - (s346 - b346)) + (p346 - b346); h31 = s346; l31 = l31 + e346; }
  let p347 = x15 * x17; { let s347 = h32 + p347; let b347 = s347 - h32; let e347 = (h32 - (s347 - b347)) + (p347 - b347); h32 = s347; l32 = l32 + e347; }
  let p348 = x15 * x18; { let s348 = h33 + p348; let b348 = s348 - h33; let e348 = (h33 - (s348 - b348)) + (p348 - b348); h33 = s348; l33 = l33 + e348; }
  let p349 = x15 * x19; { let s349 = h34 + p349; let b349 = s349 - h34; let e349 = (h34 - (s349 - b349)) + (p349 - b349); h34 = s349; l34 = l34 + e349; }
  let p350 = x15 * x20; { let s350 = h35 + p350; let b350 = s350 - h35; let e350 = (h35 - (s350 - b350)) + (p350 - b350); h35 = s350; l35 = l35 + e350; }
  let p351 = x15 * x21; { let s351 = h36 + p351; let b351 = s351 - h36; let e351 = (h36 - (s351 - b351)) + (p351 - b351); h36 = s351; l36 = l36 + e351; }
  let p352 = x16 * x0; { let s352 = h16 + p352; let b352 = s352 - h16; let e352 = (h16 - (s352 - b352)) + (p352 - b352); h16 = s352; l16 = l16 + e352; }
  let p353 = x16 * x1; { let s353 = h17 + p353; let b353 = s353 - h17; let e353 = (h17 - (s353 - b353)) + (p353 - b353); h17 = s353; l17 = l17 + e353; }
  let p354 = x16 * x2; { let s354 = h18 + p354; let b354 = s354 - h18; let e354 = (h18 - (s354 - b354)) + (p354 - b354); h18 = s354; l18 = l18 + e354; }
  let p355 = x16 * x3; { let s355 = h19 + p355; let b355 = s355 - h19; let e355 = (h19 - (s355 - b355)) + (p355 - b355); h19 = s355; l19 = l19 + e355; }
  let p356 = x16 * x4; { let s356 = h20 + p356; let b356 = s356 - h20; let e356 = (h20 - (s356 - b356)) + (p356 - b356); h20 = s356; l20 = l20 + e356; }
  let p357 = x16 * x5; { let s357 = h21 + p357; let b357 = s357 - h21; let e357 = (h21 - (s357 - b357)) + (p357 - b357); h21 = s357; l21 = l21 + e357; }
  let p358 = x16 * x6; { let s358 = h22 + p358; let b358 = s358 - h22; let e358 = (h22 - (s358 - b358)) + (p358 - b358); h22 = s358; l22 = l22 + e358; }
  let p359 = x16 * x7; { let s359 = h23 + p359; let b359 = s359 - h23; let e359 = (h23 - (s359 - b359)) + (p359 - b359); h23 = s359; l23 = l23 + e359; }
  let p360 = x16 * x8; { let s360 = h24 + p360; let b360 = s360 - h24; let e360 = (h24 - (s360 - b360)) + (p360 - b360); h24 = s360; l24 = l24 + e360; }
  let p361 = x16 * x9; { let s361 = h25 + p361; let b361 = s361 - h25; let e361 = (h25 - (s361 - b361)) + (p361 - b361); h25 = s361; l25 = l25 + e361; }
  let p362 = x16 * x10; { let s362 = h26 + p362; let b362 = s362 - h26; let e362 = (h26 - (s362 - b362)) + (p362 - b362); h26 = s362; l26 = l26 + e362; }
  let p363 = x16 * x11; { let s363 = h27 + p363; let b363 = s363 - h27; let e363 = (h27 - (s363 - b363)) + (p363 - b363); h27 = s363; l27 = l27 + e363; }
  let p364 = x16 * x12; { let s364 = h28 + p364; let b364 = s364 - h28; let e364 = (h28 - (s364 - b364)) + (p364 - b364); h28 = s364; l28 = l28 + e364; }
  let p365 = x16 * x13; { let s365 = h29 + p365; let b365 = s365 - h29; let e365 = (h29 - (s365 - b365)) + (p365 - b365); h29 = s365; l29 = l29 + e365; }
  let p366 = x16 * x14; { let s366 = h30 + p366; let b366 = s366 - h30; let e366 = (h30 - (s366 - b366)) + (p366 - b366); h30 = s366; l30 = l30 + e366; }
  let p367 = x16 * x15; { let s367 = h31 + p367; let b367 = s367 - h31; let e367 = (h31 - (s367 - b367)) + (p367 - b367); h31 = s367; l31 = l31 + e367; }
  let p368 = x16 * x16; { let s368 = h32 + p368; let b368 = s368 - h32; let e368 = (h32 - (s368 - b368)) + (p368 - b368); h32 = s368; l32 = l32 + e368; }
  let p369 = x16 * x17; { let s369 = h33 + p369; let b369 = s369 - h33; let e369 = (h33 - (s369 - b369)) + (p369 - b369); h33 = s369; l33 = l33 + e369; }
  let p370 = x16 * x18; { let s370 = h34 + p370; let b370 = s370 - h34; let e370 = (h34 - (s370 - b370)) + (p370 - b370); h34 = s370; l34 = l34 + e370; }
  let p371 = x16 * x19; { let s371 = h35 + p371; let b371 = s371 - h35; let e371 = (h35 - (s371 - b371)) + (p371 - b371); h35 = s371; l35 = l35 + e371; }
  let p372 = x16 * x20; { let s372 = h36 + p372; let b372 = s372 - h36; let e372 = (h36 - (s372 - b372)) + (p372 - b372); h36 = s372; l36 = l36 + e372; }
  let p373 = x16 * x21; { let s373 = h37 + p373; let b373 = s373 - h37; let e373 = (h37 - (s373 - b373)) + (p373 - b373); h37 = s373; l37 = l37 + e373; }
  let p374 = x17 * x0; { let s374 = h17 + p374; let b374 = s374 - h17; let e374 = (h17 - (s374 - b374)) + (p374 - b374); h17 = s374; l17 = l17 + e374; }
  let p375 = x17 * x1; { let s375 = h18 + p375; let b375 = s375 - h18; let e375 = (h18 - (s375 - b375)) + (p375 - b375); h18 = s375; l18 = l18 + e375; }
  let p376 = x17 * x2; { let s376 = h19 + p376; let b376 = s376 - h19; let e376 = (h19 - (s376 - b376)) + (p376 - b376); h19 = s376; l19 = l19 + e376; }
  let p377 = x17 * x3; { let s377 = h20 + p377; let b377 = s377 - h20; let e377 = (h20 - (s377 - b377)) + (p377 - b377); h20 = s377; l20 = l20 + e377; }
  let p378 = x17 * x4; { let s378 = h21 + p378; let b378 = s378 - h21; let e378 = (h21 - (s378 - b378)) + (p378 - b378); h21 = s378; l21 = l21 + e378; }
  let p379 = x17 * x5; { let s379 = h22 + p379; let b379 = s379 - h22; let e379 = (h22 - (s379 - b379)) + (p379 - b379); h22 = s379; l22 = l22 + e379; }
  let p380 = x17 * x6; { let s380 = h23 + p380; let b380 = s380 - h23; let e380 = (h23 - (s380 - b380)) + (p380 - b380); h23 = s380; l23 = l23 + e380; }
  let p381 = x17 * x7; { let s381 = h24 + p381; let b381 = s381 - h24; let e381 = (h24 - (s381 - b381)) + (p381 - b381); h24 = s381; l24 = l24 + e381; }
  let p382 = x17 * x8; { let s382 = h25 + p382; let b382 = s382 - h25; let e382 = (h25 - (s382 - b382)) + (p382 - b382); h25 = s382; l25 = l25 + e382; }
  let p383 = x17 * x9; { let s383 = h26 + p383; let b383 = s383 - h26; let e383 = (h26 - (s383 - b383)) + (p383 - b383); h26 = s383; l26 = l26 + e383; }
  let p384 = x17 * x10; { let s384 = h27 + p384; let b384 = s384 - h27; let e384 = (h27 - (s384 - b384)) + (p384 - b384); h27 = s384; l27 = l27 + e384; }
  let p385 = x17 * x11; { let s385 = h28 + p385; let b385 = s385 - h28; let e385 = (h28 - (s385 - b385)) + (p385 - b385); h28 = s385; l28 = l28 + e385; }
  let p386 = x17 * x12; { let s386 = h29 + p386; let b386 = s386 - h29; let e386 = (h29 - (s386 - b386)) + (p386 - b386); h29 = s386; l29 = l29 + e386; }
  let p387 = x17 * x13; { let s387 = h30 + p387; let b387 = s387 - h30; let e387 = (h30 - (s387 - b387)) + (p387 - b387); h30 = s387; l30 = l30 + e387; }
  let p388 = x17 * x14; { let s388 = h31 + p388; let b388 = s388 - h31; let e388 = (h31 - (s388 - b388)) + (p388 - b388); h31 = s388; l31 = l31 + e388; }
  let p389 = x17 * x15; { let s389 = h32 + p389; let b389 = s389 - h32; let e389 = (h32 - (s389 - b389)) + (p389 - b389); h32 = s389; l32 = l32 + e389; }
  let p390 = x17 * x16; { let s390 = h33 + p390; let b390 = s390 - h33; let e390 = (h33 - (s390 - b390)) + (p390 - b390); h33 = s390; l33 = l33 + e390; }
  let p391 = x17 * x17; { let s391 = h34 + p391; let b391 = s391 - h34; let e391 = (h34 - (s391 - b391)) + (p391 - b391); h34 = s391; l34 = l34 + e391; }
  let p392 = x17 * x18; { let s392 = h35 + p392; let b392 = s392 - h35; let e392 = (h35 - (s392 - b392)) + (p392 - b392); h35 = s392; l35 = l35 + e392; }
  let p393 = x17 * x19; { let s393 = h36 + p393; let b393 = s393 - h36; let e393 = (h36 - (s393 - b393)) + (p393 - b393); h36 = s393; l36 = l36 + e393; }
  let p394 = x17 * x20; { let s394 = h37 + p394; let b394 = s394 - h37; let e394 = (h37 - (s394 - b394)) + (p394 - b394); h37 = s394; l37 = l37 + e394; }
  let p395 = x17 * x21; { let s395 = h38 + p395; let b395 = s395 - h38; let e395 = (h38 - (s395 - b395)) + (p395 - b395); h38 = s395; l38 = l38 + e395; }
  let p396 = x18 * x0; { let s396 = h18 + p396; let b396 = s396 - h18; let e396 = (h18 - (s396 - b396)) + (p396 - b396); h18 = s396; l18 = l18 + e396; }
  let p397 = x18 * x1; { let s397 = h19 + p397; let b397 = s397 - h19; let e397 = (h19 - (s397 - b397)) + (p397 - b397); h19 = s397; l19 = l19 + e397; }
  let p398 = x18 * x2; { let s398 = h20 + p398; let b398 = s398 - h20; let e398 = (h20 - (s398 - b398)) + (p398 - b398); h20 = s398; l20 = l20 + e398; }
  let p399 = x18 * x3; { let s399 = h21 + p399; let b399 = s399 - h21; let e399 = (h21 - (s399 - b399)) + (p399 - b399); h21 = s399; l21 = l21 + e399; }
  let p400 = x18 * x4; { let s400 = h22 + p400; let b400 = s400 - h22; let e400 = (h22 - (s400 - b400)) + (p400 - b400); h22 = s400; l22 = l22 + e400; }
  let p401 = x18 * x5; { let s401 = h23 + p401; let b401 = s401 - h23; let e401 = (h23 - (s401 - b401)) + (p401 - b401); h23 = s401; l23 = l23 + e401; }
  let p402 = x18 * x6; { let s402 = h24 + p402; let b402 = s402 - h24; let e402 = (h24 - (s402 - b402)) + (p402 - b402); h24 = s402; l24 = l24 + e402; }
  let p403 = x18 * x7; { let s403 = h25 + p403; let b403 = s403 - h25; let e403 = (h25 - (s403 - b403)) + (p403 - b403); h25 = s403; l25 = l25 + e403; }
  let p404 = x18 * x8; { let s404 = h26 + p404; let b404 = s404 - h26; let e404 = (h26 - (s404 - b404)) + (p404 - b404); h26 = s404; l26 = l26 + e404; }
  let p405 = x18 * x9; { let s405 = h27 + p405; let b405 = s405 - h27; let e405 = (h27 - (s405 - b405)) + (p405 - b405); h27 = s405; l27 = l27 + e405; }
  let p406 = x18 * x10; { let s406 = h28 + p406; let b406 = s406 - h28; let e406 = (h28 - (s406 - b406)) + (p406 - b406); h28 = s406; l28 = l28 + e406; }
  let p407 = x18 * x11; { let s407 = h29 + p407; let b407 = s407 - h29; let e407 = (h29 - (s407 - b407)) + (p407 - b407); h29 = s407; l29 = l29 + e407; }
  let p408 = x18 * x12; { let s408 = h30 + p408; let b408 = s408 - h30; let e408 = (h30 - (s408 - b408)) + (p408 - b408); h30 = s408; l30 = l30 + e408; }
  let p409 = x18 * x13; { let s409 = h31 + p409; let b409 = s409 - h31; let e409 = (h31 - (s409 - b409)) + (p409 - b409); h31 = s409; l31 = l31 + e409; }
  let p410 = x18 * x14; { let s410 = h32 + p410; let b410 = s410 - h32; let e410 = (h32 - (s410 - b410)) + (p410 - b410); h32 = s410; l32 = l32 + e410; }
  let p411 = x18 * x15; { let s411 = h33 + p411; let b411 = s411 - h33; let e411 = (h33 - (s411 - b411)) + (p411 - b411); h33 = s411; l33 = l33 + e411; }
  let p412 = x18 * x16; { let s412 = h34 + p412; let b412 = s412 - h34; let e412 = (h34 - (s412 - b412)) + (p412 - b412); h34 = s412; l34 = l34 + e412; }
  let p413 = x18 * x17; { let s413 = h35 + p413; let b413 = s413 - h35; let e413 = (h35 - (s413 - b413)) + (p413 - b413); h35 = s413; l35 = l35 + e413; }
  let p414 = x18 * x18; { let s414 = h36 + p414; let b414 = s414 - h36; let e414 = (h36 - (s414 - b414)) + (p414 - b414); h36 = s414; l36 = l36 + e414; }
  let p415 = x18 * x19; { let s415 = h37 + p415; let b415 = s415 - h37; let e415 = (h37 - (s415 - b415)) + (p415 - b415); h37 = s415; l37 = l37 + e415; }
  let p416 = x18 * x20; { let s416 = h38 + p416; let b416 = s416 - h38; let e416 = (h38 - (s416 - b416)) + (p416 - b416); h38 = s416; l38 = l38 + e416; }
  let p417 = x18 * x21; { let s417 = h39 + p417; let b417 = s417 - h39; let e417 = (h39 - (s417 - b417)) + (p417 - b417); h39 = s417; l39 = l39 + e417; }
  let p418 = x19 * x0; { let s418 = h19 + p418; let b418 = s418 - h19; let e418 = (h19 - (s418 - b418)) + (p418 - b418); h19 = s418; l19 = l19 + e418; }
  let p419 = x19 * x1; { let s419 = h20 + p419; let b419 = s419 - h20; let e419 = (h20 - (s419 - b419)) + (p419 - b419); h20 = s419; l20 = l20 + e419; }
  let p420 = x19 * x2; { let s420 = h21 + p420; let b420 = s420 - h21; let e420 = (h21 - (s420 - b420)) + (p420 - b420); h21 = s420; l21 = l21 + e420; }
  let p421 = x19 * x3; { let s421 = h22 + p421; let b421 = s421 - h22; let e421 = (h22 - (s421 - b421)) + (p421 - b421); h22 = s421; l22 = l22 + e421; }
  let p422 = x19 * x4; { let s422 = h23 + p422; let b422 = s422 - h23; let e422 = (h23 - (s422 - b422)) + (p422 - b422); h23 = s422; l23 = l23 + e422; }
  let p423 = x19 * x5; { let s423 = h24 + p423; let b423 = s423 - h24; let e423 = (h24 - (s423 - b423)) + (p423 - b423); h24 = s423; l24 = l24 + e423; }
  let p424 = x19 * x6; { let s424 = h25 + p424; let b424 = s424 - h25; let e424 = (h25 - (s424 - b424)) + (p424 - b424); h25 = s424; l25 = l25 + e424; }
  let p425 = x19 * x7; { let s425 = h26 + p425; let b425 = s425 - h26; let e425 = (h26 - (s425 - b425)) + (p425 - b425); h26 = s425; l26 = l26 + e425; }
  let p426 = x19 * x8; { let s426 = h27 + p426; let b426 = s426 - h27; let e426 = (h27 - (s426 - b426)) + (p426 - b426); h27 = s426; l27 = l27 + e426; }
  let p427 = x19 * x9; { let s427 = h28 + p427; let b427 = s427 - h28; let e427 = (h28 - (s427 - b427)) + (p427 - b427); h28 = s427; l28 = l28 + e427; }
  let p428 = x19 * x10; { let s428 = h29 + p428; let b428 = s428 - h29; let e428 = (h29 - (s428 - b428)) + (p428 - b428); h29 = s428; l29 = l29 + e428; }
  let p429 = x19 * x11; { let s429 = h30 + p429; let b429 = s429 - h30; let e429 = (h30 - (s429 - b429)) + (p429 - b429); h30 = s429; l30 = l30 + e429; }
  let p430 = x19 * x12; { let s430 = h31 + p430; let b430 = s430 - h31; let e430 = (h31 - (s430 - b430)) + (p430 - b430); h31 = s430; l31 = l31 + e430; }
  let p431 = x19 * x13; { let s431 = h32 + p431; let b431 = s431 - h32; let e431 = (h32 - (s431 - b431)) + (p431 - b431); h32 = s431; l32 = l32 + e431; }
  let p432 = x19 * x14; { let s432 = h33 + p432; let b432 = s432 - h33; let e432 = (h33 - (s432 - b432)) + (p432 - b432); h33 = s432; l33 = l33 + e432; }
  let p433 = x19 * x15; { let s433 = h34 + p433; let b433 = s433 - h34; let e433 = (h34 - (s433 - b433)) + (p433 - b433); h34 = s433; l34 = l34 + e433; }
  let p434 = x19 * x16; { let s434 = h35 + p434; let b434 = s434 - h35; let e434 = (h35 - (s434 - b434)) + (p434 - b434); h35 = s434; l35 = l35 + e434; }
  let p435 = x19 * x17; { let s435 = h36 + p435; let b435 = s435 - h36; let e435 = (h36 - (s435 - b435)) + (p435 - b435); h36 = s435; l36 = l36 + e435; }
  let p436 = x19 * x18; { let s436 = h37 + p436; let b436 = s436 - h37; let e436 = (h37 - (s436 - b436)) + (p436 - b436); h37 = s436; l37 = l37 + e436; }
  let p437 = x19 * x19; { let s437 = h38 + p437; let b437 = s437 - h38; let e437 = (h38 - (s437 - b437)) + (p437 - b437); h38 = s437; l38 = l38 + e437; }
  let p438 = x19 * x20; { let s438 = h39 + p438; let b438 = s438 - h39; let e438 = (h39 - (s438 - b438)) + (p438 - b438); h39 = s438; l39 = l39 + e438; }
  let p439 = x19 * x21; { let s439 = h40 + p439; let b439 = s439 - h40; let e439 = (h40 - (s439 - b439)) + (p439 - b439); h40 = s439; l40 = l40 + e439; }
  let p440 = x20 * x0; { let s440 = h20 + p440; let b440 = s440 - h20; let e440 = (h20 - (s440 - b440)) + (p440 - b440); h20 = s440; l20 = l20 + e440; }
  let p441 = x20 * x1; { let s441 = h21 + p441; let b441 = s441 - h21; let e441 = (h21 - (s441 - b441)) + (p441 - b441); h21 = s441; l21 = l21 + e441; }
  let p442 = x20 * x2; { let s442 = h22 + p442; let b442 = s442 - h22; let e442 = (h22 - (s442 - b442)) + (p442 - b442); h22 = s442; l22 = l22 + e442; }
  let p443 = x20 * x3; { let s443 = h23 + p443; let b443 = s443 - h23; let e443 = (h23 - (s443 - b443)) + (p443 - b443); h23 = s443; l23 = l23 + e443; }
  let p444 = x20 * x4; { let s444 = h24 + p444; let b444 = s444 - h24; let e444 = (h24 - (s444 - b444)) + (p444 - b444); h24 = s444; l24 = l24 + e444; }
  let p445 = x20 * x5; { let s445 = h25 + p445; let b445 = s445 - h25; let e445 = (h25 - (s445 - b445)) + (p445 - b445); h25 = s445; l25 = l25 + e445; }
  let p446 = x20 * x6; { let s446 = h26 + p446; let b446 = s446 - h26; let e446 = (h26 - (s446 - b446)) + (p446 - b446); h26 = s446; l26 = l26 + e446; }
  let p447 = x20 * x7; { let s447 = h27 + p447; let b447 = s447 - h27; let e447 = (h27 - (s447 - b447)) + (p447 - b447); h27 = s447; l27 = l27 + e447; }
  let p448 = x20 * x8; { let s448 = h28 + p448; let b448 = s448 - h28; let e448 = (h28 - (s448 - b448)) + (p448 - b448); h28 = s448; l28 = l28 + e448; }
  let p449 = x20 * x9; { let s449 = h29 + p449; let b449 = s449 - h29; let e449 = (h29 - (s449 - b449)) + (p449 - b449); h29 = s449; l29 = l29 + e449; }
  let p450 = x20 * x10; { let s450 = h30 + p450; let b450 = s450 - h30; let e450 = (h30 - (s450 - b450)) + (p450 - b450); h30 = s450; l30 = l30 + e450; }
  let p451 = x20 * x11; { let s451 = h31 + p451; let b451 = s451 - h31; let e451 = (h31 - (s451 - b451)) + (p451 - b451); h31 = s451; l31 = l31 + e451; }
  let p452 = x20 * x12; { let s452 = h32 + p452; let b452 = s452 - h32; let e452 = (h32 - (s452 - b452)) + (p452 - b452); h32 = s452; l32 = l32 + e452; }
  let p453 = x20 * x13; { let s453 = h33 + p453; let b453 = s453 - h33; let e453 = (h33 - (s453 - b453)) + (p453 - b453); h33 = s453; l33 = l33 + e453; }
  let p454 = x20 * x14; { let s454 = h34 + p454; let b454 = s454 - h34; let e454 = (h34 - (s454 - b454)) + (p454 - b454); h34 = s454; l34 = l34 + e454; }
  let p455 = x20 * x15; { let s455 = h35 + p455; let b455 = s455 - h35; let e455 = (h35 - (s455 - b455)) + (p455 - b455); h35 = s455; l35 = l35 + e455; }
  let p456 = x20 * x16; { let s456 = h36 + p456; let b456 = s456 - h36; let e456 = (h36 - (s456 - b456)) + (p456 - b456); h36 = s456; l36 = l36 + e456; }
  let p457 = x20 * x17; { let s457 = h37 + p457; let b457 = s457 - h37; let e457 = (h37 - (s457 - b457)) + (p457 - b457); h37 = s457; l37 = l37 + e457; }
  let p458 = x20 * x18; { let s458 = h38 + p458; let b458 = s458 - h38; let e458 = (h38 - (s458 - b458)) + (p458 - b458); h38 = s458; l38 = l38 + e458; }
  let p459 = x20 * x19; { let s459 = h39 + p459; let b459 = s459 - h39; let e459 = (h39 - (s459 - b459)) + (p459 - b459); h39 = s459; l39 = l39 + e459; }
  let p460 = x20 * x20; { let s460 = h40 + p460; let b460 = s460 - h40; let e460 = (h40 - (s460 - b460)) + (p460 - b460); h40 = s460; l40 = l40 + e460; }
  let p461 = x20 * x21; { let s461 = h41 + p461; let b461 = s461 - h41; let e461 = (h41 - (s461 - b461)) + (p461 - b461); h41 = s461; l41 = l41 + e461; }
  let p462 = x21 * x0; { let s462 = h21 + p462; let b462 = s462 - h21; let e462 = (h21 - (s462 - b462)) + (p462 - b462); h21 = s462; l21 = l21 + e462; }
  let p463 = x21 * x1; { let s463 = h22 + p463; let b463 = s463 - h22; let e463 = (h22 - (s463 - b463)) + (p463 - b463); h22 = s463; l22 = l22 + e463; }
  let p464 = x21 * x2; { let s464 = h23 + p464; let b464 = s464 - h23; let e464 = (h23 - (s464 - b464)) + (p464 - b464); h23 = s464; l23 = l23 + e464; }
  let p465 = x21 * x3; { let s465 = h24 + p465; let b465 = s465 - h24; let e465 = (h24 - (s465 - b465)) + (p465 - b465); h24 = s465; l24 = l24 + e465; }
  let p466 = x21 * x4; { let s466 = h25 + p466; let b466 = s466 - h25; let e466 = (h25 - (s466 - b466)) + (p466 - b466); h25 = s466; l25 = l25 + e466; }
  let p467 = x21 * x5; { let s467 = h26 + p467; let b467 = s467 - h26; let e467 = (h26 - (s467 - b467)) + (p467 - b467); h26 = s467; l26 = l26 + e467; }
  let p468 = x21 * x6; { let s468 = h27 + p468; let b468 = s468 - h27; let e468 = (h27 - (s468 - b468)) + (p468 - b468); h27 = s468; l27 = l27 + e468; }
  let p469 = x21 * x7; { let s469 = h28 + p469; let b469 = s469 - h28; let e469 = (h28 - (s469 - b469)) + (p469 - b469); h28 = s469; l28 = l28 + e469; }
  let p470 = x21 * x8; { let s470 = h29 + p470; let b470 = s470 - h29; let e470 = (h29 - (s470 - b470)) + (p470 - b470); h29 = s470; l29 = l29 + e470; }
  let p471 = x21 * x9; { let s471 = h30 + p471; let b471 = s471 - h30; let e471 = (h30 - (s471 - b471)) + (p471 - b471); h30 = s471; l30 = l30 + e471; }
  let p472 = x21 * x10; { let s472 = h31 + p472; let b472 = s472 - h31; let e472 = (h31 - (s472 - b472)) + (p472 - b472); h31 = s472; l31 = l31 + e472; }
  let p473 = x21 * x11; { let s473 = h32 + p473; let b473 = s473 - h32; let e473 = (h32 - (s473 - b473)) + (p473 - b473); h32 = s473; l32 = l32 + e473; }
  let p474 = x21 * x12; { let s474 = h33 + p474; let b474 = s474 - h33; let e474 = (h33 - (s474 - b474)) + (p474 - b474); h33 = s474; l33 = l33 + e474; }
  let p475 = x21 * x13; { let s475 = h34 + p475; let b475 = s475 - h34; let e475 = (h34 - (s475 - b475)) + (p475 - b475); h34 = s475; l34 = l34 + e475; }
  let p476 = x21 * x14; { let s476 = h35 + p476; let b476 = s476 - h35; let e476 = (h35 - (s476 - b476)) + (p476 - b476); h35 = s476; l35 = l35 + e476; }
  let p477 = x21 * x15; { let s477 = h36 + p477; let b477 = s477 - h36; let e477 = (h36 - (s477 - b477)) + (p477 - b477); h36 = s477; l36 = l36 + e477; }
  let p478 = x21 * x16; { let s478 = h37 + p478; let b478 = s478 - h37; let e478 = (h37 - (s478 - b478)) + (p478 - b478); h37 = s478; l37 = l37 + e478; }
  let p479 = x21 * x17; { let s479 = h38 + p479; let b479 = s479 - h38; let e479 = (h38 - (s479 - b479)) + (p479 - b479); h38 = s479; l38 = l38 + e479; }
  let p480 = x21 * x18; { let s480 = h39 + p480; let b480 = s480 - h39; let e480 = (h39 - (s480 - b480)) + (p480 - b480); h39 = s480; l39 = l39 + e480; }
  let p481 = x21 * x19; { let s481 = h40 + p481; let b481 = s481 - h40; let e481 = (h40 - (s481 - b481)) + (p481 - b481); h40 = s481; l40 = l40 + e481; }
  let p482 = x21 * x20; { let s482 = h41 + p482; let b482 = s482 - h41; let e482 = (h41 - (s482 - b482)) + (p482 - b482); h41 = s482; l41 = l41 + e482; }
  let p483 = x21 * x21; { let s483 = h42 + p483; let b483 = s483 - h42; let e483 = (h42 - (s483 - b483)) + (p483 - b483); h42 = s483; l42 = l42 + e483; }

  // fold lo, carry-normalise base 2^12, repack low 256 bits
  var carry: f32 = 0.0;
  var o0=0u; var o1=0u; var o2=0u; var o3=0u; var o4=0u; var o5=0u; var o6=0u; var o7=0u;
  { let total = h0 + l0 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o0 = o0 | (d << 0u); }
  { let total = h1 + l1 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o0 = o0 | (d << 12u); }
  { let total = h2 + l2 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o0 = o0 | (d << 24u); o1 = o1 | (d >> 8u); }
  { let total = h3 + l3 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o1 = o1 | (d << 4u); }
  { let total = h4 + l4 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o1 = o1 | (d << 16u); }
  { let total = h5 + l5 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o1 = o1 | (d << 28u); o2 = o2 | (d >> 4u); }
  { let total = h6 + l6 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o2 = o2 | (d << 8u); }
  { let total = h7 + l7 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o2 = o2 | (d << 20u); }
  { let total = h8 + l8 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o3 = o3 | (d << 0u); }
  { let total = h9 + l9 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o3 = o3 | (d << 12u); }
  { let total = h10 + l10 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o3 = o3 | (d << 24u); o4 = o4 | (d >> 8u); }
  { let total = h11 + l11 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o4 = o4 | (d << 4u); }
  { let total = h12 + l12 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o4 = o4 | (d << 16u); }
  { let total = h13 + l13 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o4 = o4 | (d << 28u); o5 = o5 | (d >> 4u); }
  { let total = h14 + l14 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o5 = o5 | (d << 8u); }
  { let total = h15 + l15 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o5 = o5 | (d << 20u); }
  { let total = h16 + l16 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o6 = o6 | (d << 0u); }
  { let total = h17 + l17 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o6 = o6 | (d << 12u); }
  { let total = h18 + l18 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o6 = o6 | (d << 24u); o7 = o7 | (d >> 8u); }
  { let total = h19 + l19 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o7 = o7 | (d << 4u); }
  { let total = h20 + l20 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o7 = o7 | (d << 16u); }
  { let total = h21 + l21 + carry; let q = floor(total*BINV); let digit = total - q*B; carry = q; let d = u32(digit); o7 = o7 | (d << 28u); }

  outbuf[i*2u]    = vec4<u32>(o0,o1,o2,o3);
  outbuf[i*2u+1u] = vec4<u32>(o4,o5,o6,o7);
}
