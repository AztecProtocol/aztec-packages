// =============================================================================
// W=2 thread-cooperative Bernstein-Yang safegcd modular inverse — BN254 Fr,
// 20 signed 13-bit limbs. A subgroup PAIR (2 consecutive lanes) computes ONE
// inverse; role = sgid & 1, pair = gid.x >> 1.
//
// DESIGN (grounded in the literature — see the research report):
//   The divstep inner recurrence is a *fundamentally serial* bit-carry chain:
//   each step's branch selector is the parity bit the previous step produced, so
//   it cannot be split across lanes or made associative (Bernstein-Yang 2019/266;
//   libsecp256k1 safegcd doc; gECC runs each surviving inverse single-threaded).
//   The ONLY within-one-inverse parallelism is on the wide apply_matrix multiply.
//
//   divsteps' control chain (delta,f,g) IS serial and stays replicated on both
//   lanes (identical broadcast window -> identical decisions, no per-step shuffle).
//   But its matrix accumulator (u,v,q,r) splits into two independent pairs (u,q)
//   and (v,r) with identical update structure, so each lane carries one pair and
//   the two exchange once per batch -> the matrix half of divsteps parallelises
//   (~1.14x on divsteps alone). Then we run the two INDEPENDENT wide multiplies
//   concurrently:
//       lane 0 : apply_fg(M, f, g)      (no k*p)
//       lane 1 : apply_de(M, d, e)      (with the k*p low-26 cancellation)
//   Each apply is the whole-20-limb scalar routine running on a single lane with
//   ZERO subgroup shuffles inside it. The only cross-lane traffic is a 4-word
//   broadcast of the low (f,g) window per outer iteration (lane0 -> lane1, so
//   lane1 can run its replicated divsteps), plus one f-sign broadcast at the end.
//
//   Per-outer latency: solo = divsteps + apply_fg + apply_de.
//                      W=2  = divsteps + max(apply_fg, apply_de) + bcast.
//   i.e. we hide one full apply behind the other -> ~1.4-1.6x expected on M2.
//
// Fixed 29 outers (no early-out): continuing past convergence (g=0, f=+/-1) is a
// proven no-op for d (M -> diag(2^26,1), apply gives d back), so both lanes stay
// in lockstep with uniform control flow. The apply_fg/apply_de split below is a
// divergent if/else but contains NO subgroup ops, so reconvergence is clean.
//
// Emits the canonical `d` (== a^-1 mod p, BEFORE montgomery_product) from lane 1,
// 20 contiguous limbs/group, for byte-identical validation against inv_ref.mjs.
// =============================================================================

enable subgroups;

@group(0) @binding(0) var<storage, read>        inp:  array<u32>;  // per group: a[20]
@group(0) @binding(1) var<storage, read_write>  outp: array<u32>;  // per group: d[20]

const MASK: i32 = 8191;
const MASKU: u32 = 8191u;
const MASK_BATCH: u32 = (1u << 26u) - 1u;
const P_INV_LO: u32 = 58301559u;
const BATCH: u32 = 26u;
override CHAIN_K: u32 = 1u;

const P0:i32=7495; const P1:i32=999;  const P2:i32=1462; const P3:i32=280;  const P4:i32=5058;
const P5:i32=1350; const P6:i32=455;  const P7:i32=4653; const P8:i32=362;  const P9:i32=3260;
const P10:i32=5655;const P11:i32=770; const P12:i32=7016;const P13:i32=2082;const P14:i32=1761;
const P15:i32=5125;const P16:i32=305; const P17:i32=5015;const P18:i32=6419;const P19:i32=96;

struct Mat { u: i32, v: i32, q: i32, r: i32 }

fn p_limb(i: u32) -> i32 {
  switch i {
    case 0u:{return P0;} case 1u:{return P1;} case 2u:{return P2;} case 3u:{return P3;} case 4u:{return P4;}
    case 5u:{return P5;} case 6u:{return P6;} case 7u:{return P7;} case 8u:{return P8;} case 9u:{return P9;}
    case 10u:{return P10;} case 11u:{return P11;} case 12u:{return P12;} case 13u:{return P13;} case 14u:{return P14;}
    case 15u:{return P15;} case 16u:{return P16;} case 17u:{return P17;} case 18u:{return P18;} default:{return P19;}
  }
}

// Broadcast lane-0's value to BOTH lanes of the pair (lanes {2k, 2k+1}).
// shuffleXor(v,1) swaps the pair; lane 1 takes lane 0's, lane 0 keeps its own.
// Call UNCONDITIONALLY (uniform control flow) — the shuffle must not sit inside a
// role-dependent branch.
fn pair_bcast(v: u32, role: u32) -> u32 {
  let other = subgroupShuffleXor(v, 1u);
  return select(v, other, role == 1u);
}

struct MatHalf { m0: i32, m1: i32 }

// Matrix-split divsteps: BOTH lanes replicate the control chain (delta,f,g) from
// the SAME (broadcast) low window -> identical swap/addc decisions, NO per-step
// shuffle. Each lane accumulates only HALF the 2x2: the (u,q) and (v,r) pairs are
// independent recurrences with identical update structure, so role0 owns (u,q)
// and role1 owns (v,r) via a single uniform instruction stream. One exchange at
// the call site reconstructs the full M. (Measured ~1.14x vs the full-matrix
// scalar divsteps in isolation — divsteps was partly issue-bound on the matrix.)
// The window is a single u32 (bottom 32 bits): the BATCH-divstep matrix depends
// only on f,g mod 2^BATCH (BY jump lemma), so the high half was wasted work and the
// per-outer broadcast is halved (2 u32 instead of 4).
fn divsteps_split(delta: ptr<function,i32>, f_lo_in: u32, g_lo_in: u32, role: u32) -> MatHalf {
  var f_lo=f_lo_in; var g_lo=g_lo_in;
  var m0:i32=select(0,1,role==0u);   // role0: u=1 ; role1: v=0
  var m1:i32=select(1,0,role==0u);   // role0: q=0 ; role1: r=1
  var d:i32=*delta;
  for (var i:u32=0u;i<BATCH;i=i+1u){
    let g_odd:bool=bool(g_lo&1u);
    let swap:bool=g_odd&&(d>0); let addc:bool=g_odd&&(d<=0);
    let gmf:u32=g_lo-f_lo;
    let gpf:u32=g_lo+f_lo;
    let g_pre:u32=select(select(g_lo,gpf,addc),gmf,swap);
    let nf:u32=select(f_lo,g_lo,swap);
    let ng:u32=g_pre>>1u;
    let nm0:i32=select(m0<<1u,m1<<1u,swap);
    let nm1:i32=select(select(m1,m1+m0,addc),m1-m0,swap);
    let nd:i32=select(d+1,1-d,swap);
    f_lo=nf;g_lo=ng;m0=nm0;m1=nm1;d=nd;
  }
  *delta=d; return MatHalf(m0,m1);
}

fn low32(x: ptr<function,array<i32,20>>) -> u32 {
  let l0=u32((*x)[0]&MASK); let l1=u32((*x)[1]&MASK); let l2=u32((*x)[2]&MASK);
  return l0|(l1<<13u)|(l2<<26u);
}
fn is_neg(x: ptr<function,array<i32,20>>) -> bool { return (((*x)[19]>>12u)&1)==1; }

// Multiply the 20-limb signed pair (d,e) by the 2x2 matrix M and >>26, with the
// k*p low-26-bit cancellation that keeps the result an integer. Used for BOTH the
// (f,g) and (d,e) rows: for (f,g) the divstep guarantee forces k=0, so this also
// computes the plain fg-update. A single instruction stream both lanes run.
fn apply_matrix(m: Mat, d: ptr<function,array<i32,20>>, e: ptr<function,array<i32,20>>) {
  let u_lo=m.u&MASK; let u_hi=m.u>>13u; let v_lo=m.v&MASK; let v_hi=m.v>>13u;
  let q_lo=m.q&MASK; let q_hi=m.q>>13u; let r_lo=m.r&MASK; let r_hi=m.r>>13u;
  let d0=(*d)[0]; let d1=(*d)[1]; let e0=(*e)[0]; let e1=(*e)[1]; let p0=P0; let p1=P1;
  let nd0=u_lo*d0+v_lo*e0; let ne0=q_lo*d0+r_lo*e0;
  let nd1=u_lo*d1+v_lo*e1+u_hi*d0+v_hi*e0; let ne1=q_lo*d1+r_lo*e1+q_hi*d0+r_hi*e0;
  let nd0_low=u32(nd0)&MASKU; let nd1_carry=u32(nd1+(nd0>>13u))&MASKU;
  let t_d=(nd0_low|(nd1_carry<<13u))&MASK_BATCH;
  let ne0_low=u32(ne0)&MASKU; let ne1_carry=u32(ne1+(ne0>>13u))&MASKU;
  let t_e=(ne0_low|(ne1_carry<<13u))&MASK_BATCH;
  let k_d=(((~t_d+1u)&MASK_BATCH)*P_INV_LO)&MASK_BATCH;
  let k_e=(((~t_e+1u)&MASK_BATCH)*P_INV_LO)&MASK_BATCH;
  let kd_lo=i32(k_d&MASKU); let kd_hi=i32(k_d>>13u); let ke_lo=i32(k_e&MASKU); let ke_hi=i32(k_e>>13u);
  var cd:i32=(nd1+kd_lo*p1+kd_hi*p0+((nd0+kd_lo*p0)>>13u))>>13u;
  var ce:i32=(ne1+ke_lo*p1+ke_hi*p0+((ne0+ke_lo*p0)>>13u))>>13u;
  var dp:i32=d1; var ep:i32=e1;
  var od: array<i32,20>; var oe: array<i32,20>;
  for (var w=1u;w<=9u;w=w+1u){
    let di_e=(*d)[2u*w]; let ei_e=(*e)[2u*w]; let pi_e=p_limb(2u*w); let pim1_e=p_limb(2u*w-1u);
    let nd_e=u_lo*di_e+v_lo*ei_e+u_hi*dp+v_hi*ep+kd_lo*pi_e+kd_hi*pim1_e+cd;
    let ne_e=q_lo*di_e+r_lo*ei_e+q_hi*dp+r_hi*ep+ke_lo*pi_e+ke_hi*pim1_e+ce;
    cd=nd_e>>13u; ce=ne_e>>13u;
    var di_o=(*d)[2u*w+1u]; var ei_o=(*e)[2u*w+1u];
    if (w==9u){ di_o=(di_o<<19u)>>19u; ei_o=(ei_o<<19u)>>19u; }
    let pi_o=p_limb(2u*w+1u); let pim1_o=p_limb(2u*w);
    let nd_o=u_lo*di_o+v_lo*ei_o+u_hi*di_e+v_hi*ei_e+kd_lo*pi_o+kd_hi*pim1_o+cd;
    let ne_o=q_lo*di_o+r_lo*ei_o+q_hi*di_e+r_hi*ei_e+ke_lo*pi_o+ke_hi*pim1_o+ce;
    cd=nd_o>>13u; ce=ne_o>>13u;
    od[2u*(w-1u)]=nd_e&MASK; od[2u*(w-1u)+1u]=nd_o&MASK;
    oe[2u*(w-1u)]=ne_e&MASK; oe[2u*(w-1u)+1u]=ne_o&MASK;
    dp=di_o; ep=ei_o;
  }
  let p_top=P19;
  let nd_top=u_hi*dp+v_hi*ep+kd_hi*p_top+cd; let ne_top=q_hi*dp+r_hi*ep+ke_hi*p_top+ce;
  od[18]=nd_top&MASK; od[19]=nd_top>>13u; oe[18]=ne_top&MASK; oe[19]=ne_top>>13u;
  for (var i=0u;i<20u;i=i+1u){ (*d)[i]=od[i]; (*e)[i]=oe[i]; }
}

fn normalise(x: ptr<function,array<i32,20>>) {
  var c:i32=0;
  for (var i=0u;i<20u;i=i+1u){ let v=(*x)[i]+c; if(i<19u){c=v>>13u;} (*x)[i]=v&MASK; }
}
fn is_gte(x: ptr<function,array<i32,20>>) -> bool {
  for (var ii=0u;ii<20u;ii=ii+1u){ let i=19u-ii; let xi=(*x)[i]; let pi=p_limb(i);
    if(xi>pi){return true;} if(xi<pi){return false;} }
  return true;
}
fn add_p(x: ptr<function,array<i32,20>>) {
  var c:i32=0; for (var i=0u;i<20u;i=i+1u){ let v=(*x)[i]+p_limb(i)+c; if(i<19u){c=v>>13u;} (*x)[i]=v&MASK; }
}
fn sub_p(x: ptr<function,array<i32,20>>) {
  var c:i32=0; for (var i=0u;i<20u;i=i+1u){ let v=(*x)[i]-p_limb(i)+c; if(i<19u){c=v>>13u;} (*x)[i]=v&MASK; }
}
fn neg(x: ptr<function,array<i32,20>>) {
  var c:i32=0; for (var i=0u;i<20u;i=i+1u){ let v=-(*x)[i]+c; if(i<19u){c=v>>13u;} (*x)[i]=v&MASK; }
}
fn reduce_canonical(x: ptr<function,array<i32,20>>) {
  normalise(x);
  var done=false;
  for (var it=0u;it<4u;it=it+1u){
    if(done){continue;}
    if(is_neg(x)){add_p(x);} else if(is_gte(x)){sub_p(x);} else {done=true;}
  }
}

@compute @workgroup_size(64)
fn coop2_inv_main(@builtin(global_invocation_id) gid: vec3<u32>,
                  @builtin(subgroup_invocation_id) sgid: u32) {
  let role = sgid & 1u;            // 0 -> owns (f,g); 1 -> owns (d,e)
  let pair = gid.x >> 1u;
  let base = pair * 20u;

  // a,b are the lane's two working vectors. lane0: a=f, b=g. lane1: a=d, b=e.
  // The first input `g` lives on lane 0 (read from inp); lane 1 ignores inp.
  var a: array<i32,20>; var b: array<i32,20>;
  for (var i=0u;i<20u;i=i+1u){ a[i]=i32(inp[base+i]&MASKU); b[i]=0; }

  for (var rep=0u; rep<CHAIN_K; rep=rep+1u){
    // init: lane0 f=p, g=input(=current a); lane1 d=0, e=1.
    if (role == 0u) {
      for (var i=0u;i<20u;i=i+1u){ b[i]=a[i]; a[i]=p_limb(i); }   // b=g(input), a=f=p
    } else {
      for (var i=0u;i<20u;i=i+1u){ a[i]=0; b[i]=0; }
      b[0]=1;                                                      // a=d=0, b=e=1
    }

    var delta:i32=1;
    for (var outer=0u;outer<29u;outer=outer+1u){
      // lane0 has the live (f,g); broadcast its low-32 window so lane1 can run the
      // replicated divstep chain. lane1's own low32(a,b) is garbage, overwritten.
      let f_lo=pair_bcast(low32(&a),role);
      let g_lo=pair_bcast(low32(&b),role);

      // Matrix-split divsteps: each lane computes half of M, then exchange (2
      // shuffles) so both hold the full 2x2 for their apply.
      let mh=divsteps_split(&delta,f_lo,g_lo,role);
      let o0=bitcast<i32>(subgroupShuffleXor(bitcast<u32>(mh.m0),1u));
      let o1=bitcast<i32>(subgroupShuffleXor(bitcast<u32>(mh.m1),1u));
      let m_u=select(o0,mh.m0,role==0u); let m_q=select(o1,mh.m1,role==0u);
      let m_v=select(mh.m0,o0,role==0u); let m_r=select(mh.m1,o1,role==0u);
      let m=Mat(m_u,m_v,m_q,m_r);

      // The parallel pair: BOTH lanes run the SAME apply_matrix instruction stream
      // (uniform control flow -> genuine SIMT lockstep, the two applies overlap).
      // lane0's pair is (f,g): the divstep guarantee makes the low 26 bits of
      // M*(f,g) already zero, so the k*p cancellation yields k=0 and apply_matrix
      // degenerates to the plain (M*(f,g))>>26 fg-update. lane1's pair is (d,e):
      // real k. A divergent if/else here would SERIALIZE to apply_fg+apply_de (no
      // win); this uniform form is the whole point of W=2.
      apply_matrix(m,&a,&b);

      if ((outer&3u)==3u && role==1u) { reduce_canonical(&a); reduce_canonical(&b); }
    }

    // final: canonicalise d (lane1.a), negate if f<0 (f sign lives on lane0).
    let my_fneg = select(0u,1u,is_neg(&a));      // lane0: f sign; lane1: garbage
    let f_neg = pair_bcast(my_fneg,role) == 1u;
    if (role == 1u) {
      reduce_canonical(&a);
      if (f_neg) { neg(&a); reduce_canonical(&a); }
    }

    // chain: feed d back as the next inverse's input g (lane0.a). Broadcast d from
    // lane1 -> lane0. (Only matters for CHAIN_K>1 amortised timing; defeats DCE.)
    for (var i=0u;i<20u;i=i+1u){
      let di = bitcast<i32>(subgroupShuffleXor(bitcast<u32>(a[i]), 1u)); // lane0 gets lane1.a[i]
      a[i] = select(a[i], di, role==0u);
    }
  }

  // lane 1 holds the answer d; write 20 contiguous limbs.
  if (role == 1u) {
    for (var i=0u;i<20u;i=i+1u){ outp[base+i]=u32(a[i]&MASK); }
  }
}
