// =============================================================================
// Subgroup-PIPELINED Bernstein-Yang safegcd inverse — BN254 Fr, 20x13-bit limbs.
//
// Exploits the dependency graph: the critical chain is divsteps(i) -> apply_fg(i)
// -> divsteps(i+1) ...; apply_de(i) hangs off the side (consumes M_i, feeds only
// the next apply_de). So apply_de can run CONCURRENTLY with the next divsteps+
// apply_fg. Two lanes of ONE subgroup can't run different instructions at once
// (SIMT serializes divergence) — but two DIFFERENT subgroups can. So:
//   * subgroup 0 (lanes 0..31): owns (f,g); each outer runs divsteps -> M_i,
//     apply_fg, and publishes M_i to workgroup memory (double-buffered).
//   * subgroup 1 (lanes 32..63): owns (d,e); runs apply_de(M_{i-1}) one outer
//     behind, overlapping SG0's divsteps+apply_fg.
// One workgroupBarrier per outer (double-buffer => no read/write conflict).
// 32 inverses per 64-thread workgroup; inverse j = (local_index & 31).
//
// Per-outer latency ~ max(divsteps+apply_fg, apply_de) + barrier, vs the scalar
// divsteps+apply_fg+apply_de. apply_de is hidden behind the critical chain.
// Emits canonical d (== a^-1 mod p) from the DE subgroup. Validated vs inv_ref.
// =============================================================================

enable subgroups;

@group(0) @binding(0) var<storage, read>        inp:  array<u32>;
@group(0) @binding(1) var<storage, read_write>  outp: array<u32>;

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

// RING matrices handed off per workgroupBarrier (double-buffered): cuts the
// barrier count from 29/inverse to ~29/RING while keeping FG and DE overlapped
// (FG fills one buffer while DE drains the other). Cross-subgroup sync on GPU has
// no cheaper primitive than workgroupBarrier, so batching the handoff is the lever.
const RING: u32 = 2u;  // barriers measured ~free -> small RING minimises fill/drain
// instrumentation: 0=full, 1=FG-only (DE skips apply_de), 2=DE-only (FG skips
// divsteps+apply_fg, writes identity), 3=barrier+loop only. Lets us measure whether
// the two subgroups overlap (full ?= max(FG,DE)) and the workgroupBarrier cost.
override DBG: u32 = 0u;
var<workgroup> sh_m: array<array<array<vec4<i32>,32>,4>,2>;
var<workgroup> sh_fsign: array<u32,32>;
var<workgroup> sh_chain: array<array<i32,20>,32>;  // d -> next-rep g (CHAIN_K timing)

fn p_limb(i: u32) -> i32 {
  switch i {
    case 0u:{return P0;} case 1u:{return P1;} case 2u:{return P2;} case 3u:{return P3;} case 4u:{return P4;}
    case 5u:{return P5;} case 6u:{return P6;} case 7u:{return P7;} case 8u:{return P8;} case 9u:{return P9;}
    case 10u:{return P10;} case 11u:{return P11;} case 12u:{return P12;} case 13u:{return P13;} case 14u:{return P14;}
    case 15u:{return P15;} case 16u:{return P16;} case 17u:{return P17;} case 18u:{return P18;} default:{return P19;}
  }
}

fn divsteps(delta: ptr<function,i32>, f_lo_in: u32, g_lo_in: u32) -> Mat {
  var f_lo=f_lo_in; var g_lo=g_lo_in;
  var u:i32=1; var v:i32=0; var q:i32=0; var r:i32=1; var d:i32=*delta;
  for (var i:u32=0u;i<BATCH;i=i+1u){
    let g_odd:bool=bool(g_lo&1u);
    let swap:bool=g_odd&&(d>0); let addc:bool=g_odd&&(d<=0);
    let gmf:u32=g_lo-f_lo;
    let gpf:u32=g_lo+f_lo;
    let g_pre:u32=select(select(g_lo,gpf,addc),gmf,swap);
    let nf:u32=select(f_lo,g_lo,swap);
    let ng:u32=g_pre>>1u;
    let nu:i32=select(u<<1u,q<<1u,swap); let nv:i32=select(v<<1u,r<<1u,swap);
    let nq:i32=select(select(q,q+u,addc),q-u,swap); let nr:i32=select(select(r,r+v,addc),r-v,swap);
    let nd:i32=select(d+1,1-d,swap);
    f_lo=nf;g_lo=ng;u=nu;v=nv;q=nq;r=nr;d=nd;
  }
  *delta=d; return Mat(u,v,q,r);
}

fn low32(x: ptr<function,array<i32,20>>) -> u32 {
  let l0=u32((*x)[0]&MASK); let l1=u32((*x)[1]&MASK); let l2=u32((*x)[2]&MASK);
  return l0|(l1<<13u)|(l2<<26u);
}
fn is_neg(x: ptr<function,array<i32,20>>) -> bool { return (((*x)[19]>>12u)&1)==1; }

// f,g shrink ~1 limb/outer (worst case incl. 2^k: significant <=5 from outer 16),
// so late outers use the length-8 apply_fg. Halving FG's multiplies both shortens
// the FG critical path AND frees the int-mul pipe so DE's apply_de overlaps better.
fn apply_fg_20(m: Mat, f: ptr<function,array<i32,20>>, g: ptr<function,array<i32,20>>) {
  let u_lo=m.u&MASK; let u_hi=m.u>>13u; let v_lo=m.v&MASK; let v_hi=m.v>>13u;
  let q_lo=m.q&MASK; let q_hi=m.q>>13u; let r_lo=m.r&MASK; let r_hi=m.r>>13u;
  var cf:i32=0; var cg:i32=0; var fp:i32=0; var gp:i32=0;
  var nf: array<i32,20>; var ng: array<i32,20>;
  for (var i=0u;i<20u;i=i+1u){
    var fe=(*f)[i]; var ge=(*g)[i];
    if (i==19u){ fe=(fe<<19u)>>19u; ge=(ge<<19u)>>19u; }
    let nfe=u_lo*fe+v_lo*ge+u_hi*fp+v_hi*gp+cf;
    let nge=q_lo*fe+r_lo*ge+q_hi*fp+r_hi*gp+cg;
    cf=nfe>>13u; cg=nge>>13u;
    if (i>=2u){ nf[i-2u]=nfe&MASK; ng[i-2u]=nge&MASK; }
    fp=fe; gp=ge;
  }
  let nft=u_hi*fp+v_hi*gp+cf; let ngt=q_hi*fp+r_hi*gp+cg;
  nf[18]=nft&MASK; nf[19]=nft>>13u; ng[18]=ngt&MASK; ng[19]=ngt>>13u;
  for (var i=0u;i<20u;i=i+1u){ (*f)[i]=nf[i]; (*g)[i]=ng[i]; }
}
fn apply_fg_8(m: Mat, f: ptr<function,array<i32,20>>, g: ptr<function,array<i32,20>>) {
  let u_lo=m.u&MASK; let u_hi=m.u>>13u; let v_lo=m.v&MASK; let v_hi=m.v>>13u;
  let q_lo=m.q&MASK; let q_hi=m.q>>13u; let r_lo=m.r&MASK; let r_hi=m.r>>13u;
  var cf:i32=0; var cg:i32=0; var fp:i32=0; var gp:i32=0;
  var nf: array<i32,20>; var ng: array<i32,20>;
  for (var i=0u;i<8u;i=i+1u){
    var fe=(*f)[i]; var ge=(*g)[i];
    if (i==7u){ fe=(fe<<19u)>>19u; ge=(ge<<19u)>>19u; }
    let nfe=u_lo*fe+v_lo*ge+u_hi*fp+v_hi*gp+cf;
    let nge=q_lo*fe+r_lo*ge+q_hi*fp+r_hi*gp+cg;
    cf=nfe>>13u; cg=nge>>13u;
    if (i>=2u){ nf[i-2u]=nfe&MASK; ng[i-2u]=nge&MASK; }
    fp=fe; gp=ge;
  }
  let nft=u_hi*fp+v_hi*gp+cf; let ngt=q_hi*fp+r_hi*gp+cg;
  nf[6]=nft&MASK; nf[7]=nft>>13u; ng[6]=ngt&MASK; ng[7]=ngt>>13u;
  for (var i=0u;i<8u;i=i+1u){ (*f)[i]=nf[i]; (*g)[i]=ng[i]; }
}

fn apply_de(m: Mat, d: ptr<function,array<i32,20>>, e: ptr<function,array<i32,20>>) {
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
fn coop2sg_inv_main(@builtin(local_invocation_index) lid: u32,
                    @builtin(workgroup_id) wid: vec3<u32>) {
  let isDE = lid >= 32u;
  let j = lid & 31u;
  let inv = wid.x * 32u + j;
  let base = inv * 20u;

  var f: array<i32,20>; var g: array<i32,20>;   // SG0 (FG) state
  var d: array<i32,20>; var e: array<i32,20>;   // SG1 (DE) state
  // FG holds the running input g (from inp, then chained from prior d); DE ignores.
  if (!isDE) { for (var i=0u;i<20u;i=i+1u){ g[i]=i32(inp[base+i]&MASKU); } }

  for (var rep=0u; rep<CHAIN_K; rep=rep+1u){
    if (!isDE) { for (var i=0u;i<20u;i=i+1u){ f[i]=p_limb(i); } }
    else { for (var i=0u;i<20u;i=i+1u){ d[i]=0; e[i]=0; } e[0]=1; }
    var delta:i32=1;

    // --- batched pipeline: phase p -> outers [p*RING, p*RING+RING). FG fills
    //     buffer p&1; DE drains buffer (p-1)&1 (the previous phase) concurrently. ---
    let nph = (29u + RING - 1u) / RING;
    for (var p=0u; p<nph; p=p+1u){
      if (!isDE) {
        for (var k=0u;k<RING;k=k+1u){
          let o0=p*RING+k;
          if (o0 < 29u) {
            var m = Mat(1,0,0,1);
            if (DBG != 2u && DBG != 3u) {
              m=divsteps(&delta,low32(&f),low32(&g));
              if (o0 < 16u) { apply_fg_20(m,&f,&g); } else { apply_fg_8(m,&f,&g); }
            }
            sh_m[p&1u][k][j]=vec4<i32>(m.u,m.v,m.q,m.r);
          }
        }
      } else if (p>0u) {
        for (var k=0u;k<RING;k=k+1u){
          let o=(p-1u)*RING+k;
          if (o < 29u && DBG != 1u && DBG != 3u) {
            let mv=sh_m[(p-1u)&1u][k][j];
            apply_de(Mat(mv.x,mv.y,mv.z,mv.w),&d,&e);
            if((o&3u)==3u){ reduce_canonical(&d); reduce_canonical(&e); }
          }
        }
      }
      workgroupBarrier();
    }

    // --- drain: DE consumes the final phase's matrices ---
    if (isDE) {
      let p=nph-1u;
      for (var k=0u;k<RING;k=k+1u){
        let o=p*RING+k;
        if (o < 29u && DBG != 1u && DBG != 3u) {
          let mv=sh_m[p&1u][k][j];
          apply_de(Mat(mv.x,mv.y,mv.z,mv.w),&d,&e);
          if((o&3u)==3u){ reduce_canonical(&d); reduce_canonical(&e); }
        }
      }
    } else {
      sh_fsign[j]=select(0u,1u,((f[7]>>12u)&1)==1);   // FG publishes f's sign (apply_fg_8 top limb)
    }
    workgroupBarrier();

    if (isDE) {
      reduce_canonical(&d);
      if(sh_fsign[j]==1u){ neg(&d); reduce_canonical(&d); }
      for (var i=0u;i<20u;i=i+1u){ sh_chain[j][i]=d[i]; }   // chain d -> next g
    }
    workgroupBarrier();
    if (!isDE) { for (var i=0u;i<20u;i=i+1u){ g[i]=sh_chain[j][i]; } }  // next input
    workgroupBarrier();
  }

  if (isDE) {
    for (var i=0u;i<20u;i=i+1u){ outp[base+i]=u32(d[i]&MASK); }
  }
}
