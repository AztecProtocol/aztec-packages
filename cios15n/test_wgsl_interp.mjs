// Validate the EMITTED WGSL (via wgsl_interp) against x*y*2^-255 mod p, R=2^255.
// Also assert no u32 overflow: max '+'/'*' intermediate must stay < 2^32.
import { runWGSL, maxSeen, N, B, MASK, p } from './wgsl_interp.mjs';
import { writeFileSync, appendFileSync } from 'node:fs';

const Bb = BigInt(B), Nn = BigInt(N), MASKb = BigInt(MASK);
const R = 1n << (Bb * Nn);
function modinv(a, m){let[o,r]=[((a%m)+m)%m,m],[os,s]=[1n,0n];while(r){const q=o/r;[o,r]=[r,o-q*r];[os,s]=[s,os-q*s];}return((os%m)+m)%m;}
const Rinv = modinv(R % p, p);
function toLimbs(x){const o=[];let v=((x%p)+p)%p;for(let i=0;i<N;i++){o.push(Number(v&MASKb));v>>=Bb;}return o;}
function fromLimbs(l){let v=0n;for(let i=l.length-1;i>=0;i--)v=(v<<Bb)|BigInt(l[i]);return v;}
function expected(A,Bx){return(((A%p)*(Bx%p))%p*Rinv)%p;}

let fails=0,run=0;const ff=[];
function chk(A,Bx,tag){run++;const got=fromLimbs(runWGSL(toLimbs(A),toLimbs(Bx)));const exp=expected(A,Bx);if(got!==exp){fails++;if(ff.length<6)ff.push(`${tag} A=${A} B=${Bx} got=${got} exp=${exp}`);}}

const edges=[0n,1n,2n,p-1n,p-2n,R%p,(R*R)%p,(1n<<128n)%p,(1n<<254n)%p,(p+1n)/2n,(p-1n)/2n];
for(const A of edges)for(const Bx of edges)chk(A,Bx,'edge');
writeFileSync('/tmp/wi_progress.txt',`edges run=${run} fails=${fails} maxInt=${maxSeen()}<<E`);

const TOTAL=Number(process.env.TRIALS||120000),CHUNK=20000;
let s0=0x9e3779b97f4a7c15n,s1=0xbf58476d1ce4e5b9n;
function n64(){let x=s0,y=s1;s0=y;x^=x<<23n;x&=(1n<<64n)-1n;s1=(x^y^(x>>17n)^(y>>26n))&((1n<<64n)-1n);return(s1+y)&((1n<<64n)-1n);}
function rf(){let v=0n;for(let k=0;k<4;k++)v=(v<<64n)|n64();return v%p;}
let done=0;
while(done<TOTAL){const end=Math.min(done+CHUNK,TOTAL);for(let i=done;i<end;i++)chk(rf(),rf(),'rand');done=end;appendFileSync('/tmp/wi_progress.txt',`\nchunk ${done}/${TOTAL} fails=${fails} maxInt=${maxSeen()}<<E`);console.log(`wgsl-interp ${done}/${TOTAL} fails=${fails} maxInt=${maxSeen()}`);}

const overflow = maxSeen() >= (1n<<32n);
const verdict=(fails===0 && !overflow)?'PASS':'FAIL';
const summary=`WGSL_INTERP ${verdict} run=${run} fails=${fails} maxIntermediate=${maxSeen()} (2^${(maxSeen()>0n?maxSeen().toString(2).length-1:0)}) u32_overflow=${overflow} `+(ff.length?('firstfails: '+ff.join(' | ')):'');
writeFileSync('/tmp/wi_verdict.txt',summary+'<<E');
console.log(summary);
process.exit(verdict==='PASS'?0:1);
