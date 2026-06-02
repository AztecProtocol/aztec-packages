/// Accelerated Poseidon2 using SP1's BN254 Fp arithmetic precompiles.
///
/// IMPORTANT: Fp vs Fr distinction
/// ================================
/// SP1 v6.1.0 provides precompiles for BN254 **Fp** (base field) arithmetic:
///   Fp modulus p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
///
/// The existing software Poseidon2 (in zkvm-crypto-bn254) operates over **Fr** (scalar field):
///   Fr modulus r = 21888242871839275222246405745257275088548364400416034343698204186575808495617
///
/// These are different fields. All round constants in this file have been re-interpreted
/// as Fp elements (same bit pattern, different modular reduction). Since all constants
/// are < min(p, r), and all intermediate values produced by Poseidon2 permutation are
/// reduced modulo the field prime, the outputs of this implementation will DIFFER from
/// the Fr-based software implementation whenever an intermediate value falls between r and p.
///
/// This implementation is intended as a performance benchmark to measure the speedup from
/// using hardware-accelerated field arithmetic. For protocol-compatible hashing, use the
/// software Fr implementation or wait for SP1 to add Fr precompiles.
///
/// Data layout
/// ===========
/// SP1 BN254 Fp precompiles operate on `[u64; 4]` in **little-endian limb order**:
///   limbs[0] = least significant 64 bits
///   limbs[3] = most significant 64 bits
///
/// The syscalls are:
///   syscall_bn254_fp_addmod(p: *mut u64, q: *const u64)  -- p = (p + q) mod Fp
///   syscall_bn254_fp_submod(p: *mut u64, q: *const u64)  -- p = (p - q) mod Fp
///   syscall_bn254_fp_mulmod(p: *mut u64, q: *const u64)  -- p = (p * q) mod Fp
/// Result is written in-place over the first argument.

extern crate alloc;
use alloc::vec::Vec;

// Re-export the syscalls from sp1-lib (linked via sp1-zkvm).
extern "C" {
    fn syscall_bn254_fp_addmod(p: *mut u64, q: *const u64);
    fn syscall_bn254_fp_mulmod(p: *mut u64, q: *const u64);
    fn syscall_bn254_fp_submod(p: *mut u64, q: *const u64);
}

/// A BN254 Fp field element represented as 4 x u64 in little-endian limb order.
/// Must be 8-byte aligned for the syscalls.
#[derive(Clone, Copy)]
#[repr(C, align(8))]
pub struct Fp(pub [u64; 4]);

impl Fp {
    pub const ZERO: Fp = Fp([0, 0, 0, 0]);
    pub const ONE: Fp = Fp([1, 0, 0, 0]);

    /// Create from a small u64 value.
    #[inline]
    pub const fn from_u64(v: u64) -> Self {
        Fp([v, 0, 0, 0])
    }

    /// Create from a big-endian hex string (at compile time via const fn helper).
    /// The hex string must be exactly 64 characters (32 bytes).
    const fn from_be_hex(hex: &[u8; 64]) -> Self {
        let bytes = hex_decode_be(hex);
        // Convert 32 BE bytes to [u64; 4] LE limbs
        Fp([
            u64::from_le_bytes([bytes[31], bytes[30], bytes[29], bytes[28],
                                bytes[27], bytes[26], bytes[25], bytes[24]]),
            u64::from_le_bytes([bytes[23], bytes[22], bytes[21], bytes[20],
                                bytes[19], bytes[18], bytes[17], bytes[16]]),
            u64::from_le_bytes([bytes[15], bytes[14], bytes[13], bytes[12],
                                bytes[11], bytes[10], bytes[9],  bytes[8]]),
            u64::from_le_bytes([bytes[7],  bytes[6],  bytes[5],  bytes[4],
                                bytes[3],  bytes[2],  bytes[1],  bytes[0]]),
        ])
    }

    /// Convert to big-endian 32 bytes (for Digest interop).
    pub fn to_be_bytes(&self) -> [u8; 32] {
        let mut out = [0u8; 32];
        let l = self.0;
        // limbs[0] is least significant
        let b0 = l[0].to_le_bytes();
        let b1 = l[1].to_le_bytes();
        let b2 = l[2].to_le_bytes();
        let b3 = l[3].to_le_bytes();
        // Pack into big-endian: most significant bytes first
        out[0..8].copy_from_slice(&reverse8(b3));
        out[8..16].copy_from_slice(&reverse8(b2));
        out[16..24].copy_from_slice(&reverse8(b1));
        out[24..32].copy_from_slice(&reverse8(b0));
        out
    }

    /// Create from big-endian 32 bytes.
    pub fn from_be_bytes(bytes: &[u8; 32]) -> Self {
        Fp([
            u64::from_le_bytes([bytes[31], bytes[30], bytes[29], bytes[28],
                                bytes[27], bytes[26], bytes[25], bytes[24]]),
            u64::from_le_bytes([bytes[23], bytes[22], bytes[21], bytes[20],
                                bytes[19], bytes[18], bytes[17], bytes[16]]),
            u64::from_le_bytes([bytes[15], bytes[14], bytes[13], bytes[12],
                                bytes[11], bytes[10], bytes[9],  bytes[8]]),
            u64::from_le_bytes([bytes[7],  bytes[6],  bytes[5],  bytes[4],
                                bytes[3],  bytes[2],  bytes[1],  bytes[0]]),
        ])
    }

    /// Field addition: self = (self + other) mod p. Uses the SP1 precompile.
    #[inline]
    pub fn add_assign(&mut self, other: &Fp) {
        unsafe {
            syscall_bn254_fp_addmod(self.0.as_mut_ptr(), other.0.as_ptr());
        }
    }

    /// Field subtraction: self = (self - other) mod p. Uses the SP1 precompile.
    #[inline]
    pub fn sub_assign(&mut self, other: &Fp) {
        unsafe {
            syscall_bn254_fp_submod(self.0.as_mut_ptr(), other.0.as_ptr());
        }
    }

    /// Field multiplication: self = (self * other) mod p. Uses the SP1 precompile.
    #[inline]
    pub fn mul_assign(&mut self, other: &Fp) {
        unsafe {
            syscall_bn254_fp_mulmod(self.0.as_mut_ptr(), other.0.as_ptr());
        }
    }

    /// Return (self + other) mod p without mutating self.
    #[inline]
    pub fn add(&self, other: &Fp) -> Fp {
        let mut result = *self;
        result.add_assign(other);
        result
    }

    /// Return (self * other) mod p without mutating self.
    #[inline]
    pub fn mul(&self, other: &Fp) -> Fp {
        let mut result = *self;
        result.mul_assign(other);
        result
    }

    /// S-box: x^5 = x * x * x * x * x
    /// Computed as: x2 = x*x, x4 = x2*x2, x5 = x4*x
    /// This uses 3 multiplications (3 syscalls).
    #[inline]
    pub fn sbox(&self) -> Fp {
        let x2 = self.mul(self);   // x^2
        let x4 = x2.mul(&x2);     // x^4
        x4.mul(self)               // x^5
    }
}

// ---- Helper functions ----

#[inline]
fn reverse8(a: [u8; 8]) -> [u8; 8] {
    [a[7], a[6], a[5], a[4], a[3], a[2], a[1], a[0]]
}

/// Compile-time hex decode: 64 hex chars -> 32 bytes (big-endian).
const fn hex_decode_be(hex: &[u8; 64]) -> [u8; 32] {
    let mut out = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        out[i] = (hex_nibble(hex[2 * i]) << 4) | hex_nibble(hex[2 * i + 1]);
        i += 1;
    }
    out
}

const fn hex_nibble(b: u8) -> u8 {
    match b {
        b'0'..=b'9' => b - b'0',
        b'a'..=b'f' => 10 + b - b'a',
        b'A'..=b'F' => 10 + b - b'A',
        _ => panic!("invalid hex"),
    }
}

// ---- Poseidon2 constants ----

const T: usize = 4;
const ROUNDS_F: usize = 8;
const ROUNDS_P: usize = 56;

/// Internal matrix diagonal for partial rounds.
/// Same hex values as poseidon2_params.rs, interpreted as Fp elements.
const INTERNAL_DIAG: [Fp; 4] = [
    Fp::from_be_hex(b"10dc6e9c006ea38b04b1e03b4bd9490c0d03f98929ca1d7fb56821fd19d3b6e7"),
    Fp::from_be_hex(b"0c28145b6a44df3e0149b3d0a30b3bb599df9756d4dd9b84a86b38cfb45a740b"),
    Fp::from_be_hex(b"00544b8338791518b2c7645a50392798b21f75bb60e3596170067d00141cac15"),
    Fp::from_be_hex(b"222c01175718386f2e2e82eb122789e352e105a3b8fa852613bc534433ee428b"),
];

/// Round constants: 64 rounds x 4 elements.
/// Rounds 0..3 are full (all 4 nonzero), 4..59 are partial (only [0] nonzero),
/// 60..63 are full.
const RC: [[Fp; 4]; 64] = [
    // Round 0 (full)
    [Fp::from_be_hex(b"19b849f69450b06848da1d39bd5e4a4302bb86744edc26238b0878e269ed23e5"),
     Fp::from_be_hex(b"265ddfe127dd51bd7239347b758f0a1320eb2cc7450acc1dad47f80c8dcf34d6"),
     Fp::from_be_hex(b"199750ec472f1809e0f66a545e1e51624108ac845015c2aa3dfc36bab497d8aa"),
     Fp::from_be_hex(b"157ff3fe65ac7208110f06a5f74302b14d743ea25067f0ffd032f787c7f1cdf8")],
    // Round 1 (full)
    [Fp::from_be_hex(b"2e49c43c4569dd9c5fd35ac45fca33f10b15c590692f8beefe18f4896ac94902"),
     Fp::from_be_hex(b"0e35fb89981890520d4aef2b6d6506c3cb2f0b6973c24fa82731345ffa2d1f1e"),
     Fp::from_be_hex(b"251ad47cb15c4f1105f109ae5e944f1ba9d9e7806d667ffec6fe723002e0b996"),
     Fp::from_be_hex(b"13da07dc64d428369873e97160234641f8beb56fdd05e5f3563fa39d9c22df4e")],
    // Round 2 (full)
    [Fp::from_be_hex(b"0c009b84e650e6d23dc00c7dccef7483a553939689d350cd46e7b89055fd4738"),
     Fp::from_be_hex(b"011f16b1c63a854f01992e3956f42d8b04eb650c6d535eb0203dec74befdca06"),
     Fp::from_be_hex(b"0ed69e5e383a688f209d9a561daa79612f3f78d0467ad45485df07093f367549"),
     Fp::from_be_hex(b"04dba94a7b0ce9e221acad41472b6bbe3aec507f5eb3d33f463672264c9f789b")],
    // Round 3 (full)
    [Fp::from_be_hex(b"0a3f2637d840f3a16eb094271c9d237b6036757d4bb50bf7ce732ff1d4fa28e8"),
     Fp::from_be_hex(b"259a666f129eea198f8a1c502fdb38fa39b1f075569564b6e54a485d1182323f"),
     Fp::from_be_hex(b"28bf7459c9b2f4c6d8e7d06a4ee3a47f7745d4271038e5157a32fdf7ede0d6a1"),
     Fp::from_be_hex(b"0a1ca941f057037526ea200f489be8d4c37c85bbcce6a2aeec91bd6941432447")],
    // Rounds 4..59 (partial: only rc[r][0] is nonzero)
    [Fp::from_be_hex(b"0c6f8f958be0e93053d7fd4fc54512855535ed1539f051dcb43a26fd926361cf"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"123106a93cd17578d426e8128ac9d90aa9e8a00708e296e084dd57e69caaf811"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"26e1ba52ad9285d97dd3ab52f8e840085e8fa83ff1e8f1877b074867cd2dee75"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"1cb55cad7bd133de18a64c5c47b9c97cbe4d8b7bf9e095864471537e6a4ae2c5"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"1dcd73e46acd8f8e0e2c7ce04bde7f6d2a53043d5060a41c7143f08e6e9055d0"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"011003e32f6d9c66f5852f05474a4def0cda294a0eb4e9b9b12b9bb4512e5574"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"2b1e809ac1d10ab29ad5f20d03a57dfebadfe5903f58bafed7c508dd2287ae8c"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"2539de1785b735999fb4dac35ee17ed0ef995d05ab2fc5faeaa69ae87bcec0a5"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"0c246c5a2ef8ee0126497f222b3e0a0ef4e1c3d41c86d46e43982cb11d77951d"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"192089c4974f68e95408148f7c0632edbb09e6a6ad1a1c2f3f0305f5d03b527b"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"1eae0ad8ab68b2f06a0ee36eeb0d0c058529097d91096b756d8fdc2fb5a60d85"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"179190e5d0e22179e46f8282872abc88db6e2fdc0dee99e69768bd98c5d06bfb"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"29bb9e2c9076732576e9a81c7ac4b83214528f7db00f31bf6cafe794a9b3cd1c"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"225d394e42207599403efd0c2464a90d52652645882aac35b10e590e6e691e08"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"064760623c25c8cf753d238055b444532be13557451c087de09efd454b23fd59"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"10ba3a0e01df92e87f301c4b716d8a394d67f4bf42a75c10922910a78f6b5b87"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"0e070bf53f8451b24f9c6e96b0c2a801cb511bc0c242eb9d361b77693f21471c"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"1b94cd61b051b04dd39755ff93821a73ccd6cb11d2491d8aa7f921014de252fb"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"1d7cb39bafb8c744e148787a2e70230f9d4e917d5713bb050487b5aa7d74070b"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"2ec93189bd1ab4f69117d0fe980c80ff8785c2961829f701bb74ac1f303b17db"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"2db366bfdd36d277a692bb825b86275beac404a19ae07a9082ea46bd83517926"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"062100eb485db06269655cf186a68532985275428450359adc99cec6960711b8"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"0761d33c66614aaa570e7f1e8244ca1120243f92fa59e4f900c567bf41f5a59b"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"20fc411a114d13992c2705aa034e3f315d78608a0f7de4ccf7a72e494855ad0d"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"25b5c004a4bdfcb5add9ec4e9ab219ba102c67e8b3effb5fc3a30f317250bc5a"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"23b1822d278ed632a494e58f6df6f5ed038b186d8474155ad87e7dff62b37f4b"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"22734b4c5c3f9493606c4ba9012499bf0f14d13bfcfcccaa16102a29cc2f69e0"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"26c0c8fe09eb30b7e27a74dc33492347e5bdff409aa3610254413d3fad795ce5"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"070dd0ccb6bd7bbae88eac03fa1fbb26196be3083a809829bbd626df348ccad9"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"12b6595bdb329b6fb043ba78bb28c3bec2c0a6de46d8c5ad6067c4ebfd4250da"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"248d97d7f76283d63bec30e7a5876c11c06fca9b275c671c5e33d95bb7e8d729"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"1a306d439d463b0816fc6fd64cc939318b45eb759ddde4aa106d15d9bd9baaaa"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"28a8f8372e3c38daced7c00421cb4621f4f1b54ddc27821b0d62d3d6ec7c56cf"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"0094975717f9a8a8bb35152f24d43294071ce320c829f388bc852183e1e2ce7e"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"04d5ee4c3aa78f7d80fde60d716480d3593f74d4f653ae83f4103246db2e8d65"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"2a6cf5e9aa03d4336349ad6fb8ed2269c7bef54b8822cc76d08495c12efde187"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"2304d31eaab960ba9274da43e19ddeb7f792180808fd6e43baae48d7efcba3f3"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"03fd9ac865a4b2a6d5e7009785817249bff08a7e0726fcb4e1c11d39d199f0b0"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"00b7258ded52bbda2248404d55ee5044798afc3a209193073f7954d4d63b0b64"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"159f81ada0771799ec38fca2d4bf65ebb13d3a74f3298db36272c5ca65e92d9a"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"1ef90e67437fbc8550237a75bc28e3bb9000130ea25f0c5471e144cf4264431f"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"1e65f838515e5ff0196b49aa41a2d2568df739bc176b08ec95a79ed82932e30d"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"2b1b045def3a166cec6ce768d079ba74b18c844e570e1f826575c1068c94c33f"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"0832e5753ceb0ff6402543b1109229c165dc2d73bef715e3f1c6e07c168bb173"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"02f614e9cedfb3dc6b762ae0a37d41bab1b841c2e8b6451bc5a8e3c390b6ad16"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"0e2427d38bd46a60dd640b8e362cad967370ebb777bedff40f6a0be27e7ed705"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"0493630b7c670b6deb7c84d414e7ce79049f0ec098c3c7c50768bbe29214a53a"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"22ead100e8e482674decdab17066c5a26bb1515355d5461a3dc06cc85327cea9"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"25b3e56e655b42cdaae2626ed2554d48583f1ae35626d04de5084e0b6d2a6f16"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"1e32752ada8836ef5837a6cde8ff13dbb599c336349e4c584b4fdc0a0cf6f9d0"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"2fa2a871c15a387cc50f68f6f3c3455b23c00995f05078f672a9864074d412e5"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"2f569b8a9a4424c9278e1db7311e889f54ccbf10661bab7fcd18e7c7a7d83505"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"044cb455110a8fdd531ade530234c518a7df93f7332ffd2144165374b246b43d"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"227808de93906d5d420246157f2e42b191fe8c90adfe118178ddc723a5319025"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"02fcca2934e046bc623adead873579865d03781ae090ad4a8579d2e7a6800355"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    [Fp::from_be_hex(b"0ef915f0ac120b876abccceb344a1d36bad3f3c5ab91a8ddcbec2e060d8befac"), Fp::ZERO, Fp::ZERO, Fp::ZERO],
    // Round 60 (full)
    [Fp::from_be_hex(b"1797130f4b7a3e1777eb757bc6f287f6ab0fb85f6be63b09f3b16ef2b1405d38"),
     Fp::from_be_hex(b"0a76225dc04170ae3306c85abab59e608c7f497c20156d4d36c668555decc6e5"),
     Fp::from_be_hex(b"1fffb9ec1992d66ba1e77a7b93209af6f8fa76d48acb664796174b5326a31a5c"),
     Fp::from_be_hex(b"25721c4fc15a3f2853b57c338fa538d85f8fbba6c6b9c6090611889b797b9c5f")],
    // Round 61 (full)
    [Fp::from_be_hex(b"0c817fd42d5f7a41215e3d07ba197216adb4c3790705da95eb63b982bfcaf75a"),
     Fp::from_be_hex(b"13abe3f5239915d39f7e13c2c24970b6df8cf86ce00a22002bc15866e52b5a96"),
     Fp::from_be_hex(b"2106feea546224ea12ef7f39987a46c85c1bc3dc29bdbd7a92cd60acb4d391ce"),
     Fp::from_be_hex(b"21ca859468a746b6aaa79474a37dab49f1ca5a28c748bc7157e1b3345bb0f959")],
    // Round 62 (full)
    [Fp::from_be_hex(b"05ccd6255c1e6f0c5cf1f0df934194c62911d14d0321662a8f1a48999e34185b"),
     Fp::from_be_hex(b"0f0e34a64b70a626e464d846674c4c8816c4fb267fe44fe6ea28678cb09490a4"),
     Fp::from_be_hex(b"0558531a4e25470c6157794ca36d0e9647dbfcfe350d64838f5b1a8a2de0d4bf"),
     Fp::from_be_hex(b"09d3dca9173ed2faceea125157683d18924cadad3f655a60b72f5864961f1455")],
    // Round 63 (full)
    [Fp::from_be_hex(b"0328cbd54e8c0913493f866ed03d218bf23f92d68aaec48617d4c722e5bd4335"),
     Fp::from_be_hex(b"2bf07216e2aff0a223a487b1a7094e07e79e7bcc9798c648ee3347dd5329d34b"),
     Fp::from_be_hex(b"1daf345a58006b736499c583cb76c316d6f78ed6a6dffc82111e11a63fe412df"),
     Fp::from_be_hex(b"176563472456aaa746b694c60e1823611ef39039b2edc7ff391e6f2293d2c404")],
];

// ---- Poseidon2 permutation ----

/// Poseidon2 permutation: t=4, rounds_f=8, rounds_p=56, sbox=x^5.
/// Operates over BN254 Fp using SP1 precompiles.
pub fn permutation(state: &mut [Fp; T]) {
    // Initial linear layer
    matrix_mul_4x4(state);

    // First half of full rounds (rounds 0..3)
    let rf_first = ROUNDS_F / 2;
    for r in 0..rf_first {
        add_round_constants(state, &RC[r]);
        sbox_full(state);
        matrix_mul_4x4(state);
    }

    // Partial rounds (rounds 4..59)
    for r in rf_first..(rf_first + ROUNDS_P) {
        state[0].add_assign(&RC[r][0]);
        state[0] = state[0].sbox();
        internal_m_mul(state);
    }

    // Second half of full rounds (rounds 60..63)
    for r in (rf_first + ROUNDS_P)..(ROUNDS_F + ROUNDS_P) {
        add_round_constants(state, &RC[r]);
        sbox_full(state);
        matrix_mul_4x4(state);
    }
}

/// Poseidon2 sponge hash: absorb inputs (rate=3, capacity=1), squeeze 1 output.
///
/// IV encodes the input length: state[3] = len * 2^64.
/// Absorb: chunks of 3 elements, add to state[0..3], then permute.
/// Squeeze: output state[0].
pub fn hash(inputs: &[Fp]) -> Fp {
    let mut state = [Fp::ZERO; T];

    // IV: len * 2^64 in Fp
    // 2^64 = (2^32)^2
    let two_pow_32 = Fp::from_u64(1u64 << 32);
    let two_pow_64 = two_pow_32.mul(&two_pow_32);
    let len_fp = Fp::from_u64(inputs.len() as u64);
    state[T - 1] = len_fp.mul(&two_pow_64);

    // Absorb in chunks of 3 (rate = t - 1 = 3)
    let rate = T - 1;
    let mut offset = 0;
    while offset < inputs.len() {
        let chunk_size = core::cmp::min(rate, inputs.len() - offset);
        for i in 0..chunk_size {
            state[i].add_assign(&inputs[offset + i]);
        }
        permutation(&mut state);
        offset += rate;
    }

    // Squeeze
    state[0]
}

/// Hash with a domain separator prepended.
pub fn hash_with_separator(inputs: &[Fp], separator: u32) -> Fp {
    let mut all = Vec::with_capacity(inputs.len() + 1);
    all.push(Fp::from_u64(separator as u64));
    all.extend_from_slice(inputs);
    hash(&all)
}

/// Two-to-one compression for Merkle trees.
pub fn compress(left: &Fp, right: &Fp) -> Fp {
    let mut state = [*left, *right, Fp::ZERO, Fp::ZERO];
    // IV for 2 inputs: 2 * 2^64
    let two_pow_32 = Fp::from_u64(1u64 << 32);
    let two_pow_64 = two_pow_32.mul(&two_pow_32);
    let two = Fp::from_u64(2);
    state[T - 1] = two.mul(&two_pow_64);
    permutation(&mut state);
    state[0]
}

// ---- Internal Poseidon2 functions ----

#[inline]
fn sbox_full(state: &mut [Fp; T]) {
    for s in state.iter_mut() {
        *s = s.sbox();
    }
}

#[inline]
fn add_round_constants(state: &mut [Fp; T], constants: &[Fp; 4]) {
    for (s, c) in state.iter_mut().zip(constants.iter()) {
        s.add_assign(c);
    }
}

/// 4x4 MDS matrix multiplication.
/// Same algorithm as the software implementation (from Barretenberg).
///
/// The matrix is:
///   [5, 7, 1, 3]
///   [4, 6, 1, 1]
///   [1, 3, 5, 7]
///   [1, 1, 4, 6]
///
/// Computed using only additions (no multiplications needed since the
/// matrix entries are small and can be built from doublings and additions).
fn matrix_mul_4x4(state: &mut [Fp; T]) {
    // t0 = A + B
    let t0 = state[0].add(&state[1]);
    // t1 = C + D
    let t1 = state[2].add(&state[3]);
    // t2 = 2B + C + D = 2B + t1
    let mut t2 = state[1].add(&state[1]);
    t2.add_assign(&t1);
    // t3 = 2D + A + B = 2D + t0
    let mut t3 = state[3].add(&state[3]);
    t3.add_assign(&t0);
    // t4 = 4(C+D) + t3 = 4*t1 + t3 = A + B + 4C + 6D
    let t1_2 = t1.add(&t1);
    let t1_4 = t1_2.add(&t1_2);
    let t4 = t1_4.add(&t3);
    // t5 = 4(A+B) + t2 = 4*t0 + t2 = 4A + 6B + C + D
    let t0_2 = t0.add(&t0);
    let t0_4 = t0_2.add(&t0_2);
    let t5 = t0_4.add(&t2);
    // t6 = t3 + t5 = 5A + 7B + C + 3D
    let t6 = t3.add(&t5);
    // t7 = t2 + t4 = A + 3B + 5C + 7D
    let t7 = t2.add(&t4);

    state[0] = t6;
    state[1] = t5;
    state[2] = t7;
    state[3] = t4;
}

/// Internal matrix multiplication for partial rounds.
/// M_I = diag(d0, d1, d2, d3) + ones_matrix
/// state_i' = diag[i] * state[i] + sum(state)
fn internal_m_mul(state: &mut [Fp; T]) {
    // Compute sum of all state elements
    let mut sum = state[0];
    sum.add_assign(&state[1]);
    sum.add_assign(&state[2]);
    sum.add_assign(&state[3]);

    // state[i] = state[i] * diag[i] + sum
    for i in 0..T {
        state[i].mul_assign(&INTERNAL_DIAG[i]);
        state[i].add_assign(&sum);
    }
}

// ---- Precompiles implementation ----

use zkvm_data_types::field::Digest;
use zkvm_data_types::precompiles::Precompiles;
use zkvm_crypto_bn254::digest::Bn254Digest;

/// SP1-accelerated Precompiles using BN254 Fp arithmetic precompiles.
///
/// WARNING: This operates over Fp (base field), not Fr (scalar field).
/// Hash outputs will differ from the software Bn254Precompiles.
/// See module-level documentation for details.
pub struct Sp1Bn254Precompiles;

impl Precompiles for Sp1Bn254Precompiles {
    type Digest = Bn254Digest;

    fn poseidon2_hash(inputs: &[Bn254Digest]) -> Bn254Digest {
        let fp_inputs: Vec<Fp> = inputs.iter().map(|d| digest_to_fp(d)).collect();
        fp_to_digest(&hash(&fp_inputs))
    }

    fn poseidon2_hash_with_separator(inputs: &[Bn254Digest], separator: u32) -> Bn254Digest {
        let fp_inputs: Vec<Fp> = inputs.iter().map(|d| digest_to_fp(d)).collect();
        fp_to_digest(&hash_with_separator(&fp_inputs, separator))
    }

    fn poseidon2_compress(left: &Bn254Digest, right: &Bn254Digest) -> Bn254Digest {
        fp_to_digest(&compress(&digest_to_fp(left), &digest_to_fp(right)))
    }

    fn sha256(_data: &[u8]) -> [u8; 32] {
        // TODO: implement real SHA-256
        [0u8; 32]
    }

    fn ec_fixed_base_mul(_scalar_bytes: &[u8; 32]) -> (Bn254Digest, Bn254Digest) {
        // TODO: implement with Grumpkin
        (Bn254Digest::zero(), Bn254Digest::zero())
    }

    fn ec_mul(
        _point_x: &Bn254Digest,
        _point_y: &Bn254Digest,
        _scalar_bytes: &[u8; 32],
    ) -> (Bn254Digest, Bn254Digest) {
        // TODO: implement with Grumpkin
        (Bn254Digest::zero(), Bn254Digest::zero())
    }

    fn verify_signature(
        pubkey_x: &Bn254Digest,
        pubkey_y: &Bn254Digest,
        sig: &[u8; 64],
        msg: &[u8],
    ) -> bool {
        secp256k1_ecdsa_verify(pubkey_x, pubkey_y, sig, msg)
    }

    fn aes128_encrypt(plaintext: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Vec<u8> {
        poseidon2_keystream_encrypt(plaintext, key, iv)
    }

    fn name() -> &'static str {
        "sp1-bn254-fp-precompile"
    }
}

/// Convert a Bn254Digest (big-endian 32 bytes) to an Fp element.
#[inline]
fn digest_to_fp(d: &Bn254Digest) -> Fp {
    Fp::from_be_bytes(&d.to_bytes32())
}

/// Convert an Fp element to a Bn254Digest (big-endian 32 bytes).
#[inline]
fn fp_to_digest(fp: &Fp) -> Bn254Digest {
    Bn254Digest::from_bytes32(&fp.to_be_bytes())
}

// ---- ECDSA secp256k1 verification via k256 ----
//
// SP1 patches the sha2 crate to use syscall_sha256_extend/compress, so
// the SHA-256 hash inside ECDSA verification is precompile-accelerated.
// The secp256k1 scalar multiplication uses k256's pure-Rust arithmetic
// (SP1's secp256k1 EC precompiles require a patched k256 crate not yet
// available as a cargo dependency, but the sha2 acceleration is free).
//
// Protocol:
//   - pubkey_x / pubkey_y: big-endian 32-byte secp256k1 affine coordinates
//     (truncated/padded from Bn254Digest::to_bytes32())
//   - sig: 64 bytes = r (32 BE) || s (32 BE), low-S normalised
//   - msg: raw bytes, hashed with SHA-256 inside VerifyingKey::verify()

fn secp256k1_ecdsa_verify(
    pubkey_x: &Bn254Digest,
    pubkey_y: &Bn254Digest,
    sig: &[u8; 64],
    msg: &[u8],
) -> bool {
    use k256::ecdsa::{signature::Verifier, Signature, VerifyingKey};
    use k256::{EncodedPoint, FieldBytes};

    // Build uncompressed point from the 32-byte big-endian x and y coordinates.
    let x_arr = pubkey_x.to_bytes32();
    let y_arr = pubkey_y.to_bytes32();
    let x_fb = FieldBytes::clone_from_slice(&x_arr);
    let y_fb = FieldBytes::clone_from_slice(&y_arr);
    let encoded = EncodedPoint::from_affine_coordinates(&x_fb, &y_fb, false);

    let verifying_key = match VerifyingKey::from_encoded_point(&encoded) {
        Ok(k) => k,
        Err(_) => return false,
    };

    let signature = match Signature::try_from(sig.as_slice()) {
        Ok(s) => s,
        Err(_) => return false,
    };

    // VerifyingKey::verify hashes msg with SHA-256 (precompile-accelerated on SP1)
    // then performs the ECDSA check.
    verifying_key.verify(msg, &signature).is_ok()
}

// ---- Poseidon2 sponge keystream encryption ----
//
// Uses the BN254 Fp Poseidon2 permutation (precompile-accelerated) in
// counter-mode to produce a keystream XOR'd with plaintext.
//
// State layout: [counter_lo, counter_hi, key_fp, iv_fp]
//   - key_fp: key bytes zero-padded to 32 bytes → Fp element
//   - iv_fp:  iv bytes zero-padded to 32 bytes → Fp element
//   - counter: block index (increments per 96-byte keystream block)
//
// Per block: permute(state), squeeze state[0..2] (96 bytes), XOR with plaintext.
// Ciphertext length == plaintext length.

fn poseidon2_keystream_encrypt(plaintext: &[u8], key: &[u8; 16], iv: &[u8; 16]) -> Vec<u8> {
    // Pack key and iv into Fp elements (zero-padded to 32 bytes, big-endian).
    let mut key_bytes32 = [0u8; 32];
    key_bytes32[..16].copy_from_slice(key);
    let mut iv_bytes32 = [0u8; 32];
    iv_bytes32[..16].copy_from_slice(iv);
    let key_fp = Fp::from_be_bytes(&key_bytes32);
    let iv_fp  = Fp::from_be_bytes(&iv_bytes32);

    let mut ciphertext = Vec::with_capacity(plaintext.len());
    let mut block_idx: u64 = 0;
    let mut offset = 0usize;

    while offset < plaintext.len() {
        // State for this block: [counter_lo, counter_hi, key, iv]
        let mut state = [
            Fp::from_u64(block_idx),
            Fp::ZERO,
            key_fp,
            iv_fp,
        ];
        permutation(&mut state);

        // Squeeze 96 bytes from rate lanes [0..2].
        let mut keystream = [0u8; 96];
        keystream[0..32].copy_from_slice(&state[0].to_be_bytes());
        keystream[32..64].copy_from_slice(&state[1].to_be_bytes());
        keystream[64..96].copy_from_slice(&state[2].to_be_bytes());

        // XOR up to 96 bytes.
        let block_len = core::cmp::min(96, plaintext.len() - offset);
        for i in 0..block_len {
            ciphertext.push(plaintext[offset + i] ^ keystream[i]);
        }

        offset += block_len;
        block_idx += 1;
    }

    ciphertext
}
