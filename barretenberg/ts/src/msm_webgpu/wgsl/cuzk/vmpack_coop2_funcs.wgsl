// vmpack coop2 machinery: the 2-lane cooperative complete RCB
// projective add (a=0, b3=9) with lazy reduction. Every field element is
// distributed 10 limbs per subgroup lane (packed 2x13-bit per u32); all
// product-class ops route through one fused sum-of-products core. This
// partial is the single textual copy.

struct VmBig {
    limbs: array<u32, 20>
}

fn vm_unpack256(w: array<u32, 8>) -> VmBig {
    var b: VmBig;
    b.limbs[0u] = (w[0u] >> 0u) & 8191u;
    b.limbs[1u] = (w[0u] >> 13u) & 8191u;
    b.limbs[2u] = ((w[0u] >> 26u) | (w[1u] << 6u)) & 8191u;
    b.limbs[3u] = (w[1u] >> 7u) & 8191u;
    b.limbs[4u] = ((w[1u] >> 20u) | (w[2u] << 12u)) & 8191u;
    b.limbs[5u] = (w[2u] >> 1u) & 8191u;
    b.limbs[6u] = (w[2u] >> 14u) & 8191u;
    b.limbs[7u] = ((w[2u] >> 27u) | (w[3u] << 5u)) & 8191u;
    b.limbs[8u] = (w[3u] >> 8u) & 8191u;
    b.limbs[9u] = ((w[3u] >> 21u) | (w[4u] << 11u)) & 8191u;
    b.limbs[10u] = (w[4u] >> 2u) & 8191u;
    b.limbs[11u] = (w[4u] >> 15u) & 8191u;
    b.limbs[12u] = ((w[4u] >> 28u) | (w[5u] << 4u)) & 8191u;
    b.limbs[13u] = (w[5u] >> 9u) & 8191u;
    b.limbs[14u] = ((w[5u] >> 22u) | (w[6u] << 10u)) & 8191u;
    b.limbs[15u] = (w[6u] >> 3u) & 8191u;
    b.limbs[16u] = (w[6u] >> 16u) & 8191u;
    b.limbs[17u] = ((w[6u] >> 29u) | (w[7u] << 3u)) & 8191u;
    b.limbs[18u] = (w[7u] >> 10u) & 8191u;
    b.limbs[19u] = (w[7u] >> 23u) & 8191u;
    return b;
}

fn vm_pack256(bp: ptr<function, VmBig>) -> array<u32, 8> {
    let b = *bp;
    var w: array<u32, 8>;
    w[0u] = (b.limbs[0u] & 8191u) | ((b.limbs[1u] & 8191u) << 13u) | ((b.limbs[2u] & 8191u) << 26u);
    w[1u] = ((b.limbs[2u] & 8191u) >> 6u) | ((b.limbs[3u] & 8191u) << 7u) | ((b.limbs[4u] & 8191u) << 20u);
    w[2u] = ((b.limbs[4u] & 8191u) >> 12u) | ((b.limbs[5u] & 8191u) << 1u) | ((b.limbs[6u] & 8191u) << 14u) | ((b.limbs[7u] & 8191u) << 27u);
    w[3u] = ((b.limbs[7u] & 8191u) >> 5u) | ((b.limbs[8u] & 8191u) << 8u) | ((b.limbs[9u] & 8191u) << 21u);
    w[4u] = ((b.limbs[9u] & 8191u) >> 11u) | ((b.limbs[10u] & 8191u) << 2u) | ((b.limbs[11u] & 8191u) << 15u) | ((b.limbs[12u] & 8191u) << 28u);
    w[5u] = ((b.limbs[12u] & 8191u) >> 4u) | ((b.limbs[13u] & 8191u) << 9u) | ((b.limbs[14u] & 8191u) << 22u);
    w[6u] = ((b.limbs[14u] & 8191u) >> 10u) | ((b.limbs[15u] & 8191u) << 3u) | ((b.limbs[16u] & 8191u) << 16u) | ((b.limbs[17u] & 8191u) << 29u);
    w[7u] = ((b.limbs[17u] & 8191u) >> 3u) | ((b.limbs[18u] & 8191u) << 10u) | ((b.limbs[19u] & 8191u) << 23u);
    return w;
}
// ===== W=2 cooperative vmpack: complete RCB projective add (a=0, b3=9) =====
// on a subgroup lane PAIR — the handoff's ec_coop2_vmpack, integrated.
// Every field element is DISTRIBUTED 10 limbs/lane (packed 2x13 -> 5
// u32/slot/lane), the microcode is 14 steps with FUSED sum-of-products
// (a*b+c*d in one reduction), and every cross-lane exchange is a
// subgroupShuffleXor(.,1) — no relative shuffles. Per thread: half the
// registers, half the multiplier work of the solo VM, one multiplier
// body for the whole kernel. Data pairs are (l, l^1); consecutive local
// invocations share a subgroup with matching parity on our targets
// (validated by the coop2 kernels on Apple + Mali).
const VM_MASK: u32 = 8191u;
const VM_N0:   u32 = 905u;
const VM_TWO_P = array<u32,20>(6798u, 1999u, 2924u, 560u, 1924u, 2701u, 910u, 1114u, 725u, 6520u,
                           3118u, 1541u, 5840u, 4165u, 3522u, 2058u, 611u, 1838u, 4647u, 193u);
const VM_MONT_ONE = array<u32,20>(1204u, 6119u, 61u, 1041u, 1109u, 1236u, 2726u, 2359u, 2312u, 4684u,
                               82u, 798u, 472u, 5264u, 7702u, 3657u, 7095u, 4720u, 1424u, 62u);
const VM_N_STEPS: u32 = 14u;
// ---------------- cooperative field add/sub (2-lane carry/borrow) ----------------
fn coop2_carry(s: ptr<function, array<u32,10>>, r1: bool) {
  var c = 0u;
  for (var m = 0u; m < 10u; m = m + 1u) { let v = (*s)[m] + c; (*s)[m] = v & VM_MASK; c = v >> 13u; }
  let cup = subgroupShuffleXor(c, 1u);
  if (r1) { var c2 = cup; for (var m = 0u; m < 10u; m = m + 1u) { let v = (*s)[m] + c2; (*s)[m] = v & VM_MASK; c2 = v >> 13u; } }
}
fn coop2_subg(x: array<u32,10>, y: array<u32,10>, r1: bool, d: ptr<function, array<u32,10>>) -> u32 {
  var bin = 0u;
  for (var m = 0u; m < 10u; m = m + 1u) { let t = x[m] + 8192u - y[m] - bin; (*d)[m] = t & VM_MASK; bin = 1u - (t >> 13u); }
  let g  = bin;
  var z = 0u; for (var m = 0u; m < 10u; m = m + 1u) { z = z | (*d)[m]; }
  let pz = select(0u, 1u, z == 0u);
  let pg  = subgroupShuffleXor(g, 1u);
  let ppz = subgroupShuffleXor(pz, 1u);
  let g0 = select(g, pg, r1);
  let g1 = select(pg, g, r1);
  let p1 = select(ppz, pz, r1);
  let realbin = select(0u, g0, r1);
  if (realbin == 1u) { var b2 = 1u; for (var m = 0u; m < 10u; m = m + 1u) { let t = (*d)[m] + 8192u - b2; (*d)[m] = t & VM_MASK; b2 = 1u - (t >> 13u); } }
  return g1 | (p1 & g0);
}
fn coop2_cond_sub2p(s: array<u32,10>, role: u32, r1: bool) -> array<u32,10> {
  var y: array<u32,10>;
  for (var m = 0u; m < 10u; m = m + 1u) { y[m] = VM_TWO_P[role * 10u + m]; }
  var d: array<u32,10>;
  let gb = coop2_subg(s, y, r1, &d);
  var r: array<u32,10>;
  for (var m = 0u; m < 10u; m = m + 1u) { r[m] = select(d[m], s[m], gb == 1u); }
  return r;
}
// LOOSE add: carry-combine only (1 cross-lane round), no cond_sub2p. Output limbs
// < 2^13, value may exceed 2p but only ever feeds a montmul (which reduces mod p),
// never an fr_sub subtrahend. This drops the 3-shuffle subg from every field add.
fn coop2_fr_add(a: array<u32,10>, b: array<u32,10>, role: u32, r1: bool) -> array<u32,10> {
  var s: array<u32,10>;
  for (var m = 0u; m < 10u; m = m + 1u) { s[m] = a[m] + b[m]; }
  coop2_carry(&s, r1);
  return s;
}
fn coop2_fr_sub(a: array<u32,10>, b: array<u32,10>, role: u32, r1: bool) -> array<u32,10> {
  var ac = a; coop2_carry(&ac, r1);
  var d: array<u32,10>;
  let gb = coop2_subg(ac, b, r1, &d);
  var r: array<u32,10>;
  for (var m = 0u; m < 10u; m = m + 1u) { r[m] = d[m] + select(0u, VM_TWO_P[role * 10u + m], gb == 1u); }
  coop2_carry(&r, r1);
  return r;
}
fn coop2_zero() -> array<u32,10> { var z: array<u32,10>; return z; }
fn coop2_neg(d: array<u32,10>, role: u32, r1: bool) -> array<u32,10> { return coop2_fr_sub(coop2_zero(), d, role, r1); }
fn coop2_mul2(a: array<u32,10>, role: u32, r1: bool) -> array<u32,10> { return coop2_fr_add(a, a, role, r1); }
fn coop2_mul3(a: array<u32,10>, role: u32, r1: bool) -> array<u32,10> { return coop2_fr_add(coop2_fr_add(a, a, role, r1), a, role, r1); }
fn coop2_mul8(a: array<u32,10>, role: u32, r1: bool) -> array<u32,10> { return coop2_mul2(coop2_mul2(coop2_mul2(a, role, r1), role, r1), role, r1); }
fn coop2_nine(a: array<u32,10>, role: u32, r1: bool) -> array<u32,10> { return coop2_fr_add(coop2_mul8(a, role, r1), a, role, r1); }

// ---------------- fused cooperative sum-of-products ----------------
struct SAcc { sl0: u32, sl1: u32, sl2: u32, sl3: u32, sl4: u32, sl5: u32, sl6: u32, sl7: u32, sl8: u32, sl9: u32, }
fn iter_sop2_yuval(i: u32, role: u32, r1: bool,
                   rl: ptr<function, array<u32,10>>, bl: ptr<function, array<u32,11>>, dl: ptr<function, array<u32,11>>,
                   xl: ptr<function, array<u32,10>>, yl: ptr<function, array<u32,10>>, a: ptr<function, SAcc>) {
  let li = select(i, i - 10u, i >= 10u);
  let owner = select(0u, 1u, i >= 10u);
  let pk = subgroupShuffleXor(vec2<u32>((*xl)[li], (*yl)[li]), 1u);
  let psl0 = subgroupShuffleXor((*a).sl0, 1u);
  let ax = select((*xl)[li], pk.x, role != owner);
  let cy = select((*yl)[li], pk.y, role != owner);
  let t  = (*a).sl0 + ax * (*bl)[0] + cy * (*dl)[0];
  let clo = select(t >> 13u, 0u, r1);
  let x0  = select(t & VM_MASK, subgroupShuffleXor(t & VM_MASK, 1u), r1);
  (*a).sl0 = (*a).sl1 + ax * (*bl)[1]  + cy * (*dl)[1]  + x0 * (*rl)[0] + clo;
  (*a).sl1 = (*a).sl2 + ax * (*bl)[2]  + cy * (*dl)[2]  + x0 * (*rl)[1];
  (*a).sl2 = (*a).sl3 + ax * (*bl)[3]  + cy * (*dl)[3]  + x0 * (*rl)[2];
  (*a).sl3 = (*a).sl4 + ax * (*bl)[4]  + cy * (*dl)[4]  + x0 * (*rl)[3];
  (*a).sl4 = (*a).sl5 + ax * (*bl)[5]  + cy * (*dl)[5]  + x0 * (*rl)[4];
  (*a).sl5 = (*a).sl6 + ax * (*bl)[6]  + cy * (*dl)[6]  + x0 * (*rl)[5];
  (*a).sl6 = (*a).sl7 + ax * (*bl)[7]  + cy * (*dl)[7]  + x0 * (*rl)[6];
  (*a).sl7 = (*a).sl8 + ax * (*bl)[8]  + cy * (*dl)[8]  + x0 * (*rl)[7];
  (*a).sl8 = (*a).sl9 + ax * (*bl)[9]  + cy * (*dl)[9]  + x0 * (*rl)[8];
  (*a).sl9 = select(psl0, 0u, r1) + ax * (*bl)[10] + cy * (*dl)[10] + x0 * (*rl)[9];
}
fn iter_sop2_cap(i: u32, role: u32, r1: bool,
                 nl: ptr<function, array<u32,11>>, bl: ptr<function, array<u32,11>>, dl: ptr<function, array<u32,11>>,
                 xl: ptr<function, array<u32,10>>, yl: ptr<function, array<u32,10>>, a: ptr<function, SAcc>) {
  let li = select(i, i - 10u, i >= 10u);
  let owner = select(0u, 1u, i >= 10u);
  let pk = subgroupShuffleXor(vec2<u32>((*xl)[li], (*yl)[li]), 1u);
  let psl0 = subgroupShuffleXor((*a).sl0, 1u);
  let ax = select((*xl)[li], pk.x, role != owner);
  let cy = select((*yl)[li], pk.y, role != owner);
  let t  = (*a).sl0 + ax * (*bl)[0] + cy * (*dl)[0];
  let qil = (VM_N0 * (t & VM_MASK)) & VM_MASK;
  let c   = select((t + qil * (*nl)[0]) >> 13u, 0u, r1);
  let qi  = select(qil, subgroupShuffleXor(qil, 1u), r1);
  (*a).sl0 = (*a).sl1 + ax * (*bl)[1]  + cy * (*dl)[1]  + qi * (*nl)[1] + c;
  (*a).sl1 = (*a).sl2 + ax * (*bl)[2]  + cy * (*dl)[2]  + qi * (*nl)[2];
  (*a).sl2 = (*a).sl3 + ax * (*bl)[3]  + cy * (*dl)[3]  + qi * (*nl)[3];
  (*a).sl3 = (*a).sl4 + ax * (*bl)[4]  + cy * (*dl)[4]  + qi * (*nl)[4];
  (*a).sl4 = (*a).sl5 + ax * (*bl)[5]  + cy * (*dl)[5]  + qi * (*nl)[5];
  (*a).sl5 = (*a).sl6 + ax * (*bl)[6]  + cy * (*dl)[6]  + qi * (*nl)[6];
  (*a).sl6 = (*a).sl7 + ax * (*bl)[7]  + cy * (*dl)[7]  + qi * (*nl)[7];
  (*a).sl7 = (*a).sl8 + ax * (*bl)[8]  + cy * (*dl)[8]  + qi * (*nl)[8];
  (*a).sl8 = (*a).sl9 + ax * (*bl)[9]  + cy * (*dl)[9]  + qi * (*nl)[9];
  (*a).sl9 = select(psl0, 0u, r1) + ax * (*bl)[10] + cy * (*dl)[10] + qi * (*nl)[10];
}
fn nl_consts(r1: bool) -> array<u32,11> {
  var nl: array<u32,11>;
  nl[0]=select(7495u,5655u,r1); nl[1]=select(999u,770u,r1); nl[2]=select(1462u,7016u,r1); nl[3]=select(280u,2082u,r1);
  nl[4]=select(5058u,1761u,r1); nl[5]=select(1350u,5125u,r1); nl[6]=select(455u,305u,r1); nl[7]=select(4653u,5015u,r1);
  nl[8]=select(362u,6419u,r1); nl[9]=select(3260u,96u,r1); nl[10]=select(5655u,0u,r1);
  return nl;
}
fn rl_consts(r1: bool) -> array<u32,10> {
  var rl: array<u32,10>;
  rl[0]=select(3803u,1154u,r1); rl[1]=select(4308u,765u,r1); rl[2]=select(7801u,825u,r1); rl[3]=select(6384u,4687u,r1);
  rl[4]=select(1700u,1647u,r1); rl[5]=select(2324u,6255u,r1); rl[6]=select(327u,240u,r1); rl[7]=select(444u,1621u,r1);
  rl[8]=select(1220u,87589u,r1); rl[9]=select(6327u,0u,r1);
  return rl;
}
fn slice11(r1: bool, mine: array<u32,10>) -> array<u32,11> {
  let nbr0 = subgroupShuffleXor(mine[0], 1u);
  var s: array<u32,11>;
  for (var m = 0u; m < 10u; m = m + 1u) { s[m] = mine[m]; }
  s[10] = select(nbr0, 0u, r1);
  return s;
}
fn coop2_sop2_core(role: u32, r1: bool, xl: array<u32,10>, bl: array<u32,11>, yl: array<u32,10>, dl: array<u32,11>) -> array<u32,10> {
  var nl = nl_consts(r1); var rl = rl_consts(r1);
  var x = xl; var y = yl; var b = bl; var d = dl;
  var a: SAcc;
  a.sl0=0u;a.sl1=0u;a.sl2=0u;a.sl3=0u;a.sl4=0u;a.sl5=0u;a.sl6=0u;a.sl7=0u;a.sl8=0u;a.sl9=0u;
  for (var i = 0u; i < 19u; i = i + 1u) { iter_sop2_yuval(i, role, r1, &rl, &b, &d, &x, &y, &a); }
  iter_sop2_cap(19u, role, r1, &nl, &b, &d, &x, &y, &a);
  var res: array<u32,10>;
  res[0]=a.sl0;res[1]=a.sl1;res[2]=a.sl2;res[3]=a.sl3;res[4]=a.sl4;res[5]=a.sl5;res[6]=a.sl6;res[7]=a.sl7;res[8]=a.sl8;res[9]=a.sl9;
  coop2_carry(&res, r1);   // combine the lane halves (1 cross-lane round); cap already reduced value
  return res;              // limbs < 2^13; cond_sub2p dropped (was redundant after the cap)
}


// ---------------- packed distributed register file + microcode dispatch ----------------
fn pack5(a: array<u32,10>) -> array<u32,5> { var p: array<u32,5>; for (var k=0u;k<5u;k=k+1u){ p[k]=a[2u*k] | (a[2u*k+1u]<<13u); } return p; }
fn unpack5(p: array<u32,5>) -> array<u32,10> { var a: array<u32,10>; for (var k=0u;k<5u;k=k+1u){ a[2u*k]=p[k]&VM_MASK; a[2u*k+1u]=p[k]>>13u; } return a; }

// complete RCB add as sop2 microcode. v0..5 = X1,Y1,Z1,X2,Y2,Z2; out X3=v17,Y3=v18,Z3=v19.
// op: 0=sop2(a,b,c,d) 1=fadd 2=fsub 3=nine 4=three 5=mul(a,b) 7=sopsub(a,b,c,d)
const VM_VOP=array<u32,14>(3u,3u,5u,5u,5u,0u,0u,0u,4u,1u,2u,7u,0u,0u);
const VM_VA =array<u32,14>(2u,5u,0u,1u,2u,0u,1u,0u,8u,9u,9u,11u,16u,15u);
const VM_VB =array<u32,14>(0u,0u,3u,4u,7u,4u,5u,7u,0u,10u,10u,16u,15u,12u);
const VM_VC =array<u32,14>(0u,0u,0u,0u,0u,1u,2u,6u,0u,0u,0u,12u,13u,14u);
const VM_VD =array<u32,14>(0u,0u,0u,0u,0u,3u,4u,3u,0u,0u,0u,13u,14u,11u);
const VM_VO =array<u32,14>(6u,7u,8u,9u,10u,11u,12u,13u,14u,15u,16u,17u,18u,19u);

// All product-class ops (sop2 / mul / sopsub) route through ONE textual
// instantiation of the cooperative core — the Mali driver inlines exactly
// one copy of the 20-iteration reduction.
fn cdispatch(op: u32, role: u32, r1: bool, a: array<u32,10>, b: array<u32,10>, c: array<u32,10>, d: array<u32,10>) -> array<u32,10> {
  if (op == 1u) { return coop2_fr_add(a, b, role, r1); }
  if (op == 2u) { return coop2_fr_sub(a, b, role, r1); }
  if (op == 3u) { return coop2_nine(a, role, r1); }
  if (op == 4u) { return coop2_mul3(a, role, r1); }
  var cc = c;
  var dd = d;
  if (op == 5u) { cc = coop2_zero(); dd = coop2_zero(); }
  if (op == 7u) { dd = coop2_neg(d, role, r1); }
  return coop2_sop2_core(role, r1, a, slice11(r1, b), cc, slice11(r1, dd));
}
fn padd_vm(role: u32, r1: bool,
           X1: array<u32,10>, Y1: array<u32,10>, Z1: array<u32,10>,
           X2: array<u32,10>, Y2: array<u32,10>, Z2: array<u32,10>) -> array<array<u32,10>, 3> {
  var v: array<array<u32,5>, 20>;
  v[0]=pack5(X1); v[1]=pack5(Y1); v[2]=pack5(Z1); v[3]=pack5(X2); v[4]=pack5(Y2); v[5]=pack5(Z2);
  for (var s = 0u; s < VM_N_STEPS; s = s + 1u) {
    let a = unpack5(v[VM_VA[s]]); let b = unpack5(v[VM_VB[s]]); let c = unpack5(v[VM_VC[s]]); let d = unpack5(v[VM_VD[s]]);
    v[VM_VO[s]] = pack5(cdispatch(VM_VOP[s], role, r1, a, b, c, d));
  }
  return array<array<u32,10>, 3>(unpack5(v[17]), unpack5(v[18]), unpack5(v[19]));
}


const VM_P = array<u32,20>(7495u, 999u, 1462u, 280u, 5058u, 1350u, 455u, 4653u, 362u, 3260u, 5655u, 770u, 7016u, 2082u, 1761u, 5125u, 305u, 5015u, 6419u, 96u);
// Canonicalize a distributed value (< 2p, strict limbs) to < p.
fn coop2_canon(s: array<u32,10>, role: u32, r1: bool) -> array<u32,10> {
  var y: array<u32,10>;
  for (var m = 0u; m < 10u; m = m + 1u) { y[m] = VM_P[role * 10u + m]; }
  var d: array<u32,10>;
  let gb = coop2_subg(s, y, r1, &d);
  var r: array<u32,10>;
  for (var m = 0u; m < 10u; m = m + 1u) { r[m] = select(d[m], s[m], gb == 1u); }
  return r;
}

fn vm_one_lane(role: u32) -> array<u32,10> {
  var r: array<u32,10>;
  for (var m = 0u; m < 10u; m = m + 1u) { r[m] = VM_MONT_ONE[role * 10u + m]; }
  return r;
}
fn sel5(a: array<u32,5>, b: array<u32,5>, cond: bool) -> array<u32,5> {
    return array<u32,5>(select(a[0], b[0], cond), select(a[1], b[1], cond), select(a[2], b[2], cond),
                        select(a[3], b[3], cond), select(a[4], b[4], cond));
}

// 8xu32 packed-256 (storage form) -> this lane's strict 10-limb half.
fn half_of_256(w: array<u32, 8>, role: u32) -> array<u32,10> {
    let bi = vm_unpack256(w);
    var h: array<u32,10>;
    for (var k = 0u; k < 10u; k = k + 1u) { h[k] = bi.limbs[role * 10u + k]; }
    return h;
}


// Gather the pair's two canonical halves into one full packed-256 value.
fn gather_256(h: array<u32,5>, r1: bool) -> array<u32, 8> {
    var other: array<u32,5>;
    for (var k = 0u; k < 5u; k = k + 1u) { other[k] = subgroupShuffleXor(h[k], 1u); }
    let lo = sel5(h, other, r1);
    let hi = sel5(other, h, r1);
    let lo10 = unpack5(lo);
    let hi10 = unpack5(hi);
    var bi: VmBig;
    for (var k = 0u; k < 10u; k = k + 1u) {
        bi.limbs[k] = lo10[k];
        bi.limbs[10u + k] = hi10[k];
    }
    return vm_pack256(&bi);
}
