/// OpenVM Precompiles: BN254 Fr Poseidon2 + secp256k1 ECDSA using modular
/// arithmetic and EC acceleration.
///
/// OpenVM provides `moduli_declare!` for hardware-accelerated field arithmetic
/// and `sw_declare!` for accelerated EC point add/double. We use both:
///
///   - BN254 Fr acceleration for Poseidon2 hash and sponge encryption.
///   - secp256k1 Fp/Fr acceleration + EC extension for ECDSA verification.
///
/// ## ECDSA verification (secp256k1)
///
/// Standard ECDSA over secp256k1 (same curve as Ethereum signatures):
///   Input: pubkey (x,y) as LE-encoded NativeDigest; sig = r||s (64 bytes, each
///          component 32 bytes big-endian); msg prehash (up to 32 bytes).
///   Algorithm:
///     z  = msg[0..32] as Secp256k1Fr (LE)
///     u1 = z  / s  mod n
///     u2 = r  / s  mod n
///     R  = u1*G + u2*PK   (MSM via OpenVM EC precompile)
///     ok = (R.x  mod n) == r
///
/// ## Poseidon2 sponge encryption (aes128_encrypt)
///
/// Duplex sponge over BN254 Fr, rate=3, using our existing Poseidon2 permutation:
///   state = [key_fr, iv_fr, 0, 0]   (16-byte key/iv packed BE into Fr)
///   permute(state)
///   for each 31-byte chunk of plaintext:
///     state[0] += chunk_as_fr
///     ciphertext ||= state[0].as_le_bytes()[..chunk_len]
///     permute(state)
///
/// Digest = NativeDigest (32 bytes LE). Conversion to/from Bn254Fr is zero-cost
/// since both are 32-byte little-endian representations.
extern crate alloc;
use alloc::vec::Vec;
use core::ops::Add;

use openvm_algebra_guest::{DivUnsafe, IntMod};
use openvm_ecc_guest::{
    weierstrass::{IntrinsicCurve, WeierstrassPoint},
    CyclicGroup, Group,
};
use zkvm_data_types::field::{Digest, NativeDigest};
use zkvm_data_types::precompiles::Precompiles;

use crate::{Bn254Fr, Secp256k1, Secp256k1Fp, Secp256k1Fr, Secp256k1Point};

// Poseidon2 parameters: t=4, rounds_f=8, rounds_p=56, s-box=x^5
const T: usize = 4;
const ROUNDS_F: usize = 8;
const ROUNDS_P: usize = 56;

// ---------------------------------------------------------------------------
// Bn254Fr ↔ NativeDigest conversion
// ---------------------------------------------------------------------------

#[inline]
fn to_fr(d: &NativeDigest) -> Bn254Fr {
    Bn254Fr::from_le_bytes(&d.0).expect("valid field element")
}

#[inline]
fn to_digest(f: &Bn254Fr) -> NativeDigest {
    let bytes = f.as_le_bytes();
    let mut out = [0u8; 32];
    let len = bytes.len().min(32);
    out[..len].copy_from_slice(&bytes[..len]);
    NativeDigest(out)
}

// ---------------------------------------------------------------------------
// Hex constant parser (compile-time friendly)
// ---------------------------------------------------------------------------

fn fr_from_be_hex(hex: &[u8; 64]) -> Bn254Fr {
    let mut be_bytes = [0u8; 32];
    for i in 0..32 {
        let hi = hex_nibble(hex[2 * i]);
        let lo = hex_nibble(hex[2 * i + 1]);
        be_bytes[i] = (hi << 4) | lo;
    }
    let mut le_bytes = [0u8; 32];
    for i in 0..32 {
        le_bytes[i] = be_bytes[31 - i];
    }
    Bn254Fr::from_le_bytes(&le_bytes).expect("valid field element")
}

fn hex_nibble(b: u8) -> u8 {
    match b {
        b'0'..=b'9' => b - b'0',
        b'a'..=b'f' => 10 + b - b'a',
        b'A'..=b'F' => 10 + b - b'A',
        _ => 0,
    }
}

// ---------------------------------------------------------------------------
// Poseidon2 permutation (identical to main.rs standalone version)
// ---------------------------------------------------------------------------

#[inline]
fn s_box(x: &Bn254Fr) -> Bn254Fr {
    let x2 = x.clone() * x.clone();
    let x4 = x2.clone() * x2.clone();
    x4 * x.clone()
}

fn matrix_mul_4x4(state: &mut [Bn254Fr; T]) {
    let t0 = state[0].clone() + state[1].clone();
    let t1 = state[2].clone() + state[3].clone();
    let mut t2 = state[1].clone() + state[1].clone();
    t2 = t2 + t1.clone();
    let mut t3 = state[3].clone() + state[3].clone();
    t3 = t3 + t0.clone();
    let mut t4 = t1.clone() + t1.clone();
    t4 = t4.clone() + t4.clone();
    t4 = t4 + t3.clone();
    let mut t5 = t0.clone() + t0.clone();
    t5 = t5.clone() + t5.clone();
    t5 = t5 + t2.clone();
    let t6 = t3 + t5.clone();
    let t7 = t2 + t4.clone();
    state[0] = t6;
    state[1] = t5;
    state[2] = t7;
    state[3] = t4;
}

fn internal_m_mul(state: &mut [Bn254Fr; T], diag: &[Bn254Fr; 4]) {
    let mut sum = state[0].clone();
    for i in 1..T {
        sum = sum + state[i].clone();
    }
    for i in 0..T {
        state[i] = state[i].clone() * diag[i].clone();
        state[i] = state[i].clone() + sum.clone();
    }
}

fn permutation(state: &mut [Bn254Fr; T], rc: &[[Bn254Fr; 4]; 64], diag: &[Bn254Fr; 4]) {
    matrix_mul_4x4(state);

    let rf_first = ROUNDS_F / 2;
    for r in 0..rf_first {
        for i in 0..T {
            state[i] = state[i].clone() + rc[r][i].clone();
        }
        for i in 0..T {
            state[i] = s_box(&state[i]);
        }
        matrix_mul_4x4(state);
    }

    for r in rf_first..(rf_first + ROUNDS_P) {
        state[0] = state[0].clone() + rc[r][0].clone();
        state[0] = s_box(&state[0]);
        internal_m_mul(state, diag);
    }

    for r in (rf_first + ROUNDS_P)..(ROUNDS_F + ROUNDS_P) {
        for i in 0..T {
            state[i] = state[i].clone() + rc[r][i].clone();
        }
        for i in 0..T {
            state[i] = s_box(&state[i]);
        }
        matrix_mul_4x4(state);
    }
}

/// Poseidon2 sponge hash (rate=3, capacity=1).
fn poseidon2_sponge(inputs: &[Bn254Fr], rc: &[[Bn254Fr; 4]; 64], diag: &[Bn254Fr; 4]) -> Bn254Fr {
    let zero = Bn254Fr::from_u32(0);
    let mut state = [zero.clone(), zero.clone(), zero.clone(), zero.clone()];

    let two_pow_64 = Bn254Fr::from_le_bytes(&{
        let mut b = [0u8; 32];
        b[8] = 1;
        b
    }).expect("2^64 < modulus");
    state[T - 1] = Bn254Fr::from_u32(inputs.len() as u32) * two_pow_64;

    let rate = T - 1;
    let mut offset = 0;
    while offset < inputs.len() {
        let chunk_size = core::cmp::min(rate, inputs.len() - offset);
        for i in 0..chunk_size {
            state[i] = state[i].clone() + inputs[offset + i].clone();
        }
        permutation(&mut state, rc, diag);
        offset += rate;
    }

    state[0].clone()
}

/// Poseidon2 compress (2 inputs → 1 output) for Merkle proofs.
fn poseidon2_compress_fr(left: &Bn254Fr, right: &Bn254Fr, rc: &[[Bn254Fr; 4]; 64], diag: &[Bn254Fr; 4]) -> Bn254Fr {
    let two_pow_64 = Bn254Fr::from_le_bytes(&{
        let mut b = [0u8; 32]; b[8] = 1; b
    }).expect("valid");
    let mut state = [left.clone(), right.clone(), Bn254Fr::from_u32(0), Bn254Fr::from_u32(2) * two_pow_64];
    permutation(&mut state, rc, diag);
    state[0].clone()
}

// ---------------------------------------------------------------------------
// Round constants (same as main.rs)
// ---------------------------------------------------------------------------

fn load_params() -> ([[Bn254Fr; 4]; 64], [Bn254Fr; 4]) {
    let diag = [
        fr_from_be_hex(b"10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e7"),
        fr_from_be_hex(b"0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740b"),
        fr_from_be_hex(b"00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac15"),
        fr_from_be_hex(b"222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428b"),
    ];

    let z = b"0000000000000000000000000000000000000000000000000000000000000000";
    let rc: [[Bn254Fr; 4]; 64] = [
        [fr_from_be_hex(b"19b849f69450b06848da1d39bd5e4a4302bb86744edc26238b0878e269ed23e5"), fr_from_be_hex(b"265ddfe127dd51bd7239347b758f0a1320eb2cc7450acc1dad47f80c8dcf34d6"), fr_from_be_hex(b"199750ec472f1809e0f66a545e1e51624108ac845015c2aa3dfc36bab497d8aa"), fr_from_be_hex(b"157ff3fe65ac7208110f06a5f74302b14d743ea25067f0ffd032f787c7f1cdf8")],
        [fr_from_be_hex(b"2e49c43c4569dd9c5fd35ac45fca33f10b15c590692f8beefe18f4896ac94902"), fr_from_be_hex(b"0e35fb89981890520d4aef2b6d6506c3cb2f0b6973c24fa82731345ffa2d1f1e"), fr_from_be_hex(b"251ad47cb15c4f1105f109ae5e944f1ba9d9e7806d667ffec6fe723002e0b996"), fr_from_be_hex(b"13da07dc64d428369873e97160234641f8beb56fdd05e5f3563fa39d9c22df4e")],
        [fr_from_be_hex(b"0c009b84e650e6d23dc00c7dccef7483a553939689d350cd46e7b89055fd4738"), fr_from_be_hex(b"011f16b1c63a854f01992e3956f42d8b04eb650c6d535eb0203dec74befdca06"), fr_from_be_hex(b"0ed69e5e383a688f209d9a561daa79612f3f78d0467ad45485df07093f367549"), fr_from_be_hex(b"04dba94a7b0ce9e221acad41472b6bbe3aec507f5eb3d33f463672264c9f789b")],
        [fr_from_be_hex(b"0a3f2637d840f3a16eb094271c9d237b6036757d4bb50bf7ce732ff1d4fa28e8"), fr_from_be_hex(b"259a666f129eea198f8a1c502fdb38fa39b1f075569564b6e54a485d1182323f"), fr_from_be_hex(b"28bf7459c9b2f4c6d8e7d06a4ee3a47f7745d4271038e5157a32fdf7ede0d6a1"), fr_from_be_hex(b"0a1ca941f057037526ea200f489be8d4c37c85bbcce6a2aeec91bd6941432447")],
        [fr_from_be_hex(b"0c6f8f958be0e93053d7fd4fc54512855535ed1539f051dcb43a26fd926361cf"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"123106a93cd17578d426e8128ac9d90aa9e8a00708e296e084dd57e69caaf811"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"26e1ba52ad9285d97dd3ab52f8e840085e8fa83ff1e8f1877b074867cd2dee75"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"1cb55cad7bd133de18a64c5c47b9c97cbe4d8b7bf9e095864471537e6a4ae2c5"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"1dcd73e46acd8f8e0e2c7ce04bde7f6d2a53043d5060a41c7143f08e6e9055d0"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"011003e32f6d9c66f5852f05474a4def0cda294a0eb4e9b9b12b9bb4512e5574"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"2b1e809ac1d10ab29ad5f20d03a57dfebadfe5903f58bafed7c508dd2287ae8c"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"2539de1785b735999fb4dac35ee17ed0ef995d05ab2fc5faeaa69ae87bcec0a5"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"0c246c5a2ef8ee0126497f222b3e0a0ef4e1c3d41c86d46e43982cb11d77951d"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"192089c4974f68e95408148f7c0632edbb09e6a6ad1a1c2f3f0305f5d03b527b"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"1eae0ad8ab68b2f06a0ee36eeb0d0c058529097d91096b756d8fdc2fb5a60d85"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"179190e5d0e22179e46f8282872abc88db6e2fdc0dee99e69768bd98c5d06bfb"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"29bb9e2c9076732576e9a81c7ac4b83214528f7db00f31bf6cafe794a9b3cd1c"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"225d394e42207599403efd0c2464a90d52652645882aac35b10e590e6e691e08"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"064760623c25c8cf753d238055b444532be13557451c087de09efd454b23fd59"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"10ba3a0e01df92e87f301c4b716d8a394d67f4bf42a75c10922910a78f6b5b87"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"0e070bf53f8451b24f9c6e96b0c2a801cb511bc0c242eb9d361b77693f21471c"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"1b94cd61b051b04dd39755ff93821a73ccd6cb11d2491d8aa7f921014de252fb"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"1d7cb39bafb8c744e148787a2e70230f9d4e917d5713bb050487b5aa7d74070b"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"2ec93189bd1ab4f69117d0fe980c80ff8785c2961829f701bb74ac1f303b17db"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"2db366bfdd36d277a692bb825b86275beac404a19ae07a9082ea46bd83517926"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"062100eb485db06269655cf186a68532985275428450359adc99cec6960711b8"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"0761d33c66614aaa570e7f1e8244ca1120243f92fa59e4f900c567bf41f5a59b"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"20fc411a114d13992c2705aa034e3f315d78608a0f7de4ccf7a72e494855ad0d"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"25b5c004a4bdfcb5add9ec4e9ab219ba102c67e8b3effb5fc3a30f317250bc5a"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"23b1822d278ed632a494e58f6df6f5ed038b186d8474155ad87e7dff62b37f4b"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"22734b4c5c3f9493606c4ba9012499bf0f14d13bfcfcccaa16102a29cc2f69e0"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"26c0c8fe09eb30b7e27a74dc33492347e5bdff409aa3610254413d3fad795ce5"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"070dd0ccb6bd7bbae88eac03fa1fbb26196be3083a809829bbd626df348ccad9"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"12b6595bdb329b6fb043ba78bb28c3bec2c0a6de46d8c5ad6067c4ebfd4250da"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"248d97d7f76283d63bec30e7a5876c11c06fca9b275c671c5e33d95bb7e8d729"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"1a306d439d463b0816fc6fd64cc939318b45eb759ddde4aa106d15d9bd9baaaa"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"28a8f8372e3c38daced7c00421cb4621f4f1b54ddc27821b0d62d3d6ec7c56cf"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"0094975717f9a8a8bb35152f24d43294071ce320c829f388bc852183e1e2ce7e"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"04d5ee4c3aa78f7d80fde60d716480d3593f74d4f653ae83f4103246db2e8d65"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"2a6cf5e9aa03d4336349ad6fb8ed2269c7bef54b8822cc76d08495c12efde187"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"2304d31eaab960ba9274da43e19ddeb7f792180808fd6e43baae48d7efcba3f3"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"03fd9ac865a4b2a6d5e7009785817249bff08a7e0726fcb4e1c11d39d199f0b0"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"00b7258ded52bbda2248404d55ee5044798afc3a209193073f7954d4d63b0b64"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"159f81ada0771799ec38fca2d4bf65ebb13d3a74f3298db36272c5ca65e92d9a"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"1ef90e67437fbc8550237a75bc28e3bb9000130ea25f0c5471e144cf4264431f"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"1e65f838515e5ff0196b49aa41a2d2568df739bc176b08ec95a79ed82932e30d"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"2b1b045def3a166cec6ce768d079ba74b18c844e570e1f826575c1068c94c33f"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"0832e5753ceb0ff6402543b1109229c165dc2d73bef715e3f1c6e07c168bb173"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"02f614e9cedfb3dc6b762ae0a37d41bab1b841c2e8b6451bc5a8e3c390b6ad16"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"0e2427d38bd46a60dd640b8e362cad967370ebb777bedff40f6a0be27e7ed705"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"0493630b7c670b6deb7c84d414e7ce79049f0ec098c3c7c50768bbe29214a53a"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"22ead100e8e482674decdab17066c5a26bb1515355d5461a3dc06cc85327cea9"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"25b3e56e655b42cdaae2626ed2554d48583f1ae35626d04de5084e0b6d2a6f16"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"1e32752ada8836ef5837a6cde8ff13dbb599c336349e4c584b4fdc0a0cf6f9d0"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"2fa2a871c15a387cc50f68f6f3c3455b23c00995f05078f672a9864074d412e5"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"2f569b8a9a4424c9278e1db7311e889f54ccbf10661bab7fcd18e7c7a7d83505"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"044cb455110a8fdd531ade530234c518a7df93f7332ffd2144165374b246b43d"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"227808de93906d5d420246157f2e42b191fe8c90adfe118178ddc723a5319025"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"02fcca2934e046bc623adead873579865d03781ae090ad4a8579d2e7a6800355"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"0ef915f0ac120b876abccceb344a1d36bad3f3c5ab91a8ddcbec2e060d8befac"), fr_from_be_hex(z), fr_from_be_hex(z), fr_from_be_hex(z)],
        [fr_from_be_hex(b"1797130f4b7a3e1777eb757bc6f287f6ab0fb85f6be63b09f3b16ef2b1405d38"), fr_from_be_hex(b"0a76225dc04170ae3306c85abab59e608c7f497c20156d4d36c668555decc6e5"), fr_from_be_hex(b"1fffb9ec1992d66ba1e77a7b93209af6f8fa76d48acb664796174b5326a31a5c"), fr_from_be_hex(b"25721c4fc15a3f2853b57c338fa538d85f8fbba6c6b9c6090611889b797b9c5f")],
        [fr_from_be_hex(b"0c817fd42d5f7a41215e3d07ba197216adb4c3790705da95eb63b982bfcaf75a"), fr_from_be_hex(b"13abe3f5239915d39f7e13c2c24970b6df8cf86ce00a22002bc15866e52b5a96"), fr_from_be_hex(b"2106feea546224ea12ef7f39987a46c85c1bc3dc29bdbd7a92cd60acb4d391ce"), fr_from_be_hex(b"21ca859468a746b6aaa79474a37dab49f1ca5a28c748bc7157e1b3345bb0f959")],
        [fr_from_be_hex(b"05ccd6255c1e6f0c5cf1f0df934194c62911d14d0321662a8f1a48999e34185b"), fr_from_be_hex(b"0f0e34a64b70a626e464d846674c4c8816c4fb267fe44fe6ea28678cb09490a4"), fr_from_be_hex(b"0558531a4e25470c6157794ca36d0e9647dbfcfe350d64838f5b1a8a2de0d4bf"), fr_from_be_hex(b"09d3dca9173ed2faceea125157683d18924cadad3f655a60b72f5864961f1455")],
        [fr_from_be_hex(b"0328cbd54e8c0913493f866ed03d218bf23f92d68aaec48617d4c722e5bd4335"), fr_from_be_hex(b"2bf07216e2aff0a223a487b1a7094e07e79e7bcc9798c648ee3347dd5329d34b"), fr_from_be_hex(b"1daf345a58006b736499c583cb76c316d6f78ed6a6dffc82111e11a63fe412df"), fr_from_be_hex(b"176563472456aaa746b694c60e1823611ef39039b2edc7ff391e6f2293d2c404")],
    ];

    (rc, diag)
}

// ---------------------------------------------------------------------------
// secp256k1 helpers
// ---------------------------------------------------------------------------

/// Build a Secp256k1Point from two NativeDigest values (LE-encoded coordinates).
/// Returns None if the coordinates are zero (identity / invalid input).
fn secp256k1_point_from_digests(px: &NativeDigest, py: &NativeDigest) -> Option<Secp256k1Point> {
    if px.is_zero() && py.is_zero() {
        return None;
    }
    let x = Secp256k1Fp::from_le_bytes(&px.0)?;
    let y = Secp256k1Fp::from_le_bytes(&py.0)?;
    Secp256k1Point::from_xy(x, y)
}

/// ECDSA verification over secp256k1 using OpenVM EC precompiles.
///
/// sig = r || s, each 32 bytes big-endian.
/// msg = raw message bytes; we take the first 32 bytes as the prehash (z).
///
/// Algorithm:
///   z  = msg[..32] interpreted as little-endian Secp256k1Fr
///   u1 = z / s  mod n
///   u2 = r / s  mod n
///   R  = u1*G + u2*PK  (via OpenVM MSM precompile)
///   ok = R.x (mod n) == r
///
/// Returns false for any degenerate input (zero sig, zero key, out-of-range).
fn ecdsa_verify_secp256k1(
    pkx: &NativeDigest,
    pky: &NativeDigest,
    sig: &[u8; 64],
    msg: &[u8],
) -> bool {
    // 1. Decode public key — reject identity point
    let pk = match secp256k1_point_from_digests(pkx, pky) {
        Some(p) => p,
        None => return false,
    };

    // 2. Parse r and s from sig (big-endian).  Reverse to LE for IntMod.
    let mut r_le = [0u8; 32];
    let mut s_le = [0u8; 32];
    for i in 0..32 {
        r_le[i] = sig[31 - i];
        s_le[i] = sig[63 - i];
    }
    let r = match Secp256k1Fr::from_le_bytes(&r_le) {
        Some(v) => v,
        None => return false,
    };
    let s = match Secp256k1Fr::from_le_bytes(&s_le) {
        Some(v) => v,
        None => return false,
    };
    if r == Secp256k1Fr::ZERO || s == Secp256k1Fr::ZERO {
        return false;
    }

    // 3. Message scalar z: take up to 32 bytes of msg (LE).
    let mut z_le = [0u8; 32];
    let msg_len = msg.len().min(32);
    z_le[..msg_len].copy_from_slice(&msg[..msg_len]);
    let z = match Secp256k1Fr::from_le_bytes(&z_le) {
        Some(v) => v,
        None => return false,
    };

    // 4. u1 = z / s,  u2 = r / s  (in secp256k1 scalar field Fr)
    let u1 = (&z).div_unsafe(&s);
    let u2 = (&r).div_unsafe(&s);

    // 5. R = u1*G + u2*PK  via OpenVM MSM precompile
    let r_point = Secp256k1::msm(
        &[u1, u2],
        &[Secp256k1Point::GENERATOR, pk],
    );

    // 6. Compare R.x (reduced mod n) with r.
    // R.x is a Secp256k1Fp (coordinate field); r is a Secp256k1Fr (scalar field).
    // Since n < p, we reinterpret R.x bytes as a scalar-field element (reduces mod n).
    let rx_bytes: &[u8] = r_point.x.as_le_bytes();
    let rx_as_fr = match Secp256k1Fr::from_le_bytes(rx_bytes) {
        Some(v) => v,
        None => return false,
    };

    rx_as_fr == r
}

// ---------------------------------------------------------------------------
// Poseidon2 sponge encryption (AES128 substitute)
// ---------------------------------------------------------------------------

/// Poseidon2 duplex sponge encryption over BN254 Fr, rate=3, t=4.
///
/// Mirrors the native `Bn254Precompiles::aes128_encrypt` algorithm so that
/// ciphertexts are compatible across backends:
///
///   state = [key_fr, iv_fr, 0, 0]   (16-byte key/iv packed BE into Fr)
///   permute(state)
///   for each 31-byte plaintext chunk:
///     state[0] += pack_be(chunk)
///     ciphertext ||= state[0].as_le_bytes()[..chunk_len]
///     permute(state)
///
/// The 31-byte chunk size keeps all values strictly below the BN254 Fr modulus.
fn poseidon2_sponge_encrypt(plaintext: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Vec<u8> {
    let (rc, diag) = get_params();

    // Pack 16-byte key/iv into Bn254Fr elements (BE, 16 bytes < field modulus)
    let key_fr = {
        let mut buf = [0u8; 32];
        // store as BE: buf[16..32] = key, so buf[0] = 0 (MSB), safe
        buf[16..32].copy_from_slice(key);
        // from_le_bytes needs LE — reverse
        let mut le = [0u8; 32];
        for i in 0..32 { le[i] = buf[31 - i]; }
        Bn254Fr::from_le_bytes(&le).expect("key fits in BN254 Fr")
    };
    let iv_fr = {
        let mut buf = [0u8; 32];
        buf[16..32].copy_from_slice(iv);
        let mut le = [0u8; 32];
        for i in 0..32 { le[i] = buf[31 - i]; }
        Bn254Fr::from_le_bytes(&le).expect("iv fits in BN254 Fr")
    };

    let zero = Bn254Fr::from_u32(0);
    let mut state = [key_fr, iv_fr, zero.clone(), zero.clone()];
    permutation(&mut state, rc, diag);

    let chunk_size = 31usize;
    let mut ciphertext = Vec::with_capacity(plaintext.len());
    let mut offset = 0;
    while offset < plaintext.len() {
        let end = core::cmp::min(offset + chunk_size, plaintext.len());
        let chunk = &plaintext[offset..end];

        // Pack chunk as BE into 32-byte buffer, then convert to LE for from_le_bytes
        let pt_fr = {
            let mut buf = [0u8; 32];
            buf[(32 - chunk.len())..32].copy_from_slice(chunk);
            // buf is BE; reverse to LE
            let mut le = [0u8; 32];
            for i in 0..32 { le[i] = buf[31 - i]; }
            Bn254Fr::from_le_bytes(&le).expect("chunk fits in BN254 Fr")
        };

        state[0] = state[0].clone() + pt_fr;

        // Emit chunk_len bytes from state[0] in LE order
        let ct_le: &[u8] = state[0].as_le_bytes();
        for i in 0..chunk.len() {
            ciphertext.push(ct_le[i]);
        }

        permutation(&mut state, rc, diag);
        offset += chunk_size;
    }

    ciphertext
}

// ---------------------------------------------------------------------------
// Precompiles implementation
// ---------------------------------------------------------------------------

/// Global params — loaded once, reused across calls.
/// In guest execution, this avoids re-parsing hex constants for every hash.
static mut PARAMS: Option<([[Bn254Fr; 4]; 64], [Bn254Fr; 4])> = None;

fn get_params() -> &'static ([[Bn254Fr; 4]; 64], [Bn254Fr; 4]) {
    unsafe {
        if PARAMS.is_none() {
            PARAMS = Some(load_params());
        }
        PARAMS.as_ref().unwrap()
    }
}

pub struct OpenVmPrecompiles;

impl Precompiles for OpenVmPrecompiles {
    type Digest = NativeDigest;

    fn poseidon2_hash(inputs: &[NativeDigest]) -> NativeDigest {
        let (rc, diag) = get_params();
        let fr_inputs: Vec<Bn254Fr> = inputs.iter().map(|d| to_fr(d)).collect();
        to_digest(&poseidon2_sponge(&fr_inputs, rc, diag))
    }

    fn poseidon2_hash_with_separator(inputs: &[NativeDigest], separator: u32) -> NativeDigest {
        let (rc, diag) = get_params();
        let mut fr_inputs: Vec<Bn254Fr> = Vec::with_capacity(inputs.len() + 1);
        fr_inputs.push(Bn254Fr::from_u32(separator));
        for d in inputs {
            fr_inputs.push(to_fr(d));
        }
        to_digest(&poseidon2_sponge(&fr_inputs, rc, diag))
    }

    fn poseidon2_compress(left: &NativeDigest, right: &NativeDigest) -> NativeDigest {
        let (rc, diag) = get_params();
        to_digest(&poseidon2_compress_fr(&to_fr(left), &to_fr(right), rc, diag))
    }

    fn sha256(_data: &[u8]) -> [u8; 32] { [0u8; 32] }

    fn ec_fixed_base_mul(s: &[u8; 32]) -> (NativeDigest, NativeDigest) {
        let scalar = Secp256k1Fr::from_le_bytes(s).unwrap_or(Secp256k1Fr::ZERO);
        if scalar == Secp256k1Fr::ZERO {
            return (NativeDigest::zero(), NativeDigest::zero());
        }
        let result = Secp256k1::msm(&[scalar], &[Secp256k1Point::GENERATOR]);
        let x_bytes: &[u8] = result.x.as_le_bytes();
        let y_bytes: &[u8] = result.y.as_le_bytes();
        let mut xd = [0u8; 32];
        let mut yd = [0u8; 32];
        xd[..x_bytes.len().min(32)].copy_from_slice(&x_bytes[..x_bytes.len().min(32)]);
        yd[..y_bytes.len().min(32)].copy_from_slice(&y_bytes[..y_bytes.len().min(32)]);
        (NativeDigest(xd), NativeDigest(yd))
    }

    fn ec_mul(px: &NativeDigest, py: &NativeDigest, s: &[u8; 32]) -> (NativeDigest, NativeDigest) {
        let pt = match secp256k1_point_from_digests(px, py) {
            Some(p) => p,
            None => return (NativeDigest::zero(), NativeDigest::zero()),
        };
        let scalar = Secp256k1Fr::from_le_bytes(s).unwrap_or(Secp256k1Fr::ZERO);
        if scalar == Secp256k1Fr::ZERO {
            return (NativeDigest::zero(), NativeDigest::zero());
        }
        let result = Secp256k1::msm(&[scalar], &[pt]);
        let x_bytes: &[u8] = result.x.as_le_bytes();
        let y_bytes: &[u8] = result.y.as_le_bytes();
        let mut xd = [0u8; 32];
        let mut yd = [0u8; 32];
        xd[..x_bytes.len().min(32)].copy_from_slice(&x_bytes[..x_bytes.len().min(32)]);
        yd[..y_bytes.len().min(32)].copy_from_slice(&y_bytes[..y_bytes.len().min(32)]);
        (NativeDigest(xd), NativeDigest(yd))
    }

    fn verify_signature(pkx: &NativeDigest, pky: &NativeDigest, sig: &[u8; 64], msg: &[u8]) -> bool {
        ecdsa_verify_secp256k1(pkx, pky, sig, msg)
    }

    fn aes128_encrypt(pt: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Vec<u8> {
        poseidon2_sponge_encrypt(pt, key, iv)
    }

    fn name() -> &'static str { "openvm-bn254-poseidon2-secp256k1-ecdsa" }
}
