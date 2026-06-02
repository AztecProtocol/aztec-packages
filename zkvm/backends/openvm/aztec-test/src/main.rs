extern crate alloc;

use core::ops::{Add, Neg};

use hex_literal::hex;
use openvm::io::{read, reveal_u32};
use openvm_algebra_guest::moduli_macros::moduli_declare;
use openvm_ecc_guest::{
    weierstrass::{CachedMulTable, IntrinsicCurve},
    CyclicGroup, Group,
};
use openvm_ecc_sw_macros::sw_declare;

mod openvm_precompiles;

use openvm_precompiles::OpenVmPrecompiles;
use zkvm_test_contracts::runner::{self, Workload};

// ── BN254 scalar field (index 0) ─────────────────────────────────────────────
// Used by Poseidon2. Must match openvm.toml index 0.
moduli_declare! {
    Bn254Fr { modulus = "21888242871839275222246405745257275088548364400416034343698204186575808495617" }
}

// ── secp256k1 coordinate field Fp (index 1) ──────────────────────────────────
// Used by EC point arithmetic in ECDSA verify.
moduli_declare! {
    Secp256k1Fp { modulus = "115792089237316195423570985008687907853269984665640564039457584007908834671663" }
}

// ── secp256k1 scalar field Fr (index 2) ──────────────────────────────────────
// Used for scalar operations (s⁻¹, u₁, u₂) in ECDSA verify.
moduli_declare! {
    Secp256k1Fr { modulus = "115792089237316195423570985008687907852837564279074904382605163141518161494337" }
}

// ── secp256k1 affine point type ───────────────────────────────────────────────
// y² = x³ + 7  (a=0, b=7)
const SECP256K1_B: Secp256k1Fp = Secp256k1Fp::from_const_bytes({
    let mut b = [0u8; 32];
    b[0] = 7;
    b
});

sw_declare! {
    Secp256k1Point { mod_type = Secp256k1Fp, b = SECP256K1_B }
}

// ── secp256k1 ZST for IntrinsicCurve ─────────────────────────────────────────
#[derive(Copy, Clone, Debug, Default)]
pub struct Secp256k1;

impl CyclicGroup for Secp256k1Point {
    // Generator point G (little-endian x, y from https://en.bitcoin.it/wiki/Secp256k1)
    const GENERATOR: Self = Secp256k1Point {
        x: Secp256k1Fp::from_const_bytes(hex!(
            "9817F8165B81F259D928CE2DDBFC9B02070B87CE9562A055ACBBDCF97E66BE79"
        )),
        y: Secp256k1Fp::from_const_bytes(hex!(
            "B8D410FB8FD0479C195485A648B417FDA808110EFCFBA45D65C4A32677DA3A48"
        )),
    };
    const NEG_GENERATOR: Self = Secp256k1Point {
        x: Secp256k1Fp::from_const_bytes(hex!(
            "9817F8165B81F259D928CE2DDBFC9B02070B87CE9562A055ACBBDCF97E66BE79"
        )),
        // neg y = p - y
        y: Secp256k1Fp::from_const_bytes(hex!(
            "7727EF046F2FB863E6AB7A59B74BE80257F7EEF103045BA29A3B5CD98825C5B7"
        )),
    };
}

impl IntrinsicCurve for Secp256k1 {
    type Scalar = Secp256k1Fr;
    type Point = Secp256k1Point;

    fn msm(coeffs: &[Secp256k1Fr], bases: &[Secp256k1Point]) -> Secp256k1Point
    where
        for<'a> &'a Secp256k1Point: Add<&'a Secp256k1Point, Output = Secp256k1Point>,
    {
        if coeffs.len() < 25 {
            let table = CachedMulTable::<Self>::new_with_prime_order(bases, 4);
            table.windowed_mul(coeffs)
        } else {
            openvm_ecc_guest::msm(coeffs, bases)
        }
    }
}

// Initialize OpenVM runtime (sets up modular arithmetic and ECC dispatch tables).
openvm::init!();

fn main() {
    let workload_id: u8 = read();

    let workload = Workload::from_u8(workload_id);
    let kpi = runner::run_workload_end_to_end::<OpenVmPrecompiles>(workload)
        .expect("workload failed");

    // Reveal a summary byte to prove execution completed
    let kpi_bytes = postcard::to_allocvec(&kpi).expect("serialize");
    reveal_u32(kpi_bytes.len() as u32, 0);
    reveal_u32(workload_id as u32, 1);
}
