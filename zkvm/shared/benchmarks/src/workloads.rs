use zkvm_data_types::field::Digest;
use zkvm_data_types::kernel_output::{KernelError, KernelPublicInputs};
use zkvm_data_types::precompiles::Precompiles;
use zkvm_data_types::side_effects::ExecutionResult;
use zkvm_test_contracts::runner::{self, Workload};

use crate::harness::WorkloadId;

/// Map from benchmark WorkloadId to the shared runner Workload enum.
pub fn to_runner_workload(id: WorkloadId) -> Workload {
    match id {
        WorkloadId::Minimal => Workload::Minimal,
        WorkloadId::TokenTransfer => Workload::TokenTransfer,
        WorkloadId::PrivateSwap => Workload::PrivateSwap,
        WorkloadId::Heavy => Workload::Heavy,
        WorkloadId::KernelHeavy => Workload::KernelHeavy,
    }
}

/// Run a workload end-to-end using the shared runner.
/// Generic over P: Precompiles — each backend provides its own impl.
pub fn run_workload<P: Precompiles>(
    id: WorkloadId,
) -> Result<KernelPublicInputs<P::Digest>, KernelError> {
    runner::run_workload_end_to_end::<P>(to_runner_workload(id))
}
