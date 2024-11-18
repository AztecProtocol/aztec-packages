#pragma once

#include <cstdint>

#include "barretenberg/vm2/generated/flavor.hpp"

namespace bb::avm2::constraining {

// This is a version of check circuit that runs on the prover polynomials.
// Better versions could be done, but since this is for debugging only, it is enough for now.
void run_check_circuit(AvmFlavor::ProverPolynomials& polys, size_t num_rows);

} // namespace bb::avm2::constraining