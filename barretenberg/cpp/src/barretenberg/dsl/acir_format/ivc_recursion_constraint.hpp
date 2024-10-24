#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <vector>

namespace acir_format {
using Builder = bb::UltraCircuitBuilder;

using namespace bb;

ClientIVC create_mock_ivc_from_recursion_constraints(std::vector<RecursionConstraint> ivc_recursion_constraints);

} // namespace acir_format
