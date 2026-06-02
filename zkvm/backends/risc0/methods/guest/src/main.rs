#![no_main]
#![no_std]

risc0_zkvm::guest::entry!(main);

extern crate alloc;

mod sha256_precompiles;
mod crypto;

use sha256_precompiles::Risc0Sha256Precompiles;
use crypto::precompiles::Risc0Bn254Precompiles;
use zkvm_test_contracts::runner::{self, Workload};

/// Mode switch:
///   0..63:   SHA-256 (RISC Zero native precompile — the interesting benchmark)
///   64..127: Software BN254 Poseidon2 (apples-to-apples with Nexus/Jolt)
pub fn main() {
    let raw_id: u8 = risc0_zkvm::guest::env::read();

    let mode = raw_id / 64;
    let workload_id = raw_id % 64;
    let workload = Workload::from_u8(workload_id);

    let kpi_bytes = match mode {
        0 => {
            let kpi = runner::run_workload_end_to_end::<Risc0Sha256Precompiles>(workload)
                .expect("failed (sha256 mode)");
            postcard::to_allocvec(&kpi).expect("serialize")
        }
        _ => {
            let kpi = runner::run_workload_end_to_end::<Risc0Bn254Precompiles>(workload)
                .expect("failed (bn254 mode)");
            postcard::to_allocvec(&kpi).expect("serialize")
        }
    };

    risc0_zkvm::guest::env::commit_slice(&kpi_bytes);
}
