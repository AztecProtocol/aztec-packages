use serde::{Deserialize, Serialize};
use std::path::Path;

/// Identifies a benchmark workload.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WorkloadId {
    /// Single function, 1 note hash, 1 nullifier. No FPC, no authwit.
    Minimal,
    /// Realistic token transfer: account entrypoint → FPC fee payment (with
    /// authwit) → token.transfer (2 nullifiers, 2 note hashes, 1 log).
    TokenTransfer,
    /// Private swap (AMM add_liquidity): account → FPC → token0.transfer_to_public
    /// (authwit) → token1.transfer_to_public (authwit) → amm enqueue.
    /// 5 nullifiers, 2 note hashes, 4 public calls.
    PrivateSwap,
    /// Stress test: 16 note hashes, 16 nullifiers, 8 logs, 2 public calls.
    Heavy,
    /// Kernel stress: 32 transient note-nullifier pairs (all squashable).
    KernelHeavy,
}

impl WorkloadId {
    pub fn all() -> &'static [WorkloadId] {
        &[
            WorkloadId::Minimal,
            WorkloadId::TokenTransfer,
            WorkloadId::PrivateSwap,
            WorkloadId::Heavy,
            WorkloadId::KernelHeavy,
        ]
    }

    pub fn name(&self) -> &'static str {
        match self {
            WorkloadId::Minimal => "minimal",
            WorkloadId::TokenTransfer => "token_transfer",
            WorkloadId::PrivateSwap => "private_swap",
            WorkloadId::Heavy => "heavy",
            WorkloadId::KernelHeavy => "kernel_heavy",
        }
    }
}

/// Platform the benchmark ran on.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum Platform {
    NativeX86,
    NativeArm,
    WasmBrowser,
    WasmMobile,
    DockerConstrained { profile: String },
}

/// Result of running one benchmark workload on one backend.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub backend_name: String,
    pub workload: WorkloadId,
    pub platform: Platform,
    pub preflight_ms: u64,
    pub witness_generation_ms: u64,
    pub proof_generation_ms: u64,
    pub total_proving_ms: u64,
    pub peak_memory_bytes: u64,
    pub proof_size_bytes: u64,
    pub verification_ms: u64,
    pub cycle_count: Option<u64>,
    pub precompile_hit_rate: Option<f64>,
}

/// Trait for backends that can run benchmark workloads.
pub trait BenchmarkableBackend {
    fn name(&self) -> &str;
    fn run_workload(&self, workload: WorkloadId) -> BenchmarkResult;
}

/// Get current process peak RSS (high-water mark) in bytes.
///
/// Reads VmHWM from /proc/self/status on Linux, which is the kernel-tracked
/// peak resident set size since process start. This is monotonically increasing
/// and correctly captures the maximum RAM used during any prior operation
/// (e.g., proof generation). Call after the operation completes to get its peak.
///
/// Falls back to sysinfo current RSS on non-Linux platforms (less accurate).
pub fn peak_memory_bytes() -> u64 {
    // Linux: read VmHWM (peak RSS high-water mark) from /proc/self/status.
    // This is the kernel-tracked peak and is monotonically non-decreasing.
    #[cfg(target_os = "linux")]
    if let Ok(status) = std::fs::read_to_string("/proc/self/status") {
        for line in status.lines() {
            if line.starts_with("VmHWM:") {
                if let Some(kb_str) = line.split_whitespace().nth(1) {
                    if let Ok(kb) = kb_str.parse::<u64>() {
                        return kb * 1024;
                    }
                }
            }
        }
    }

    // Non-Linux fallback: current RSS via sysinfo (not peak, but best available).
    let sys = sysinfo::System::new_all();
    let pid = sysinfo::get_current_pid().unwrap_or(sysinfo::Pid::from(0));
    sys.process(pid).map(|p| p.memory()).unwrap_or(0)
}

/// Format benchmark results as an ASCII table.
pub fn format_results_table(results: &[BenchmarkResult]) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "{:<15} {:<15} {:>12} {:>12} {:>12} {:>10} {:>12}\n",
        "Backend", "Workload", "Total(ms)", "Proof(ms)", "Memory(MB)", "Proof(B)", "Cycles"
    ));
    out.push_str(&"-".repeat(100));
    out.push('\n');

    for r in results {
        out.push_str(&format!(
            "{:<15} {:<15} {:>12} {:>12} {:>12.1} {:>10} {:>12}\n",
            r.backend_name,
            r.workload.name(),
            r.total_proving_ms,
            r.proof_generation_ms,
            r.peak_memory_bytes as f64 / 1_048_576.0,
            r.proof_size_bytes,
            r.cycle_count.map(|c| c.to_string()).unwrap_or_else(|| "N/A".into()),
        ));
    }

    out
}

/// Write results as JSON to a file.
pub fn write_results_json(results: &[BenchmarkResult], path: &Path) {
    let json = serde_json::to_string_pretty(results).expect("serialize results");
    std::fs::write(path, json).expect("write results file");
}

/// Write results as CSV to a file.
pub fn write_results_csv(results: &[BenchmarkResult], path: &Path) {
    let mut csv = String::new();
    csv.push_str("backend,workload,total_ms,proof_ms,witness_ms,memory_bytes,proof_bytes,verify_ms,cycles\n");
    for r in results {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{}\n",
            r.backend_name,
            r.workload.name(),
            r.total_proving_ms,
            r.proof_generation_ms,
            r.witness_generation_ms,
            r.peak_memory_bytes,
            r.proof_size_bytes,
            r.verification_ms,
            r.cycle_count.unwrap_or(0),
        ));
    }
    std::fs::write(path, csv).expect("write results CSV");
}
