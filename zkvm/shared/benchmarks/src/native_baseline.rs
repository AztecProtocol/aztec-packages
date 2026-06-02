use std::time::Instant;

use zkvm_data_types::precompiles::NativePrecompiles;

use crate::harness::*;
use crate::workloads;

/// Native (non-proven) baseline: runs test contracts + kernel logic natively.
/// Uses the stub NativePrecompiles (XOR hash). For real crypto benchmarking,
/// use Bn254Precompiles from zkvm-crypto-bn254.
pub struct NativeBaseline;

impl BenchmarkableBackend for NativeBaseline {
    fn name(&self) -> &str {
        "native-stub"
    }

    fn run_workload(&self, workload: WorkloadId) -> BenchmarkResult {
        let start = Instant::now();
        let _kpi = workloads::run_workload::<NativePrecompiles>(workload)
            .expect("kernel assembly failed");
        let elapsed = start.elapsed();

        BenchmarkResult {
            backend_name: self.name().into(),
            workload,
            platform: Platform::NativeX86,
            preflight_ms: 0,
            witness_generation_ms: elapsed.as_millis() as u64,
            proof_generation_ms: 0,
            total_proving_ms: elapsed.as_millis() as u64,
            peak_memory_bytes: peak_memory_bytes(),
            proof_size_bytes: 0,
            verification_ms: 0,
            cycle_count: None,
            precompile_hit_rate: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_baseline_runs_all_workloads() {
        let baseline = NativeBaseline;
        for workload in WorkloadId::all() {
            let result = baseline.run_workload(*workload);
            assert_eq!(result.backend_name, "native-stub");
        }
    }

    #[test]
    fn native_baseline_format_results() {
        let baseline = NativeBaseline;
        let results: Vec<_> = WorkloadId::all()
            .iter()
            .map(|w| baseline.run_workload(*w))
            .collect();
        let table = format_results_table(&results);
        assert!(table.contains("native-stub"));
        assert!(table.contains("minimal"));
    }
}
