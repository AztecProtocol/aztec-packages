// VM with a PACKED register file — BN254 G1 projective, 20x13 Montgomery. ONE algorithm.
// The montmul is called from a step loop (1 body -> fast Mali compile, no Metal crash). The
// register file v[] holds each field element PACKED 2x13-bit per u32 (10 u32/slot, not 20),
// halving the spill traffic that is the VM's only exec cost. montmul unpacks operands, packs
// its result. Complete RCB add (a=0,b3=9): add, doubling (P==Q), mixed-add (Z2=MONT_ONE).
override CHAIN_K: u32 = 1u;
override N_STEPS: u32 = 26u;
@group(0) @binding(0) var<storage, read>       inp:  array<u32>;
@group(0) @binding(1) var<storage, read_write> outp: array<u32>;
const MASK: u32 = 8191u;
const N0:   u32 = 905u;
const PL = array<u32,20>(7495u, 999u, 1462u, 280u, 5058u, 1350u, 455u, 4653u, 362u, 3260u, 5655u, 770u, 7016u, 2082u, 1761u, 5125u, 305u, 5015u, 6419u, 96u);
const MONT_ONE = array<u32,20>(1204u, 6119u, 61u, 1041u, 1109u, 1236u, 2726u, 2359u, 2312u, 4684u, 82u, 798u, 472u, 5264u, 7702u, 3657u, 7095u, 4720u, 1424u, 62u);
struct Acc { s0:u32, s1:u32, s2:u32, s3:u32, s4:u32, s5:u32, s6:u32, s7:u32, s8:u32, s9:u32, s10:u32, s11:u32, s12:u32, s13:u32, s14:u32, s15:u32, s16:u32, s17:u32, s18:u32, }
fn mont_iter(wx: u32, b: ptr<function, array<u32,20>>, a: ptr<function, Acc>) {
  let t  = (*a).s0 + wx * (*b)[0];
  let qi = (N0 * (t & MASK)) & MASK;
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
fn cond_sub_p(s: array<u32,20>) -> array<u32,20> {
  var d: array<u32,20>; var bw=0u;
  for (var j=0u;j<20u;j=j+1u){ let t=s[j]+8192u-PL[j]-bw; d[j]=t&MASK; bw=1u-(t>>13u); }
  var r: array<u32,20>;
  for (var j=0u;j<20u;j=j+1u){ r[j]=select(d[j],s[j],bw==1u); }
  return r;
}
fn montmul(xa: array<u32,20>, bv: array<u32,20>) -> array<u32,20> {
  var b = bv; var a: Acc;
  a.s0=0u; a.s1=0u; a.s2=0u; a.s3=0u; a.s4=0u; a.s5=0u; a.s6=0u; a.s7=0u; a.s8=0u; a.s9=0u; a.s10=0u; a.s11=0u; a.s12=0u; a.s13=0u; a.s14=0u; a.s15=0u; a.s16=0u; a.s17=0u; a.s18=0u;
  mont_iter(xa[0], &b, &a);
  mont_iter(xa[1], &b, &a);
  mont_iter(xa[2], &b, &a);
  mont_iter(xa[3], &b, &a);
  mont_iter(xa[4], &b, &a);
  mont_iter(xa[5], &b, &a);
  mont_iter(xa[6], &b, &a);
  mont_iter(xa[7], &b, &a);
  mont_iter(xa[8], &b, &a);
  mont_iter(xa[9], &b, &a);
  mont_iter(xa[10], &b, &a);
  mont_iter(xa[11], &b, &a);
  mont_iter(xa[12], &b, &a);
  mont_iter(xa[13], &b, &a);
  mont_iter(xa[14], &b, &a);
  mont_iter(xa[15], &b, &a);
  mont_iter(xa[16], &b, &a);
  mont_iter(xa[17], &b, &a);
  mont_iter(xa[18], &b, &a);
  mont_iter(xa[19], &b, &a);
  a.s1+=a.s0>>13u; a.s0&=MASK;
  a.s2+=a.s1>>13u; a.s1&=MASK;
  a.s3+=a.s2>>13u; a.s2&=MASK;
  a.s4+=a.s3>>13u; a.s3&=MASK;
  a.s5+=a.s4>>13u; a.s4&=MASK;
  a.s6+=a.s5>>13u; a.s5&=MASK;
  a.s7+=a.s6>>13u; a.s6&=MASK;
  a.s8+=a.s7>>13u; a.s7&=MASK;
  a.s9+=a.s8>>13u; a.s8&=MASK;
  a.s10+=a.s9>>13u; a.s9&=MASK;
  a.s11+=a.s10>>13u; a.s10&=MASK;
  a.s12+=a.s11>>13u; a.s11&=MASK;
  a.s13+=a.s12>>13u; a.s12&=MASK;
  a.s14+=a.s13>>13u; a.s13&=MASK;
  a.s15+=a.s14>>13u; a.s14&=MASK;
  a.s16+=a.s15>>13u; a.s15&=MASK;
  a.s17+=a.s16>>13u; a.s16&=MASK;
  a.s18+=a.s17>>13u; a.s17&=MASK;
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
  r[18]=a.s18 & MASK; r[19]=a.s18 >> 13u;
  return cond_sub_p(r);
}
fn fr_add(a: array<u32,20>, b: array<u32,20>) -> array<u32,20> {
  var s: array<u32,20>; var cy=0u;
  for (var j=0u;j<20u;j=j+1u){ let v=a[j]+b[j]+cy; s[j]=v&MASK; cy=v>>13u; }
  return cond_sub_p(s);
}
fn fr_sub(a: array<u32,20>, b: array<u32,20>) -> array<u32,20> {
  var d: array<u32,20>; var bw=0u;
  for (var j=0u;j<20u;j=j+1u){ let t=a[j]+8192u-b[j]-bw; d[j]=t&MASK; bw=1u-(t>>13u); }
  var r: array<u32,20>; var cy=0u;
  for (var j=0u;j<20u;j=j+1u){ let ad=select(0u,PL[j],bw==1u); let v=d[j]+ad+cy; r[j]=v&MASK; cy=v>>13u; }
  return r;
}
fn nine(a: array<u32,20>) -> array<u32,20> { let a2=fr_add(a,a); let a4=fr_add(a2,a2); let a8=fr_add(a4,a4); return fr_add(a8,a); }
fn three(a: array<u32,20>) -> array<u32,20> { return fr_add(fr_add(a,a),a); }
fn pack(x: array<u32,20>) -> array<u32,10> { var p: array<u32,10>; for (var k=0u;k<10u;k=k+1u){ p[k]=x[2u*k] | (x[2u*k+1u]<<13u); } return p; }
fn unpack(p: array<u32,10>) -> array<u32,20> { var x: array<u32,20>; for (var k=0u;k<10u;k=k+1u){ x[2u*k]=p[k]&MASK; x[2u*k+1u]=p[k]>>13u; } return x; }
const VOP = array<u32,26>(3u,3u,0u,0u,0u,0u,0u,1u,0u,0u,1u,0u,0u,1u,4u,1u,2u,0u,0u,2u,0u,0u,1u,0u,0u,1u);
const VA  = array<u32,26>(2u,5u,0u,1u,2u,0u,1u,11u,1u,2u,12u,0u,6u,13u,8u,9u,9u,11u,12u,17u,16u,13u,18u,15u,14u,19u);
const VB  = array<u32,26>(0u,0u,3u,4u,7u,4u,3u,12u,5u,4u,13u,7u,3u,14u,0u,10u,10u,16u,13u,18u,15u,14u,19u,12u,11u,20u);
const VO  = array<u32,26>(6u,7u,8u,9u,10u,11u,12u,11u,12u,13u,12u,13u,14u,13u,14u,15u,16u,17u,18u,17u,18u,19u,18u,19u,20u,19u);
fn padd_vm(X1: array<u32,20>, Y1: array<u32,20>, Z1: array<u32,20>, X2: array<u32,20>, Y2: array<u32,20>, Z2: array<u32,20>) -> array<array<u32,20>, 3> {
  var v: array<array<u32,10>, 21>;
  v[0]=pack(X1); v[1]=pack(Y1); v[2]=pack(Z1); v[3]=pack(X2); v[4]=pack(Y2); v[5]=pack(Z2);
  for (var s=0u; s<N_STEPS; s=s+1u) {
    let a = unpack(v[VA[s]]); let b = unpack(v[VB[s]]); let op = VOP[s];
    var r: array<u32,20>;
    if (op==0u) { r=montmul(a,b); } else if (op==1u) { r=fr_add(a,b); } else if (op==2u) { r=fr_sub(a,b); } else if (op==3u) { r=nine(a); } else { r=three(a); }
    v[VO[s]] = pack(r);
  }
  return array<array<u32,20>,3>(unpack(v[17]), unpack(v[18]), unpack(v[19]));
}
fn ld(base: u32) -> array<u32,20> { var r: array<u32,20>; for (var j=0u;j<20u;j=j+1u){ r[j]=inp[base+j]; } return r; }
fn st(base: u32, v: array<u32,20>) { for (var j=0u;j<20u;j=j+1u){ outp[base+j]=v[j]; } }
@compute @workgroup_size(64) fn add_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g=gid.x; let b=g*120u; var X1=ld(b); var Y1=ld(b+20u); var Z1=ld(b+40u); let X2=ld(b+60u); let Y2=ld(b+80u); let Z2=ld(b+100u);
  for (var rep=0u;rep<CHAIN_K;rep=rep+1u){ let r=padd_vm(X1,Y1,Z1,X2,Y2,Z2); X1=r[0];Y1=r[1];Z1=r[2]; }
  let ob=g*60u; st(ob,X1); st(ob+20u,Y1); st(ob+40u,Z1);
}
@compute @workgroup_size(64) fn dbl_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g=gid.x; let b=g*60u; var X=ld(b); var Y=ld(b+20u); var Z=ld(b+40u);
  for (var rep=0u;rep<CHAIN_K;rep=rep+1u){ let r=padd_vm(X,Y,Z,X,Y,Z); X=r[0];Y=r[1];Z=r[2]; }
  let ob=g*60u; st(ob,X); st(ob+20u,Y); st(ob+40u,Z);
}
@compute @workgroup_size(64) fn madd_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let g=gid.x; let b=g*100u; var X1=ld(b); var Y1=ld(b+20u); var Z1=ld(b+40u); let X2=ld(b+60u); let Y2=ld(b+80u);
  for (var rep=0u;rep<CHAIN_K;rep=rep+1u){ let r=padd_vm(X1,Y1,Z1,X2,Y2,MONT_ONE); X1=r[0];Y1=r[1];Z1=r[2]; }
  let ob=g*60u; st(ob,X1); st(ob+20u,Y1); st(ob+40u,Z1);
}
