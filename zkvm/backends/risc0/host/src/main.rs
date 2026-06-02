use std::time::Instant;

use risc0_zkvm::{default_executor, default_prover, ExecutorEnv};

use risc0_methods::RISC0_GUEST_ELF;

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

/// Encode workload + mode into a single u8.
///   mode 0: SHA-256 precompile (raw_id = 0 + workload_id)
///   mode 1: BN254 Poseidon2 software (raw_id = 64 + workload_id)
fn make_id(mode: u8, workload_id: u8) -> u8 {
    mode * 64 + workload_id
}

fn execute_workload(raw_id: u8) -> (u64, u64) {
    let env = ExecutorEnv::builder()
        .write(&raw_id)
        .unwrap()
        .build()
        .unwrap();

    let executor = default_executor();
    let start = Instant::now();
    let session = executor.execute(env, RISC0_GUEST_ELF).unwrap();
    let elapsed_ms = start.elapsed().as_millis() as u64;
    let cycles = session.cycles() as u64;
    (cycles, elapsed_ms)
}

fn prove_workload(raw_id: u8) -> (u64, u64, u64, u64, u64) {
    // First execute to get cycle count
    let exec_env = ExecutorEnv::builder()
        .write(&raw_id)
        .unwrap()
        .build()
        .unwrap();
    let executor = default_executor();
    let session = executor.execute(exec_env, RISC0_GUEST_ELF).unwrap();
    let cycles = session.cycles() as u64;

    // Now prove
    let prove_env = ExecutorEnv::builder()
        .write(&raw_id)
        .unwrap()
        .build()
        .unwrap();

    let prover = default_prover();
    let _rss_before = peak_rss_bytes();
    let prove_start = Instant::now();
    let prove_info = prover
        .prove(prove_env, RISC0_GUEST_ELF)
        .unwrap();
    let prove_ms = prove_start.elapsed().as_millis() as u64;
    let rss_after = peak_rss_bytes();

    let receipt = prove_info.receipt;

    // Verify
    let verify_start = Instant::now();
    receipt.verify(risc0_methods::RISC0_GUEST_ID).unwrap();
    let verify_ms = verify_start.elapsed().as_millis() as u64;

    (cycles, prove_ms, 0, rss_after, verify_ms)
}

fn main() {
    let names = ["minimal", "token_transfer", "private_swap"];
    let modes: &[(&str, u8)] = &[
        ("SHA-256", 0),
        // ("BN254-Poseidon2", 1),  // Uncomment to benchmark software BN254 (slow on rv32)
    ];

    for (mode_name, mode_id) in modes {
        println!("\n=== RISC Zero {} ===\n", mode_name);

        // Execute-only pass (fast, get cycle counts)
        println!("--- Execute only ---");
        for (wl_id, name) in names.iter().enumerate() {
            let raw_id = make_id(*mode_id, wl_id as u8);
            let (cycles, ms) = execute_workload(raw_id);
            println!("  {}: {} cycles, {}ms", name, cycles, ms);
        }

        // Prove + verify pass
        println!("\n--- Prove + Verify ---");
        for (wl_id, name) in names.iter().enumerate() {
            let raw_id = make_id(*mode_id, wl_id as u8);
            let (cycles, prove_ms, _, peak_mem, verify_ms) = prove_workload(raw_id);
            let peak_mb = peak_mem as f64 / 1_048_576.0;
            println!(
                "  {}: {} cycles, {}ms proving, {:.0}MB peak RAM, {}ms verify",
                name, cycles, prove_ms, peak_mb, verify_ms
            );
        }
    }
}
