#pragma once

#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::constraining {

// Computes the polynomials from the trace, and destroys it in the process.
AvmProver::ProverPolynomials compute_polynomials(tracegen::TraceContainer& trace);

} // namespace bb::avm2::constraining
