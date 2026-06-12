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

struct Jac { x: array<u32, 8>, y: array<u32, 8>, z: array<u32, 8>, }

// === vmpack: complete RCB projective add (a=0, b3=9), microcoded with a
// PACKED 2x13-bit register file. The montmul is written ONCE and called
// from the 26-step loop, so the driver keeps a single multiplier body
// (fast cold compile, no Metal crash) while the body itself stays
// unrolled (named accumulator) for full speed. The formula is COMPLETE:
// the same op adds, doubles (P==Q) and absorbs the identity (0:1:0) —
// no incomplete-add hazard, no infinity selects.
const VM_N_STEPS: u32 = 26u;
const VM_MASK: u32 = 8191u;
const VM_N0:   u32 = 905u;
const VM_PL = array<u32,20>(7495u, 999u, 1462u, 280u, 5058u, 1350u, 455u, 4653u, 362u, 3260u, 5655u, 770u, 7016u, 2082u, 1761u, 5125u, 305u, 5015u, 6419u, 96u);
const VM_MONT_ONE = array<u32,20>(1204u, 6119u, 61u, 1041u, 1109u, 1236u, 2726u, 2359u, 2312u, 4684u, 82u, 798u, 472u, 5264u, 7702u, 3657u, 7095u, 4720u, 1424u, 62u);
struct VmAcc { s0:u32, s1:u32, s2:u32, s3:u32, s4:u32, s5:u32, s6:u32, s7:u32, s8:u32, s9:u32, s10:u32, s11:u32, s12:u32, s13:u32, s14:u32, s15:u32, s16:u32, s17:u32, s18:u32, }
fn vm_mont_iter(wx: u32, b: ptr<function, array<u32,20>>, a: ptr<function, VmAcc>) {
  let t  = (*a).s0 + wx * (*b)[0];
  let qi = (VM_N0 * (t & VM_MASK)) & VM_MASK;
  let c  = (t + qi * 7495u) >> 13u;
  (*a).s0 = (*a).s1 + wx * (*b)[1] + qi * 999u;
  (*a).s1 = (*a).s2 + wx * (*b)[2] + qi * 1462u;
  (*a).s2 = (*a).s3 + wx * (*b)[3] + qi * 280u;
  (*a).s3 = (*a).s4 + wx * (*b)[4] + qi * 5058u;
  (*a).s4 = (*a).s5 + wx * (*b)[5] + qi * 1350u;
  (*a).s5 = (*a).s6 + wx * (*b)[6] + qi * 455u;
  (*a).s6 = (*a).s7 + wx * (*b)[7] + qi * 4653u;
  (*a).s7 = (*a).s8 + wx * (*b)[8] + qi * 362u;
  (*a).s8 = (*a).s9 + wx * (*b)[9] + qi * 3260u;
  (*a).s9 = (*a).s10 + wx * (*b)[10] + qi * 5655u;
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
fn vm_cond_sub_p(s: array<u32,20>) -> array<u32,20> {
  var d: array<u32,20>; var bw=0u;
  for (var j=0u;j<20u;j=j+1u){ let t=s[j]+8192u-VM_PL[j]-bw; d[j]=t&VM_MASK; bw=1u-(t>>13u); }
  var r: array<u32,20>;
  for (var j=0u;j<20u;j=j+1u){ r[j]=select(d[j],s[j],bw==1u); }
  return r;
}
fn vm_montmul(xa: array<u32,20>, bv: array<u32,20>) -> array<u32,20> {
  var b = bv; var a: VmAcc;
  a.s0=0u; a.s1=0u; a.s2=0u; a.s3=0u; a.s4=0u; a.s5=0u; a.s6=0u; a.s7=0u; a.s8=0u; a.s9=0u; a.s10=0u; a.s11=0u; a.s12=0u; a.s13=0u; a.s14=0u; a.s15=0u; a.s16=0u; a.s17=0u; a.s18=0u;
  vm_mont_iter(xa[0], &b, &a);
  vm_mont_iter(xa[1], &b, &a);
  vm_mont_iter(xa[2], &b, &a);
  vm_mont_iter(xa[3], &b, &a);
  vm_mont_iter(xa[4], &b, &a);
  vm_mont_iter(xa[5], &b, &a);
  vm_mont_iter(xa[6], &b, &a);
  vm_mont_iter(xa[7], &b, &a);
  vm_mont_iter(xa[8], &b, &a);
  vm_mont_iter(xa[9], &b, &a);
  vm_mont_iter(xa[10], &b, &a);
  vm_mont_iter(xa[11], &b, &a);
  vm_mont_iter(xa[12], &b, &a);
  vm_mont_iter(xa[13], &b, &a);
  vm_mont_iter(xa[14], &b, &a);
  vm_mont_iter(xa[15], &b, &a);
  vm_mont_iter(xa[16], &b, &a);
  vm_mont_iter(xa[17], &b, &a);
  vm_mont_iter(xa[18], &b, &a);
  vm_mont_iter(xa[19], &b, &a);
  a.s1+=a.s0>>13u; a.s0&=VM_MASK;
  a.s2+=a.s1>>13u; a.s1&=VM_MASK;
  a.s3+=a.s2>>13u; a.s2&=VM_MASK;
  a.s4+=a.s3>>13u; a.s3&=VM_MASK;
  a.s5+=a.s4>>13u; a.s4&=VM_MASK;
  a.s6+=a.s5>>13u; a.s5&=VM_MASK;
  a.s7+=a.s6>>13u; a.s6&=VM_MASK;
  a.s8+=a.s7>>13u; a.s7&=VM_MASK;
  a.s9+=a.s8>>13u; a.s8&=VM_MASK;
  a.s10+=a.s9>>13u; a.s9&=VM_MASK;
  a.s11+=a.s10>>13u; a.s10&=VM_MASK;
  a.s12+=a.s11>>13u; a.s11&=VM_MASK;
  a.s13+=a.s12>>13u; a.s12&=VM_MASK;
  a.s14+=a.s13>>13u; a.s13&=VM_MASK;
  a.s15+=a.s14>>13u; a.s14&=VM_MASK;
  a.s16+=a.s15>>13u; a.s15&=VM_MASK;
  a.s17+=a.s16>>13u; a.s16&=VM_MASK;
  a.s18+=a.s17>>13u; a.s17&=VM_MASK;
  var r: array<u32,20>;
  r[0]=a.s0;
  r[1]=a.s1;
  r[2]=a.s2;
  r[3]=a.s3;
  r[4]=a.s4;
  r[5]=a.s5;
  r[6]=a.s6;
  r[7]=a.s7;
  r[8]=a.s8;
  r[9]=a.s9;
  r[10]=a.s10;
  r[11]=a.s11;
  r[12]=a.s12;
  r[13]=a.s13;
  r[14]=a.s14;
  r[15]=a.s15;
  r[16]=a.s16;
  r[17]=a.s17;
  r[18]=a.s18 & VM_MASK; r[19]=a.s18 >> 13u;
  return vm_cond_sub_p(r);
}
fn vm_fr_add(a: array<u32,20>, b: array<u32,20>) -> array<u32,20> {
  var s: array<u32,20>; var cy=0u;
  for (var j=0u;j<20u;j=j+1u){ let v=a[j]+b[j]+cy; s[j]=v&VM_MASK; cy=v>>13u; }
  return vm_cond_sub_p(s);
}
fn vm_fr_sub(a: array<u32,20>, b: array<u32,20>) -> array<u32,20> {
  var d: array<u32,20>; var bw=0u;
  for (var j=0u;j<20u;j=j+1u){ let t=a[j]+8192u-b[j]-bw; d[j]=t&VM_MASK; bw=1u-(t>>13u); }
  var r: array<u32,20>; var cy=0u;
  for (var j=0u;j<20u;j=j+1u){ let ad=select(0u,VM_PL[j],bw==1u); let v=d[j]+ad+cy; r[j]=v&VM_MASK; cy=v>>13u; }
  return r;
}
fn vm_nine(a: array<u32,20>) -> array<u32,20> { let a2=vm_fr_add(a,a); let a4=vm_fr_add(a2,a2); let a8=vm_fr_add(a4,a4); return vm_fr_add(a8,a); }
fn vm_three(a: array<u32,20>) -> array<u32,20> { return vm_fr_add(vm_fr_add(a,a),a); }
fn vm_pack(x: array<u32,20>) -> array<u32,10> { var p: array<u32,10>; for (var k=0u;k<10u;k=k+1u){ p[k]=x[2u*k] | (x[2u*k+1u]<<13u); } return p; }
fn vm_unpack(p: array<u32,10>) -> array<u32,20> { var x: array<u32,20>; for (var k=0u;k<10u;k=k+1u){ x[2u*k]=p[k]&VM_MASK; x[2u*k+1u]=p[k]>>13u; } return x; }
const VM_VOP = array<u32,26>(3u,3u,0u,0u,0u,0u,0u,1u,0u,0u,1u,0u,0u,1u,4u,1u,2u,0u,0u,2u,0u,0u,1u,0u,0u,1u);
const VM_VA  = array<u32,26>(2u,5u,0u,1u,2u,0u,1u,11u,1u,2u,12u,0u,6u,13u,8u,9u,9u,11u,12u,17u,16u,13u,18u,15u,14u,19u);
const VM_VB  = array<u32,26>(0u,0u,3u,4u,7u,4u,3u,12u,5u,4u,13u,7u,3u,14u,0u,10u,10u,16u,13u,18u,15u,14u,19u,12u,11u,20u);
const VM_VO  = array<u32,26>(6u,7u,8u,9u,10u,11u,12u,11u,12u,13u,12u,13u,14u,13u,14u,15u,16u,17u,18u,17u,18u,19u,18u,19u,20u,19u);
fn vm_padd(X1: array<u32,20>, Y1: array<u32,20>, Z1: array<u32,20>, X2: array<u32,20>, Y2: array<u32,20>, Z2: array<u32,20>) -> array<array<u32,20>, 3> {
  var v: array<array<u32,10>, 21>;
  v[0]=vm_pack(X1); v[1]=vm_pack(Y1); v[2]=vm_pack(Z1); v[3]=vm_pack(X2); v[4]=vm_pack(Y2); v[5]=vm_pack(Z2);
  for (var s=0u; s<VM_N_STEPS; s=s+1u) {
    let a = vm_unpack(v[VM_VA[s]]); let b = vm_unpack(v[VM_VB[s]]); let op = VM_VOP[s];
    var r: array<u32,20>;
    if (op==0u) { r=vm_montmul(a,b); } else if (op==1u) { r=vm_fr_add(a,b); } else if (op==2u) { r=vm_fr_sub(a,b); } else if (op==3u) { r=vm_nine(a); } else { r=vm_three(a); }
    v[VM_VO[s]] = vm_pack(r);
  }
  return array<array<u32,20>,3>(vm_unpack(v[17]), vm_unpack(v[18]), vm_unpack(v[19]));
}


// Both-affine complete add (Z1 = Z2 = 1 folded out of the RCB table):
// 10 multiplies instead of 15, same op bodies, same completeness (P == Q
// doubles; affine inputs are never the identity). Used only by the seed.
const VM_NINE_ONE = array<u32,20>(6129u, 920u, 1437u, 7968u, 1075u, 4372u, 5875u, 6160u, 2613u, 1282u, 5234u, 3328u, 1936u, 4194u, 3173u, 7295u, 4986u, 1028u, 5299u, 75u);
const VM_A_STEPS: u32 = 20u;
const VM_AOP = array<u32,20>(0u,0u,0u,0u,1u,1u,1u,3u,4u,1u,2u,0u,0u,2u,0u,0u,1u,0u,0u,1u);
const VM_AA  = array<u32,20>(0u,1u,0u,1u,6u,1u,0u,8u,4u,5u,5u,6u,7u,12u,11u,8u,13u,10u,9u,14u);
const VM_AB  = array<u32,20>(2u,3u,3u,2u,7u,3u,2u,0u,0u,16u,16u,11u,8u,13u,10u,9u,14u,7u,6u,15u);
const VM_AO  = array<u32,20>(4u,5u,6u,7u,6u,7u,8u,8u,9u,10u,11u,12u,13u,12u,13u,14u,13u,14u,15u,14u);
fn vm_aadd(X1: array<u32,20>, Y1: array<u32,20>, X2: array<u32,20>, Y2: array<u32,20>) -> array<array<u32,20>, 3> {
  var v: array<array<u32,10>, 21>;
  v[0]=vm_pack(X1); v[1]=vm_pack(Y1); v[2]=vm_pack(X2); v[3]=vm_pack(Y2); v[16]=vm_pack(VM_NINE_ONE);
  for (var s=0u; s<VM_A_STEPS; s=s+1u) {
    let a = vm_unpack(v[VM_AA[s]]); let b = vm_unpack(v[VM_AB[s]]); let op = VM_AOP[s];
    var r: array<u32,20>;
    if (op==0u) { r=vm_montmul(a,b); } else if (op==1u) { r=vm_fr_add(a,b); } else if (op==2u) { r=vm_fr_sub(a,b); } else if (op==3u) { r=vm_nine(a); } else { r=vm_three(a); }
    v[VM_AO[s]] = vm_pack(r);
  }
  return array<array<u32,20>,3>(vm_unpack(v[12]), vm_unpack(v[13]), vm_unpack(v[14]));
}

// Packed-256 <-> 20-limb bridges around the VM (the pipeline stores all
// field elements as 8xu32 Montgomery; the VM computes in 20x13 limbs).
fn pj_add(p: Jac, q: Jac) -> Jac {
    var pb: BigInt; var r: Jac;
    let res = vm_padd(
        unpack256_to_limbs(p.x).limbs, unpack256_to_limbs(p.y).limbs, unpack256_to_limbs(p.z).limbs,
        unpack256_to_limbs(q.x).limbs, unpack256_to_limbs(q.y).limbs, unpack256_to_limbs(q.z).limbs);
    pb.limbs = res[0]; r.x = pack_limbs_to_256(&pb);
    pb.limbs = res[1]; r.y = pack_limbs_to_256(&pb);
    pb.limbs = res[2]; r.z = pack_limbs_to_256(&pb);
    return r;
}

// Both-affine seed: lift both inputs with Z = 1 (VM_MONT_ONE) and run the
// same complete add — duplicate partials (P == Q) double correctly, which
// retires the old mmadd x1 != x2 assumption.
fn pj_madd2(x1: array<u32, 8>, y1: array<u32, 8>, x2: array<u32, 8>, y2: array<u32, 8>) -> Jac {
    var pb: BigInt; var r: Jac;
    let res = vm_aadd(
        unpack256_to_limbs(x1).limbs, unpack256_to_limbs(y1).limbs,
        unpack256_to_limbs(x2).limbs, unpack256_to_limbs(y2).limbs);
    pb.limbs = res[0]; r.x = pack_limbs_to_256(&pb);
    pb.limbs = res[1]; r.y = pack_limbs_to_256(&pb);
    pb.limbs = res[2]; r.z = pack_limbs_to_256(&pb);
    return r;
}

fn load_partial_jac(slot: u32) -> Jac {
    let b = jac_params.x + 6u * slot;
    let x0 = surv_scratch[b + 0u];
    let x1 = surv_scratch[b + 1u];
    let y0 = surv_scratch[b + 2u];
    let y1 = surv_scratch[b + 3u];
    let z0 = surv_scratch[b + 4u];
    let z1 = surv_scratch[b + 5u];
    return Jac(
        array<u32, 8>(x0.x, x0.y, x0.z, x0.w, x1.x, x1.y, x1.z, x1.w),
        array<u32, 8>(y0.x, y0.y, y0.z, y0.w, y1.x, y1.y, y1.z, y1.w),
        array<u32, 8>(z0.x, z0.y, z0.z, z0.w, z1.x, z1.y, z1.z, z1.w));
}

var<workgroup> wg_x: array<u32, {{ wg_words }}>;
var<workgroup> wg_y: array<u32, {{ wg_words }}>;
var<workgroup> wg_z: array<u32, {{ wg_words }}>;

fn wg_store(l: u32, p: Jac) {
    let b = l * 8u;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        wg_x[b + i] = p.x[i];
        wg_y[b + i] = p.y[i];
        wg_z[b + i] = p.z[i];
    }
}
fn wg_load(l: u32) -> Jac {
    let b = l * 8u;
    var x: array<u32, 8>;
    var y: array<u32, 8>;
    var z: array<u32, 8>;
    for (var i: u32 = 0u; i < 8u; i = i + 1u) {
        x[i] = wg_x[b + i];
        y[i] = wg_y[b + i];
        z[i] = wg_z[b + i];
    }
    return Jac(x, y, z);
}

@compute @workgroup_size({{ workgroup_size }})
fn main(@builtin(workgroup_id) wgid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
    let w = wgid.x;
    let l = lid.x;
    let mode = ufold_mode.x;
    // Plain per-thread reads, stride PRECOMPUTED by the epilogue (meta[22]):
    // both workgroupUniformLoad and the runtime shift fed Apple's Metal
    // compiler-service crash (XPC_ERROR_CONNECTION_INTERRUPTED).
    let stride = ptree_meta[22];
    let M_partials = params.w;

    // Per-role prologue: everything here is scalar bookkeeping (no
    // barriers, no multiplies). Each role produces:
    //   seg_eff  — CSR base for mmadd-pair seeding (roles 0/1)
    //   jbase    — stage-A partial base (role 2)
    //   n_eff    — residuals (0/1) or chunk partials (2) this WG folds
    //   pop      — tree population after the seed
    //   proceed  — whether this WG does real work (uniform per WG)
    //   out_slot — destination slot in the survivor scratch
    // Shallow packs 4 buckets per WG: lane/group split. Deep roles use
    // the whole WG (grp = 0). pop/proceed/out_slot are GROUP-uniform in
    // shallow mode (not WG-uniform) — every barrier below is unconditional,
    // so that is sound.
    var grp: u32 = 0u;
    var lane: u32 = l;
    if (mode == 0u) {
        grp = l >> 6u;
        lane = l & 63u;
    }
    let gbase = grp * 64u;
    var seg_eff: u32 = 0u;
    var jbase: u32 = 0u;
    var n_eff: u32 = 0u;
    var pop: u32 = 0u;
    var proceed: bool = false;
    var out_slot: u32 = 0u;
    switch mode {
        case 0u: {
            // Shallow: exact non-cap range first, then the cap tail (cap
            // buckets with few residuals are this role's via the n_eff
            // guard; deeper ones belong to the deep roles). idx = this
            // group's bucket; the dispatch is ceil(count/4) WGs, so tail
            // groups guard on the true count.
            let idx = w * 4u + grp;
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
            // Deep stage A: map this WG to a (bucket, chunk) by scanning
            // the FULL cap bin (no iteration ceiling: structured inputs
            // make cap bins of hundreds of entries, and a capped scan
            // silently orphans every chunk past the cap). Overdispatched
            // WGs exit via the total.
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
            pop = (rem + 1u) >> 1u;
            proceed = found;
            out_slot = ptree_meta[24] + w;
        }
        case 2u: {
            // Deep stage B: this bucket's stage-A base = sum of earlier
            // cap buckets' chunk counts — the FULL prefix (truncating it
            // misaddresses every later bucket's chunks).
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
            // Shallow-owned cap buckets (<= 64 residuals) have no chunks.
            proceed = n_resid > TPB64;
            out_slot = pos - ptree_meta[23];
        }
        default: {}
    }

    // Seed. Roles 0/1: mmadd-pair adjacent residuals (both inputs affine)
    // so the tree starts at half the population — ONE mmadd call site.
    // Role 2: plain Jacobian loads of the stage-A chunk partials.
    let zero = array<u32, 8>(0u, 0u, 0u, 0u, 0u, 0u, 0u, 0u);
    var acc = Jac(zero, get_r_f8(), zero); // projective identity (0 : 1 : 0)
    if (mode == 2u) {
        if (proceed && l < n_eff) {
            acc = load_partial_jac(jbase + l);
        }
    } else if (proceed && 2u * lane < n_eff) {
        let s0 = pl_at(seg_eff + (2u * lane) * stride);
        let x0 = load_partial_x(s0);
        let y0 = load_partial_y(s0, M_partials);
        if (2u * lane + 1u < n_eff) {
            let s1 = pl_at(seg_eff + (2u * lane + 1u) * stride);
            acc = pj_madd2(x0, y0, load_partial_x(s1), load_partial_y(s1, M_partials));
        } else {
            // Odd tail: straight-line affine lift (constant R is only
            // hazardous inside loops).
            acc = Jac(x0, y0, get_r_f8());
        }
    }
    wg_store(gbase + lane, acc);
    workgroupBarrier();

    // proceed and pop are uniform per workgroup (one bucket/chunk per WG);
    // the barrier stays outside the guard, so skipped workgroups pay
    // barriers only. s < pop additionally skips tree levels above the
    // population — slots there hold infinities, so the adds are exact
    // no-ops costing one complete add. ONE point-add call site (the VM).
    // Tree over each group's slots (shallow: 64-slot sub-trees, one per
    // bucket; deep roles: the whole WG, gbase = 0). s < pop skips levels
    // above the population; early high-s rounds are barrier-only for
    // shallow groups (pop <= 32).
    var s: u32 = TPB / 2u;
    loop {
        if (s == 0u) { break; }
        if (lane < s && proceed && s < pop) {
            wg_store(gbase + lane, pj_add(wg_load(gbase + lane), wg_load(gbase + lane + s)));
        }
        workgroupBarrier();
        s = s / 2u;
    }

    if (lane == 0u && proceed) {
        let total = wg_load(gbase);
        let b = jac_params.x + 6u * out_slot;
        surv_scratch[b + 0u] = vec4<u32>(total.x[0], total.x[1], total.x[2], total.x[3]);
        surv_scratch[b + 1u] = vec4<u32>(total.x[4], total.x[5], total.x[6], total.x[7]);
        surv_scratch[b + 2u] = vec4<u32>(total.y[0], total.y[1], total.y[2], total.y[3]);
        surv_scratch[b + 3u] = vec4<u32>(total.y[4], total.y[5], total.y[6], total.y[7]);
        surv_scratch[b + 4u] = vec4<u32>(total.z[0], total.z[1], total.z[2], total.z[3]);
        surv_scratch[b + 5u] = vec4<u32>(total.z[4], total.z[5], total.z[6], total.z[7]);
    }

    {{{ recompile }}}
}
