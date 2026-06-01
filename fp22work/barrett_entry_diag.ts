// What does field_mul(&x, &get_r()) actually compute for fp22native?
// field_mul is Barrett reduction at the 20x13 (=260-bit) limb width: it returns
// a*b*2^-260 mod p (the 20x13 Montgomery reduce). With b = get_r() = (2^264 mod p)
// in 20x13 limbs, field_mul(x, r) = x * (2^264 mod p) * 2^-260 = x * 2^4 mod p.
// The to-Montgomery entry is therefore WRONG (should be x*2^264).
const P=21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const modinv=(a,m)=>{let[or,r]=[((a%m)+m)%m,m];let[os,s]=[1n,0n];while(r){const q=or/r;[or,r]=[r,or-q*r];[os,s]=[s,os-q*s];}return((os%m)+m)%m;};
const R260inv = modinv(1n<<260n, P);
const r264 = (1n<<264n)%P;
function field_mul_model(x, b){ return ((x%P)*(b%P)%P)*R260inv%P; } // a*b*2^-260
const x = 123456789n % P;
const got = field_mul_model(x, r264);
const wantMont264 = x*((1n<<264n)%P)%P;     // x in 2^264-Montgomery
const wantMont260 = x*((1n<<260n)%P)%P;     // x in 2^260-Montgomery
console.log("field_mul(x, r=2^264) == x*2^264 (want)?", got===wantMont264);
console.log("field_mul(x, r=2^264) == x*2^4?", got === (x*16n%P));
console.log("=> entry needs b such that x*b*2^-260 = x*2^264, i.e. b = 2^(264+260) mod p = 2^524 mod p");
const bFix = (1n<<524n)%P;
console.log("field_mul(x, 2^524 mod p) == x*2^264?", field_mul_model(x, bFix) === wantMont264);
