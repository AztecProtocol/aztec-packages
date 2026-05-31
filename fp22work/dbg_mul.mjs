import { writeFileSync } from 'fs';
const W_F32 = 4194304.0;
const W_INV_F32 = Math.fround(1.0 / 4194304.0);
function fr(x){return Math.fround(x);}
function fma(a,b,c){return Math.fround(a*b+c);}
function mulhilo22(a,b){
  const p=fr(a*b);
  const e=fr(fma(a,b,-p));
  const hi=fr(Math.floor(fr(p*W_INV_F32)));
  const lo=fr(fr(fma(hi,-W_F32,p))+e);
  return [hi,lo];
}
const out=[];
// test many pairs, check hi*2^22+lo == a*b exactly (in integer) and ranges
let badrange=0, badexact=0, examples=[];
function test(a,b){
  const [hi,lo]=mulhilo22(a,b);
  const recon = hi*W_F32+lo; // f64
  const exact = a*b;
  if(recon!==exact){badexact++; if(examples.length<8)examples.push(`exact a=${a} b=${b} hi=${hi} lo=${lo} recon=${recon} exact=${exact}`);}
  if(lo<0 || lo>=W_F32 || hi<0 || hi>=W_F32){badrange++; if(examples.length<8)examples.push(`range a=${a} b=${b} hi=${hi} lo=${lo}`);}
}
// max limb value 2^22-1
const MX=4194303;
test(MX,MX); test(MX,1); test(1,MX); test(0,0); test(MX,2); test(3000000,3000000);
let s=7;
function rnd(){s=(s*1103515245+12345)&0x7fffffff;return s%4194304;}
for(let i=0;i<200000;i++){test(rnd(),rnd());}
out.push(`badexact=${badexact} badrange=${badrange}`);
out.push(...examples);
writeFileSync('/tmp/fp22_dbgmul.txt',out.join('\n')+'\n');
console.log('WROTE');
