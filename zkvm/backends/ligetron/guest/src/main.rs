// Ligetron WASI guest — wasm32-wasip1 target.
//
// Runs the full Aztec kernel workload inside Ligetron's WASM prover.
// Uses LigetronPrecompiles: real Poseidon2 hashing and sponge encryption
// via Ligetron's BN254 host function imports. EC/signature ops are stubbed
// (Ligetron has EdDSA/ECDSA but test fixtures use incompatible Schnorr).

mod ligetron_precompiles;

use ligetron_precompiles::LigetronPrecompiles;
use zkvm_test_contracts::runner::{Workload, run_workload_end_to_end};

fn main() {
    // Read workload ID from argv[1].
    // 0 = Minimal, 1 = TokenTransfer, 2 = PrivateSwap
    let workload_id: u8 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(2); // default to PrivateSwap

    let workload = Workload::from_u8(workload_id);

    let kpi = run_workload_end_to_end::<LigetronPrecompiles>(workload)
        .expect("kernel assembly failed");

    // Serialize and write result to stdout.
    let kpi_bytes = postcard::to_allocvec(&kpi).expect("serialize kpi");
    let len = kpi_bytes.len() as u32;
    std::io::Write::write_all(&mut std::io::stdout(), &len.to_le_bytes())
        .expect("write len");
    std::io::Write::write_all(&mut std::io::stdout(), &kpi_bytes)
        .expect("write kpi");
}
