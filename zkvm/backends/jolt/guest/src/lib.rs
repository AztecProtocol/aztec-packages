#![cfg_attr(feature = "guest", no_std)]
extern crate alloc;

mod crypto;

use crypto::precompiles::JoltPrecompiles;
use zkvm_test_contracts::runner::{self, Workload};
use zkvm_test_contracts::runner_inline;

/// Jolt guest: runs workload with REAL BN254 Poseidon2.
///
/// workload_id encoding:
///   0-4: batched kernel (original)
///   128+0 to 128+4: inline kernel
#[jolt::provable(
    heap_size = 4194304,
    max_trace_length = 67108864,
    stack_size = 1048576,
    max_input_size = 64,
    max_output_size = 131072,
)]
fn process_workload(workload_id: u8) -> alloc::vec::Vec<u8> {
    let inline = workload_id >= 128;
    let workload = Workload::from_u8(workload_id & 0x7F);

    let kpi = if inline {
        runner_inline::run_workload_inline::<JoltPrecompiles>(workload)
    } else {
        runner::run_workload_end_to_end::<JoltPrecompiles>(workload)
    }
    .expect("kernel assembly failed");

    postcard::to_allocvec(&kpi).expect("serialize kpi")
}
