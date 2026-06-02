#![no_main]
sp1_zkvm::entrypoint!(main);

extern crate alloc;

mod sp1_poseidon2;
mod sp1_sha256;
mod sp1_native_poseidon2;

use sp1_poseidon2::Sp1Bn254Precompiles;
use sp1_sha256::Sp1Sha256Precompiles;
use sp1_native_poseidon2::Sp1NativePoseidon2Precompiles;
use zkvm_test_contracts::runner::{self, Workload};

/// Mode switch:
///   0..63: BN254 Poseidon2 via Fp precompiles
///   64..127: SHA-256 precompile
///   128..191: Native Poseidon2 precompile (KoalaBear field)
pub fn main() {
    let raw_id: u8 = sp1_zkvm::io::read();

    let mode = raw_id / 64;
    let workload_id = raw_id % 64;
    let workload = Workload::from_u8(workload_id);

    let kpi_bytes = match mode {
        0 => {
            let kpi = runner::run_workload_end_to_end::<Sp1Bn254Precompiles>(workload)
                .expect("failed (bn254 mode)");
            postcard::to_allocvec(&kpi).expect("serialize")
        }
        1 => {
            let kpi = runner::run_workload_end_to_end::<Sp1Sha256Precompiles>(workload)
                .expect("failed (sha256 mode)");
            postcard::to_allocvec(&kpi).expect("serialize")
        }
        _ => {
            let kpi = runner::run_workload_end_to_end::<Sp1NativePoseidon2Precompiles>(workload)
                .expect("failed (native poseidon2 mode)");
            postcard::to_allocvec(&kpi).expect("serialize")
        }
    };

    sp1_zkvm::io::commit_slice(&kpi_bytes);
}
