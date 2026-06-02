use wasm_bindgen::prelude::*;
use zkvm_data_types::precompiles::NativePrecompiles;
use zkvm_test_contracts::runner::{self, Workload};

/// zkWASM guest entry point.
///
/// Reads a workload ID from public input, runs the workload with
/// NativePrecompiles (XOR stub for now), and outputs the result.
///
/// The key difference from RISC-V backends: this compiles to WASM
/// and runs inside zkWASM's ZKSNARK circuits. The WASM execution
/// itself is what gets proven — no separate VM layer.
#[wasm_bindgen]
pub fn zkmain() {
    // Read workload ID from public input
    let workload_id = unsafe { zkwasm_rust_sdk::wasm_input(0) } as u8;

    let workload = Workload::from_u8(workload_id);
    let kpi = runner::run_workload_end_to_end::<NativePrecompiles>(workload)
        .expect("kernel assembly failed");

    // Output a hash of the result as public output
    let kpi_bytes = postcard::to_allocvec(&kpi).expect("serialize kpi");
    let len = kpi_bytes.len() as u64;
    unsafe { zkwasm_rust_sdk::wasm_output(len) };
}
