#pragma once

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor.hpp"

namespace bb::avm2::constraining {

// This is a version of check circuit that runs on the prover polynomials.
// It is the closest to "real proving" that we can get without actually running the prover.
void run_check_circuit(AvmFlavor::ProverPolynomials& polys, size_t num_rows);

} // namespace bb::avm2::constraining
