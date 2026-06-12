enable subgroups;

{{> structs }}
{{> bigint_funcs }}
{{> montgomery_product_funcs }}
{{> field_funcs }}
{{> bigint_by_funcs }}

{{{ dec_unpack }}}

{{{ dec_pack }}}

{{> field8_funcs }}

// Walker pair-tree: UNIFIED fold kernel — one pipeline serves all three
// fold roles, selected by the ufold_mode uniform (workgroup-uniform, so
// barriers stay in uniform control flow):
//   0 = shallow fold: FOUR survivor buckets per WG (<= 64 residuals
//       each, one per 64-lane quarter — keeps threads-per-bucket and
//       shared-memory-per-bucket identical to a TPB-64 kernel, so packing
//       costs no occupancy), complete-add pair seed from the CSR stream,
//       shared-memory tree, Jacobian to the survivor scratch slot.
//   1 = deep stage A: one WG per 512-residual chunk of a cap-bin bucket;
//       same seed+tree, chunk partial to the deep-partial region.
//   2 = deep stage B: one WG per cap bucket; loads its stage-A chunk
//       partials and tree-folds them to the survivor scratch slot.
// ONE kernel + ONE microcoded multiplier body (the vmpack VM) for all
// three roles — compile cost scales
// quasi-quadratically with bodies per kernel, and linearly with kernels.
//
// jac_params: .x = survivor-scratch base (vec4 units, in merge scratch);
// params.w = M_partials.

const PG: u32 = 2u;
const TPB: u32 = {{ workgroup_size }}u;
// Shallow buckets hold <= 64 residuals regardless of TPB; deeper (cap-bin)
// buckets belong to the deep modes.
const TPB64: u32 = 64u;
const CHUNK: u32 = 512u;
// Packed-window bid (SPLIT_C_PLAN.md): bid = (window << WBID_SHIFT) | mag.
const WBID_SHIFT:    u32 = 15u;
const WBID_MAG_MASK: u32 = 0x7fffu;

fn flat_bid(bid: u32, bw: u32) -> u32 {
    return (bid >> WBID_SHIFT) * bw + (bid & WBID_MAG_MASK);
}

// rw (not ro): ptree_meta and surv_scratch are sub-ranges of ONE arena
// buffer — mixed ro+rw bindings of the same buffer in one scope are
// illegal (Dawn usage-scope rule). Bound rw, only read.
@group(0) @binding(0) var<storage, read_write> ptree_meta:     array<u32>;
@group(0) @binding(1) var<storage, read>       arena_a2:       array<u32>;
// rw (read-only use): shares arena A5 with sorted_active below.
@group(0) @binding(2) var<storage, read_write> partial_offset: array<u32>;
@group(0) @binding(3) var<storage, read>       partials_buf:   array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> surv_scratch:   array<vec4<u32>>;
@group(0) @binding(5) var<uniform>             params:         vec4<u32>;
@group(0) @binding(6) var<uniform>             arena_off:      vec4<u32>;
@group(0) @binding(7) var<uniform>             jac_params:     vec4<u32>;
@group(0) @binding(8) var<uniform>             bw_geom:        vec4<u32>;
// rw (read-only use): shares arena A5 with partial_offset.
@group(0) @binding(9) var<storage, read_write> sorted_active:  array<u32>;
// .x = role (0 shallow / 1 deep-pair / 2 deep-combine). A uniform-buffer
// value, so Tint's uniformity analysis accepts barriers around code that
// branches on it.
@group(0) @binding(10) var<uniform>            ufold_mode:     vec4<u32>;

fn pc_at(i: u32) -> u32 { return arena_a2[arena_off.x + i]; }
fn pl_at(i: u32) -> u32 { return arena_a2[arena_off.y + i]; }

fn load_partial_x(slot: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * slot + 0u];
    let q1 = partials_buf[PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}

fn load_partial_y(slot: u32, M: u32) -> array<u32, 8> {
    let q0 = partials_buf[PG * M + PG * slot + 0u];
    let q1 = partials_buf[PG * M + PG * slot + 1u];
    return array<u32, 8>(q0.x, q0.y, q0.z, q0.w, q1.x, q1.y, q1.z, q1.w);
}


struct JacH { x: array<u32,5>, y: array<u32,5>, z: array<u32,5>, }

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

// Distributed tree storage: 128 pair-slots x 3 coords x 2 roles x 5 u32.
var<workgroup> wg_q: array<u32, 3840>;
var<workgroup> wg_mp_atomic: atomic<u32>;
var<workgroup> wg_mp: u32;
var<workgroup> wg_ne_atomic: atomic<u32>;
var<workgroup> wg_ne: u32;

fn wgq_store(slot: u32, role: u32, p: JacH) {
    let bx = ((slot * 3u + 0u) * 2u + role) * 5u;
    let by = ((slot * 3u + 1u) * 2u + role) * 5u;
    let bz = ((slot * 3u + 2u) * 2u + role) * 5u;
    for (var k = 0u; k < 5u; k = k + 1u) {
        wg_q[bx + k] = p.x[k];
        wg_q[by + k] = p.y[k];
        wg_q[bz + k] = p.z[k];
    }
}
fn wgq_load(slot: u32, role: u32) -> JacH {
    let bx = ((slot * 3u + 0u) * 2u + role) * 5u;
    let by = ((slot * 3u + 1u) * 2u + role) * 5u;
    let bz = ((slot * 3u + 2u) * 2u + role) * 5u;
    var x: array<u32,5>; var y: array<u32,5>; var z: array<u32,5>;
    for (var k = 0u; k < 5u; k = k + 1u) {
        x[k] = wg_q[bx + k];
        y[k] = wg_q[by + k];
        z[k] = wg_q[bz + k];
    }
    return JacH(x, y, z);
}

fn jach_id(role: u32) -> JacH {
    let zero = array<u32,5>(0u, 0u, 0u, 0u, 0u);
    return JacH(zero, pack5(vm_one_lane(role)), zero);
}

fn sel5(a: array<u32,5>, b: array<u32,5>, cond: bool) -> array<u32,5> {
    return array<u32,5>(select(a[0], b[0], cond), select(a[1], b[1], cond), select(a[2], b[2], cond),
                        select(a[3], b[3], cond), select(a[4], b[4], cond));
}

// 8xu32 packed-256 (storage form) -> this lane's strict 10-limb half.
fn half_of_256(w: array<u32, 8>, role: u32) -> array<u32,10> {
    let bi = unpack256_to_limbs(w);
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
    var bi: BigInt;
    for (var k = 0u; k < 10u; k = k + 1u) {
        bi.limbs[k] = lo10[k];
        bi.limbs[10u + k] = hi10[k];
    }
    return pack_limbs_to_256(&bi);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(subgroup_invocation_id) sgid: u32) {
    let w = wgid.x;
    let l = lid.x;
    let role = sgid & 1u;
    let r1 = role == 1u;
    let pd = l >> 1u;            // pair index in the WG, 0..127
    let mode = ufold_mode.x;
    let stride = ptree_meta[22];
    let M_partials = params.w;

    // Per-role prologue (scalar bookkeeping, pair-uniform values).
    var seg_eff: u32 = 0u;
    var jbase: u32 = 0u;
    var n_eff: u32 = 0u;
    var pop: u32 = 0u;
    var proceed: bool = false;
    var out_slot: u32 = 0u;
    var plane: u32 = pd;
    var slot_base: u32 = 0u;
    switch mode {
        case 0u: {
            // Shallow: 4 buckets per WG, 32 pairs each; one complete add
            // seeds a residual pair — same shape as the solo kernel.
            let pgrp = pd >> 5u;
            plane = pd & 31u;
            slot_base = pgrp * 32u;
            let idx = w * 4u + pgrp;
            let cap_size = (ptree_meta[23] + ptree_meta[24]) - ptree_meta[30];
            let n_shallow = ptree_meta[29] + cap_size;
            if (idx < n_shallow) {
                var pos: u32;
                if (idx < ptree_meta[29]) {
                    pos = ptree_meta[27] + idx;
                } else {
                    pos = ptree_meta[30] + (idx - ptree_meta[29]);
                }
                let bid = sorted_active[pos];
                let fb = flat_bid(bid, bw_geom.x);
                seg_eff = partial_offset[fb] & 0x7fffffffu; // v2: bit 31 flags singles
                let cnt = pc_at(fb);
                let n_resid = (cnt + stride - 1u) / stride;
                n_eff = n_resid;
                pop = (n_resid + 1u) >> 1u;
                proceed = cnt > stride && n_resid <= TPB64;
                out_slot = pos - ptree_meta[23];
            }
        }
        case 1u: {
            // Deep stage A: one WG per 512-residual chunk; a pair seeds
            // FOUR residuals (two pair-adds + one merge). FULL cap-bin
            // scan — no iteration ceiling.
            let cap_base = ptree_meta[30];
            let n_active_end = ptree_meta[23] + ptree_meta[24];
            var ww = w;
            var pos = cap_base;
            var found = false;
            var chunk: u32 = 0u;
            var n_resid: u32 = 0u;
            loop {
                if (pos >= n_active_end) { break; }
                let bid = sorted_active[pos];
                let fb = flat_bid(bid, bw_geom.x);
                let cnt = pc_at(fb);
                let nr = (cnt + stride - 1u) / stride;
                let g = (nr + CHUNK - 1u) / CHUNK;
                if (ww < g) {
                    seg_eff = (partial_offset[fb] & 0x7fffffffu) + ww * CHUNK * stride;
                    n_resid = nr;
                    chunk = ww;
                    found = true;
                    break;
                }
                ww = ww - g;
                pos = pos + 1u;
            }
            var rem: u32 = 0u;
            if (found && n_resid > chunk * CHUNK) {
                rem = min(n_resid - chunk * CHUNK, CHUNK);
            }
            n_eff = rem;
            pop = (rem + 3u) >> 2u;
            proceed = found;
            out_slot = ptree_meta[24] + w;
        }
        case 2u: {
            // Deep stage B: one WG per cap bucket; pairs load the stage-A
            // chunk partials. FULL prefix sum — no iteration ceiling.
            let cap_base = ptree_meta[30];
            let pos = cap_base + w;
            var base: u32 = 0u;
            for (var c: u32 = cap_base; c < pos; c = c + 1u) {
                let cb = sorted_active[c];
                let cnt_c = pc_at(flat_bid(cb, bw_geom.x));
                let nr_c = (cnt_c + stride - 1u) / stride;
                base = base + (nr_c + CHUNK - 1u) / CHUNK;
            }
            let bid = sorted_active[pos];
            let fb = flat_bid(bid, bw_geom.x);
            let cnt = pc_at(fb);
            let n_resid = (cnt + stride - 1u) / stride;
            let g = (n_resid + CHUNK - 1u) / CHUNK;
            jbase = ptree_meta[24] + base;
            n_eff = g;
            pop = g;
            proceed = n_resid > TPB64;
            out_slot = pos - ptree_meta[23];
        }
        default: {}
    }

    // WG-uniform bounds: tree round count + whether any bucket needs the
    // mode-1 second seed pair.
    if (l == 0u) {
        atomicStore(&wg_mp_atomic, 0u);
        atomicStore(&wg_ne_atomic, 0u);
    }
    workgroupBarrier();
    atomicMax(&wg_ne_atomic, select(0u, n_eff, proceed));
    atomicMax(&wg_mp_atomic, select(0u, pop, proceed));
    workgroupBarrier();
    if (l == 0u) {
        wg_mp = atomicLoad(&wg_mp_atomic);
        wg_ne = atomicLoad(&wg_ne_atomic);
    }
    workgroupBarrier();
    let wgne = workgroupUniformLoad(&wg_ne);

    // ===== ONE point-add call site for the whole kernel. =====
    // Mali refuses pipelines with more than one inlined copy of the
    // cooperative core (region-bisected: 1 copy compiles, 2 copies
    // VK_ERROR_INITIALIZATION_FAILED), so the seed adds, the mode-1
    // merge and every tree round all route their operands through this
    // single job loop. Skips are workgroup-uniform (workgroupUniformLoad
    // bounds), so the core's shuffles stay in provably uniform control
    // flow.
    let wgneu = workgroupUniformLoad(&wg_ne);
    let mp = workgroupUniformLoad(&wg_mp);

    var acc = jach_id(role);
    let lim = select(0u, n_eff, proceed);
    let one10 = vm_one_lane(role);
    if (mode == 2u) {
        let okl = proceed && pd < n_eff;
        let sb = jac_params.x + 6u * select(0u, jbase + pd, okl);
        let x8 = array<u32,8>(surv_scratch[sb].x, surv_scratch[sb].y, surv_scratch[sb].z, surv_scratch[sb].w,
                              surv_scratch[sb+1u].x, surv_scratch[sb+1u].y, surv_scratch[sb+1u].z, surv_scratch[sb+1u].w);
        let y8 = array<u32,8>(surv_scratch[sb+2u].x, surv_scratch[sb+2u].y, surv_scratch[sb+2u].z, surv_scratch[sb+2u].w,
                              surv_scratch[sb+3u].x, surv_scratch[sb+3u].y, surv_scratch[sb+3u].z, surv_scratch[sb+3u].w);
        let z8 = array<u32,8>(surv_scratch[sb+4u].x, surv_scratch[sb+4u].y, surv_scratch[sb+4u].z, surv_scratch[sb+4u].w,
                              surv_scratch[sb+5u].x, surv_scratch[sb+5u].y, surv_scratch[sb+5u].z, surv_scratch[sb+5u].w);
        acc.x = sel5(acc.x, pack5(half_of_256(x8, role)), okl);
        acc.y = sel5(acc.y, pack5(half_of_256(y8, role)), okl);
        acc.z = sel5(acc.z, pack5(half_of_256(z8, role)), okl);
        wgq_store(slot_base + plane, role, acc);
    }
    var tmp23 = jach_id(role);
    let cw = select(4u, 2u, mode == 0u);
    let r0 = cw * plane;
    // Jobs: 0 = seed pair (r0, r0+1) -> acc; 1 = seed pair (r0+2, r0+3)
    // -> tmp23 (mode 1 only); 2 = acc + tmp23 (mode 1 only); 3.. = tree
    // rounds s = 64 >> (job-3).
    for (var job = 0u; job < 10u; job = job + 1u) {
        if (mode == 2u && job < 3u) { continue; }
        if (mode != 1u && (job == 1u || job == 2u)) { continue; }
        if (job >= 1u && job <= 2u && wgneu <= 2u) { continue; }
        let s = 64u >> (job - 3u);
        if (job >= 3u && s >= mp) { continue; }

        var A: JacH;
        var B: JacH;
        var okA = true;
        var okB = true;
        if (job < 3u) {
            let i0 = select(r0, r0 + 2u, job == 1u);
            okA = i0 < lim;
            okB = i0 + 1u < lim;
            let sA = pl_at(select(0u, seg_eff + i0 * stride, okA));
            let sB = pl_at(select(0u, seg_eff + (i0 + 1u) * stride, okB));
            A = JacH(pack5(half_of_256(load_partial_x(sA), role)),
                     pack5(half_of_256(load_partial_y(sA, M_partials), role)),
                     pack5(one10));
            B = JacH(pack5(half_of_256(load_partial_x(sB), role)),
                     pack5(half_of_256(load_partial_y(sB, M_partials), role)),
                     pack5(one10));
            if (job == 2u) {
                A = acc;
                B = tmp23;
                okA = true;
                okB = true;
            }
        } else {
            let other = min(slot_base + plane + s, 127u);
            A = wgq_load(slot_base + plane, role);
            B = wgq_load(other, role);
        }

        let r = padd_vm(role, r1,
            unpack5(A.x), unpack5(A.y), unpack5(A.z),
            unpack5(B.x), unpack5(B.y), unpack5(B.z));
        var res = JacH(pack5(r[0]), pack5(r[1]), pack5(r[2]));
        // Seed-select: !okB -> keep A (lift/acc); !okA -> identity.
        res.x = sel5(jach_id(role).x, sel5(A.x, res.x, okB), okA);
        res.y = sel5(jach_id(role).y, sel5(A.y, res.y, okB), okA);
        res.z = sel5(jach_id(role).z, sel5(A.z, res.z, okB), okA);

        if (job == 0u) {
            acc = res;
            if (mode == 0u || wgneu <= 2u || mode == 2u) {
                wgq_store(slot_base + plane, role, res);
            }
        } else if (job == 1u) {
            tmp23 = res;
        } else if (job == 2u) {
            acc = res;
            wgq_store(slot_base + plane, role, res);
        } else {
            workgroupBarrier();
            if (plane < s) {
                wgq_store(slot_base + plane, role, res);
            }
        }
        workgroupBarrier();
    }

    {
        let total = wgq_load(slot_base, role);
        let tx = coop2_canon(unpack5(total.x), role, r1);
        let ty = coop2_canon(unpack5(total.y), role, r1);
        let tz = coop2_canon(unpack5(total.z), role, r1);
        let fx = gather_256(pack5(tx), r1);
        let fy = gather_256(pack5(ty), r1);
        let fz = gather_256(pack5(tz), r1);
        if (role == 0u && plane == 0u && proceed) {
            let b = jac_params.x + 6u * out_slot;
            surv_scratch[b + 0u] = vec4<u32>(fx[0], fx[1], fx[2], fx[3]);
            surv_scratch[b + 1u] = vec4<u32>(fx[4], fx[5], fx[6], fx[7]);
            surv_scratch[b + 2u] = vec4<u32>(fy[0], fy[1], fy[2], fy[3]);
            surv_scratch[b + 3u] = vec4<u32>(fy[4], fy[5], fy[6], fy[7]);
            surv_scratch[b + 4u] = vec4<u32>(fz[0], fz[1], fz[2], fz[3]);
            surv_scratch[b + 5u] = vec4<u32>(fz[4], fz[5], fz[6], fz[7]);
        }
    }

    {{{ recompile }}}
}
