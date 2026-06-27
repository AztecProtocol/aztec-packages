#pragma once

#include "barretenberg/vm2/common/avm_io.hpp"
#include "vm2_contracts/test_executor_metrics.hpp"

// Proving helpers for the contract proving tests (the C++ port of yarn-project's avm_proving_tests).
// They take a TxSimulationResult produced with `proving_config()` (which collects the hints and
// public inputs proving needs) and run it through the AVM prover via the standard `AvmAPI`, mirroring
// the TS AvmProvingTester's check-circuit / prove+verify paths.
namespace bb::avm2::contracts {

// Simulation config that additionally collects the hints + public inputs required for proving
// (default_config() + collect_hints + collect_public_inputs), matching the TS provingConfig.
PublicSimulatorConfig proving_config();

// Runs check-circuit on a simulated tx's proving inputs. Returns whether the circuit checks pass.
// When `out_metrics` is non-null, the per-stage `bb::avm2::Stats` timings collected during the run are
// mapped into it (the same way the TS AvmProvingTester read the stats returned by bb.js checkAvmCircuit).
bool check_circuit(const TxSimulationResult& result, ProverMetrics* out_metrics = nullptr);

// Fully proves and verifies a simulated tx's proving inputs. Returns whether verification passes.
// When `out_metrics` is non-null, the per-stage `bb::avm2::Stats` timings are mapped into it.
bool prove_and_verify(const TxSimulationResult& result, ProverMetrics* out_metrics = nullptr);

} // namespace bb::avm2::contracts
