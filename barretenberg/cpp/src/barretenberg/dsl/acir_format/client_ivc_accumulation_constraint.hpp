#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "recursion_constraint.hpp"

namespace acir_format {

void create_client_ivc_accumulation_constraints([[maybe_unused]] bb::MegaCircuitBuilder&,
                                                [[maybe_unused]] const RecursionConstraint&,
                                                [[maybe_unused]] const bb::ClientIVC&);
} // namespace acir_format
