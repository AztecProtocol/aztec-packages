use std::time::Instant;

use sp1_sdk::blocking::{CpuProver, Elf, ProveRequest, Prover, ProverClient, SP1Stdin};
use sp1_sdk::ProvingKey as _;
use zkvm_benchmarks::harness::*;

/// Read peak RSS (VmHWM) from /proc/self/status (Linux-specific).
fn peak_rss_bytes() -> u64 {
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
    0
}

/// The compiled SP1 guest ELF binary.
/// Built by `cargo prove build` in backends/sp1/guest/.
const GUEST_ELF: &[u8] = include_bytes!(
    "../../guest/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/zkvm-sp1-guest"
);

pub struct Sp1Backend {
    client: CpuProver,
}

impl Sp1Backend {
    pub fn new() -> Self {
        Self {
            client: ProverClient::builder().cpu().build(),
        }
    }

    fn workload_to_u8(workload: WorkloadId) -> u8 {
        match workload {
            WorkloadId::Minimal => 0,
            WorkloadId::TokenTransfer => 1,
            WorkloadId::PrivateSwap => 2,
            WorkloadId::Heavy => 3,
            WorkloadId::KernelHeavy => 4,
        }
    }

    /// Convert workload to SHA-256 mode ID (offset by 128).
    fn workload_to_sha256_u8(workload: WorkloadId) -> u8 {
        Self::workload_to_u8(workload) + 128
    }

    /// Execute the guest without generating a proof. Returns (cycles, elapsed_ms).
    pub fn execute_only(&self, workload: WorkloadId) -> (u64, u64) {
        let mut stdin = SP1Stdin::new();
        stdin.write(&Self::workload_to_u8(workload));

        let start = Instant::now();
        let result = self.client
            .execute(Elf::Static(GUEST_ELF), stdin)
            .run()
            .expect("SP1 execution failed");
        let elapsed_ms = start.elapsed().as_millis() as u64;
        let cycles = result.1.total_instruction_count();
        (cycles, elapsed_ms)
    }

    /// Execute the guest in SHA-256 mode without generating a proof. Returns (cycles, elapsed_ms).
    pub fn execute_only_sha256(&self, workload: WorkloadId) -> (u64, u64) {
        let mut stdin = SP1Stdin::new();
        stdin.write(&Self::workload_to_sha256_u8(workload));

        let start = Instant::now();
        let result = self.client
            .execute(Elf::Static(GUEST_ELF), stdin)
            .run()
            .expect("SP1 execution failed (sha256 mode)");
        let elapsed_ms = start.elapsed().as_millis() as u64;
        let cycles = result.1.total_instruction_count();
        (cycles, elapsed_ms)
    }

    /// Generate an actual proof. Returns (cycles, prove_ms, proof_size_bytes, peak_memory_bytes, verify_ms).
    pub fn prove_workload(&self, workload: WorkloadId) -> (u64, u64, u64, u64, u64) {
        self.prove_workload_raw(Self::workload_to_u8(workload))
    }

    /// Generate an actual proof in SHA-256 mode. Returns (cycles, prove_ms, proof_size_bytes, peak_memory_bytes, verify_ms).
    pub fn prove_workload_sha256(&self, workload: WorkloadId) -> (u64, u64, u64, u64, u64) {
        self.prove_workload_raw(Self::workload_to_sha256_u8(workload))
    }

    /// Internal: prove with a raw workload byte. Returns (cycles, prove_ms, proof_size_bytes, peak_memory_bytes, verify_ms).
    fn prove_workload_raw(&self, raw_id: u8) -> (u64, u64, u64, u64, u64) {
        let mut stdin = SP1Stdin::new();
        stdin.write(&raw_id);

        // First execute to get cycle count
        let mut exec_stdin = SP1Stdin::new();
        exec_stdin.write(&raw_id);
        let exec_result = self.client
            .execute(Elf::Static(GUEST_ELF), exec_stdin)
            .run()
            .expect("SP1 execution failed");
        let cycles = exec_result.1.total_instruction_count();

        // Setup proving/verifying keys
        let elf = Elf::Static(GUEST_ELF);
        let pk = self.client.setup(elf).expect("SP1 setup failed");
        let vk = pk.verifying_key().clone();

        // Generate proof (default mode = core, fastest proof type)
        let _rss_before = peak_rss_bytes();
        let prove_start = Instant::now();
        let proof = self.client.prove(&pk, stdin)
            .run()
            .expect("SP1 proving failed");
        let prove_ms = prove_start.elapsed().as_millis() as u64;
        let rss_after = peak_rss_bytes();

        // Core proofs don't support bytes() serialization (only Plonk/Groth16 do).
        // For proof size measurement, we'd need to use compressed/plonk mode.
        let proof_bytes = 0u64;

        // Verify
        let verify_start = Instant::now();
        self.client.verify(&proof, &vk, None).expect("SP1 verification failed");
        let verify_ms = verify_start.elapsed().as_millis() as u64;

        (cycles, prove_ms, proof_bytes, rss_after, verify_ms)
    }
}

impl BenchmarkableBackend for Sp1Backend {
    fn name(&self) -> &str {
        "sp1-v6"
    }

    fn run_workload(&self, workload: WorkloadId) -> BenchmarkResult {
        // Run a full prove (not just execute) so that proof_generation_ms and
        // peak_memory_bytes reflect actual proving overhead.
        let (cycles, prove_ms, proof_bytes, peak_mem, verify_ms) =
            self.prove_workload(workload);

        BenchmarkResult {
            backend_name: self.name().into(),
            workload,
            platform: Platform::NativeX86,
            preflight_ms: 0,
            witness_generation_ms: 0,
            proof_generation_ms: prove_ms,
            total_proving_ms: prove_ms,
            peak_memory_bytes: peak_mem,
            proof_size_bytes: proof_bytes,
            verification_ms: verify_ms,
            cycle_count: Some(cycles),
            precompile_hit_rate: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sp1_execute_minimal() {
        let backend = Sp1Backend::new();
        let (cycles, ms) = backend.execute_only(WorkloadId::Minimal);
        println!("SP1 execute minimal: {} cycles, {}ms", cycles, ms);
        assert!(cycles > 0);
    }

    #[test]
    fn sp1_prove_minimal() {
        let backend = Sp1Backend::new();
        let (cycles, prove_ms, _proof_bytes, peak_mem, verify_ms) = backend.prove_workload(WorkloadId::Minimal);
        let peak_mb = peak_mem as f64 / 1_048_576.0;
        println!(
            "SP1 PROVE minimal: {} cycles, {}ms proving, {:.1}MB peak RAM, {}ms verify",
            cycles, prove_ms, peak_mb, verify_ms
        );
        assert!(cycles > 0);
    }

    #[test]
    fn sp1_prove_key_workloads() {
        let backend = Sp1Backend::new();
        for workload in [WorkloadId::Minimal, WorkloadId::TokenTransfer, WorkloadId::PrivateSwap] {
            let (cycles, prove_ms, _proof_bytes, peak_mem, verify_ms) = backend.prove_workload(workload);
            let peak_mb = peak_mem as f64 / 1_048_576.0;
            println!(
                "SP1 PROVE {}: {} cycles, {}ms proving, {:.1}MB peak RAM, {}ms verify",
                workload.name(), cycles, prove_ms, peak_mb, verify_ms
            );
        }
    }

    #[test]
    fn sp1_execute_sha256_minimal() {
        let backend = Sp1Backend::new();
        let (cycles, ms) = backend.execute_only_sha256(WorkloadId::Minimal);
        println!("SP1 SHA-256 execute minimal: {} cycles, {}ms", cycles, ms);
        assert!(cycles > 0);
    }

    #[test]
    fn sp1_prove_sha256_key_workloads() {
        let backend = Sp1Backend::new();
        for workload in [WorkloadId::Minimal, WorkloadId::TokenTransfer, WorkloadId::PrivateSwap] {
            let (cycles, prove_ms, _proof_bytes, peak_mem, verify_ms) = backend.prove_workload_sha256(workload);
            let peak_mb = peak_mem as f64 / 1_048_576.0;
            println!(
                "SP1 SHA-256 PROVE {}: {} cycles, {}ms proving, {:.1}MB peak RAM, {}ms verify",
                workload.name(), cycles, prove_ms, peak_mb, verify_ms
            );
        }
    }

    #[test]
    fn sp1_compare_poseidon2_vs_sha256() {
        let backend = Sp1Backend::new();
        println!("\n=== SP1 Poseidon2 vs SHA-256 Comparison ===\n");
        println!("{:<20} {:>15} {:>15} {:>10}", "Workload", "Poseidon2", "SHA-256", "Ratio");
        println!("{:<20} {:>15} {:>15} {:>10}", "", "(cycles)", "(cycles)", "(P/S)");
        println!("{:-<65}", "");
        for workload in [WorkloadId::Minimal, WorkloadId::TokenTransfer, WorkloadId::PrivateSwap] {
            let (p_cycles, _) = backend.execute_only(workload);
            let (s_cycles, _) = backend.execute_only_sha256(workload);
            let ratio = p_cycles as f64 / s_cycles as f64;
            println!(
                "{:<20} {:>15} {:>15} {:>9.2}x",
                workload.name(), p_cycles, s_cycles, ratio
            );
        }
        println!();
    }

    #[test]
    fn sp1_prove_native_poseidon2() {
        let client = ProverClient::builder().cpu().build();
        let names = ["minimal", "token_transfer", "private_swap"];
        for (id, name) in names.iter().enumerate() {
            let mut stdin = SP1Stdin::new();
            // Mode 2 (native poseidon2) = 128 + workload_id
            stdin.write(&(128u8 + id as u8));

            let mut exec_stdin = SP1Stdin::new();
            exec_stdin.write(&(128u8 + id as u8));
            let exec_result = client.execute(Elf::Static(GUEST_ELF), exec_stdin).run().expect("exec failed");
            let cycles = exec_result.1.total_instruction_count();

            let _rss_before = peak_rss_bytes();
            let pk = client.setup(Elf::Static(GUEST_ELF)).expect("setup failed");
            let vk = pk.verifying_key().clone();
            let prove_start = std::time::Instant::now();
            let proof = client.prove(&pk, stdin).run().expect("prove failed");
            let prove_ms = prove_start.elapsed().as_millis();
            let rss_after = peak_rss_bytes();

            let verify_start = std::time::Instant::now();
            client.verify(&proof, &vk, None).expect("verify failed");
            let verify_ms = verify_start.elapsed().as_millis();

            let peak_mb = rss_after as f64 / 1_048_576.0;
            println!(
                "SP1 NATIVE-POSEIDON2 {}: {} cycles, {}ms proving, {:.0}MB peak RAM, {}ms verify",
                name, cycles, prove_ms, peak_mb, verify_ms
            );
        }
    }
}
