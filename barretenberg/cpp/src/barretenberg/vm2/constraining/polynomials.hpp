#pragma once

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"
#include "barretenberg/vm2/constraining/prover.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::constraining {

// Computes the polynomials from the trace, and destroys it in the process.
AvmProver::ProverPolynomials compute_polynomials(tracegen::TraceContainer& trace);

// In our lookups and permutations, the inverses are computed whenever the src or destination selector is non-zero.
// This means that the inverse polynomial needs to be resized to the maximum of the src and dst selector sizes.
void resize_inverses(AvmFlavor::ProverPolynomials& prover_polynomials,
                     Column inverses_col,
                     Column src_selector_col,
                     Column dst_selector_col);

} // namespace bb::avm2::constraining
