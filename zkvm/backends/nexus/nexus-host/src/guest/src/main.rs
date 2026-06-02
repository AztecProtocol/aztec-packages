#![cfg_attr(target_arch = "riscv32", no_std, no_main)]
extern crate alloc;

mod crypto;

use crypto::precompiles::NexusPoseidon2Precompiles;
use zkvm_test_contracts::runner::{self, Workload};

#[nexus_rt::main]
#[nexus_rt::public_input(workload_id)]
fn main(workload_id: u8) {
    let workload = Workload::from_u8(workload_id);
    let kpi = runner::run_workload_end_to_end::<NexusPoseidon2Precompiles>(workload)
        .expect("kernel assembly failed");
    let kpi_bytes = postcard::to_allocvec(&kpi).expect("serialize");
    assert!(kpi_bytes.len() > 0);
}
