// Host-side pre-flight execution and hint generation.
// This crate uses std — it runs on the host, not inside the zkVM.
//
// Phase 6: execute tx natively, collect oracle responses, generate kernel hints,
// package into TxExecutionBundle.
