use std::time::Instant;
use nexus_sdk::{
    compile::{cargo::CargoPackager, Compile, Compiler},
    stwo::seq::Stwo,
    ByGuestCompilation, Local, Prover, Verifiable, Viewable,
};

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

const PACKAGE: &str = "guest";

fn main() {
    println!("Compiling guest...");
    let compile_start = Instant::now();
    let mut compiler = Compiler::<CargoPackager>::new(PACKAGE);
    let prover: Stwo<Local> = Stwo::compile(&mut compiler).expect("compile failed");
    println!("Compiled in {}ms", compile_start.elapsed().as_millis());

    let elf = prover.elf.clone();

    let names = ["minimal", "token_transfer", "private_swap"];
    for (id, name) in names.iter().enumerate() {
        println!("\n--- {} ---", name);

        // Need a fresh prover for each workload (prove consumes self)
        let fresh_prover = Stwo::<Local>::new(&elf).expect("new prover");

        let start = Instant::now();
        let (view, proof) = fresh_prover
            .prove_with_input(&(), &(id as u8))
            .expect("prove failed");
        let prove_ms = start.elapsed().as_millis();
        let peak_mb = peak_rss_bytes() as f64 / 1_048_576.0;

        let exit_code = view.exit_code().expect("exit code");
        if exit_code != 0 {
            println!("  FAILED (exit code {})", exit_code);
            continue;
        }

        let verify_start = Instant::now();
        proof.verify_expected::<u8, ()>(
            &(id as u8), exit_code, &(), &elf, &[],
        ).expect("verify failed");
        let verify_ms = verify_start.elapsed().as_millis();

        let proof_size = proof.size_estimate();
        println!("  {}ms proving, {:.0}MB peak RAM, {}ms verify, ~{}KB proof",
            prove_ms, peak_mb, verify_ms, proof_size / 1024);
    }
}
