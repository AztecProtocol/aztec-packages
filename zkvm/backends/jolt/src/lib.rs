use std::time::Instant;

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

/// Returns (cycles, prove_ms, peak_memory_bytes, verify_ms).
pub fn prove_workload(workload_id: u8) -> (u64, u64, u64, u64) {
    let target_dir = "/tmp/jolt-guest-targets";

    let mut program = guest::compile_process_workload(target_dir);
    let shared = guest::preprocess_shared_process_workload(&mut program)
        .expect("preprocessing failed");
    let prover_preprocessing =
        guest::preprocess_prover_process_workload(shared.clone());
    let verifier_setup = prover_preprocessing.generators.to_verifier_setup();
    let verifier_preprocessing =
        guest::preprocess_verifier_process_workload(shared, verifier_setup, None);

    let prove = guest::build_prover_process_workload(
        program, prover_preprocessing,
    );
    let verify = guest::build_verifier_process_workload(verifier_preprocessing);

    // Prove
    let _rss_before = peak_rss_bytes();
    let start = Instant::now();
    let (output, proof, io_device) = prove(workload_id);
    let prove_ms = start.elapsed().as_millis() as u64;
    let rss_after = peak_rss_bytes();
    let cycles = proof.trace_length as u64;

    // Verify
    let verify_start = Instant::now();
    let valid = verify(workload_id, output, io_device.panic, proof);
    let verify_ms = verify_start.elapsed().as_millis() as u64;
    assert!(valid, "proof verification failed");

    (cycles, prove_ms, rss_after, verify_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jolt_prove_minimal() {
        let (cycles, prove_ms, peak_mem, verify_ms) = prove_workload(0);
        let peak_mb = peak_mem as f64 / 1_048_576.0;
        println!("Jolt minimal: {} cycles, {}ms proving, {:.1}MB peak RAM, {}ms verify", cycles, prove_ms, peak_mb, verify_ms);
        assert!(cycles > 0);
    }

    #[test]
    fn jolt_prove_all_workloads() {
        let names = ["minimal", "token_transfer", "private_swap", "heavy", "kernel_heavy"];
        for (id, name) in names.iter().enumerate() {
            let (cycles, prove_ms, peak_mem, verify_ms) = prove_workload(id as u8);
            let peak_mb = peak_mem as f64 / 1_048_576.0;
            println!(
                "Jolt {}: {} cycles, {}ms proving, {:.1}MB peak RAM, {}ms verify",
                name, cycles, prove_ms, peak_mb, verify_ms
            );
            assert!(cycles > 0);
        }
    }
}
