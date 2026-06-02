use std::time::Instant;

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

fn main() {
    tracing_subscriber::fmt::init();

    let target_dir = "/tmp/jolt-guest-targets";
    let mut program = guest::compile_process_workload(target_dir);
    let shared = guest::preprocess_shared_process_workload(&mut program).unwrap();
    let prover_preprocessing = guest::preprocess_prover_process_workload(shared.clone());
    let verifier_setup = prover_preprocessing.generators.to_verifier_setup();
    let verifier_preprocessing = guest::preprocess_verifier_process_workload(shared, verifier_setup, None);

    let prove = guest::build_prover_process_workload(program, prover_preprocessing);
    let verify = guest::build_verifier_process_workload(verifier_preprocessing);

    let names = ["minimal", "token_transfer", "private_swap"];

    println!("=== BATCHED KERNEL ===");
    for (id, name) in names.iter().enumerate() {
        let start = Instant::now();
        let (output, proof, io_device) = prove(id as u8);
        let prove_ms = start.elapsed().as_millis();
        let cycles = proof.trace_length;
        let peak_mb = peak_rss_bytes() as f64 / 1_048_576.0;
        let verify_start = Instant::now();
        let valid = verify(id as u8, output, io_device.panic, proof);
        let verify_ms = verify_start.elapsed().as_millis();
        println!("  {}: {} cycles, {}ms proving, {:.0}MB RAM, {}ms verify, valid: {}", name, cycles, prove_ms, peak_mb, verify_ms, valid);
    }

    println!("\n=== INLINE KERNEL ===");
    for (id, name) in names.iter().enumerate() {
        let inline_id = 128 + id as u8;
        let start = Instant::now();
        let (output, proof, io_device) = prove(inline_id);
        let prove_ms = start.elapsed().as_millis();
        let cycles = proof.trace_length;
        let peak_mb = peak_rss_bytes() as f64 / 1_048_576.0;
        let verify_start = Instant::now();
        let valid = verify(inline_id, output, io_device.panic, proof);
        let verify_ms = verify_start.elapsed().as_millis();
        println!("  {}: {} cycles, {}ms proving, {:.0}MB RAM, {}ms verify, valid: {}", name, cycles, prove_ms, peak_mb, verify_ms, valid);
    }
}
