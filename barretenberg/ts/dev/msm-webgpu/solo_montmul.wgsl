// =============================================================================
// Solo Montgomery multiply — BN254 base field, 20 x 13-bit relaxed CIOS.
// FULLY UNROLLED: the 20 outer iterations are 20 explicit calls to mont_iter
// with a constant multiplier limb, so x[i] folds to a constant index and every
// operand is register-resident (no dynamic private-memory array). One thread
// per montmul; the fair same-arithmetic baseline for coop2_montmul.wgsl.
//
// Relaxed/lazy-carry form: accumulators s0..s18 are never normalised inside the
// montmul; all carries are deferred to one normalise pass. Modulus limbs baked
// as literals. Result emitted as 20 canonical 13-bit limbs.
// =============================================================================

override CHAIN_K: u32 = 1u;

@group(0) @binding(0) var<storage, read>        inp:  array<u32>;  // per group: x[20], b[20]
@group(0) @binding(1) var<storage, read_write>  outp: array<u32>;  // per group: 20 result limbs

const MASK: u32 = 8191u;   // 2^13 - 1
const N0:   u32 = 905u;    // -p^-1 mod 2^13

// 19 relaxed accumulators (s18 holds the top, spilling into the 20th limb).
struct Acc {
  s0: u32, s1: u32, s2: u32, s3: u32, s4: u32, s5: u32, s6: u32, s7: u32, s8: u32, s9: u32,
  s10: u32, s11: u32, s12: u32, s13: u32, s14: u32, s15: u32, s16: u32, s17: u32, s18: u32,
}

// One CIOS outer step: fold the multiplier limb wx into the accumulator.
// Shift-and-accumulate in place — s_j reads s_{j+1}, which is still the old
// value as the assignments ascend.
fn mont_iter(wx: u32, b: ptr<function, array<u32,20>>, a: ptr<function, Acc>) {
  let t  = (*a).s0 + wx * (*b)[0];
  let qi = (N0 * (t & MASK)) & MASK;
  let c  = (t + qi * 7495u) >> 13u;
  (*a).s0  = (*a).s1  + wx * (*b)[1]  + qi * 999u;
  (*a).s1  = (*a).s2  + wx * (*b)[2]  + qi * 1462u;
  (*a).s2  = (*a).s3  + wx * (*b)[3]  + qi * 280u;
  (*a).s3  = (*a).s4  + wx * (*b)[4]  + qi * 5058u;
  (*a).s4  = (*a).s5  + wx * (*b)[5]  + qi * 1350u;
  (*a).s5  = (*a).s6  + wx * (*b)[6]  + qi * 455u;
  (*a).s6  = (*a).s7  + wx * (*b)[7]  + qi * 4653u;
  (*a).s7  = (*a).s8  + wx * (*b)[8]  + qi * 362u;
  (*a).s8  = (*a).s9  + wx * (*b)[9]  + qi * 3260u;
  (*a).s9  = (*a).s10 + wx * (*b)[10] + qi * 5655u;
  (*a).s10 = (*a).s11 + wx * (*b)[11] + qi * 770u;
  (*a).s11 = (*a).s12 + wx * (*b)[12] + qi * 7016u;
  (*a).s12 = (*a).s13 + wx * (*b)[13] + qi * 2082u;
  (*a).s13 = (*a).s14 + wx * (*b)[14] + qi * 1761u;
  (*a).s14 = (*a).s15 + wx * (*b)[15] + qi * 5125u;
  (*a).s15 = (*a).s16 + wx * (*b)[16] + qi * 305u;
  (*a).s16 = (*a).s17 + wx * (*b)[17] + qi * 5015u;
  (*a).s17 = (*a).s18 + wx * (*b)[18] + qi * 6419u;
  (*a).s18 =            wx * (*b)[19] + qi * 96u;
  (*a).s0  = (*a).s0 + c;
}

@compute @workgroup_size(64)
fn solo_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let grp  = gid.x;
  let base = grp * 40u;
  var x: array<u32,20>;
  var b: array<u32,20>;
  for (var j = 0u; j < 20u; j = j + 1u) { x[j] = inp[base + j]; b[j] = inp[base + 20u + j]; }
  var a: Acc;

  for (var rep = 0u; rep < CHAIN_K; rep = rep + 1u) {
    a.s0=0u; a.s1=0u; a.s2=0u; a.s3=0u; a.s4=0u; a.s5=0u; a.s6=0u; a.s7=0u; a.s8=0u; a.s9=0u;
    a.s10=0u; a.s11=0u; a.s12=0u; a.s13=0u; a.s14=0u; a.s15=0u; a.s16=0u; a.s17=0u; a.s18=0u;

    mont_iter(x[0],  &b, &a); mont_iter(x[1],  &b, &a); mont_iter(x[2],  &b, &a); mont_iter(x[3],  &b, &a);
    mont_iter(x[4],  &b, &a); mont_iter(x[5],  &b, &a); mont_iter(x[6],  &b, &a); mont_iter(x[7],  &b, &a);
    mont_iter(x[8],  &b, &a); mont_iter(x[9],  &b, &a); mont_iter(x[10], &b, &a); mont_iter(x[11], &b, &a);
    mont_iter(x[12], &b, &a); mont_iter(x[13], &b, &a); mont_iter(x[14], &b, &a); mont_iter(x[15], &b, &a);
    mont_iter(x[16], &b, &a); mont_iter(x[17], &b, &a); mont_iter(x[18], &b, &a); mont_iter(x[19], &b, &a);

    // Deferred-carry normalise (s0..s17 -> canonical; s18 keeps the top).
    a.s1=a.s1+(a.s0>>13u); a.s0&=MASK;    a.s2=a.s2+(a.s1>>13u); a.s1&=MASK;
    a.s3=a.s3+(a.s2>>13u); a.s2&=MASK;    a.s4=a.s4+(a.s3>>13u); a.s3&=MASK;
    a.s5=a.s5+(a.s4>>13u); a.s4&=MASK;    a.s6=a.s6+(a.s5>>13u); a.s5&=MASK;
    a.s7=a.s7+(a.s6>>13u); a.s6&=MASK;    a.s8=a.s8+(a.s7>>13u); a.s7&=MASK;
    a.s9=a.s9+(a.s8>>13u); a.s8&=MASK;    a.s10=a.s10+(a.s9>>13u); a.s9&=MASK;
    a.s11=a.s11+(a.s10>>13u); a.s10&=MASK; a.s12=a.s12+(a.s11>>13u); a.s11&=MASK;
    a.s13=a.s13+(a.s12>>13u); a.s12&=MASK; a.s14=a.s14+(a.s13>>13u); a.s13&=MASK;
    a.s15=a.s15+(a.s14>>13u); a.s14&=MASK; a.s16=a.s16+(a.s15>>13u); a.s15&=MASK;
    a.s17=a.s17+(a.s16>>13u); a.s16&=MASK; a.s18=a.s18+(a.s17>>13u); a.s17&=MASK;

    x[0]=a.s0; x[1]=a.s1; x[2]=a.s2; x[3]=a.s3; x[4]=a.s4; x[5]=a.s5; x[6]=a.s6; x[7]=a.s7; x[8]=a.s8; x[9]=a.s9;
    x[10]=a.s10; x[11]=a.s11; x[12]=a.s12; x[13]=a.s13; x[14]=a.s14; x[15]=a.s15; x[16]=a.s16; x[17]=a.s17;
    x[18]=a.s18 & MASK;
    x[19]=a.s18 >> 13u;
  }

  let obase = grp * 20u;
  for (var j = 0u; j < 20u; j = j + 1u) { outp[obase + j] = x[j]; }
}
