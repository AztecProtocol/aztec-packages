#include "ivc_recursion_constraint.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"
#include "honk_recursion_constraint.hpp"
#include "proof_surgeon.hpp"

namespace acir_format {

using namespace bb;
using field_ct = stdlib::field_t<Builder>;
using bn254 = stdlib::bn254<Builder>;
using aggregation_state_ct = bb::stdlib::recursion::aggregation_state<bn254>;

ClientIVC create_mock_ivc_from_recursion_constraints(
    [[maybe_unused]] const std::vector<RecursionConstraint>& ivc_recursion_constraints)
{
    using Builder = ClientIVC::ClientCircuit;

    // Construct a dummy circuit with the correct number of public inputs according to the databus propagation data
    auto construct_dummy_circuit = [](bool is_kernel) {
        Builder dummy_circuit;
        uint32_t num_pub_inputs_to_add = is_kernel ? 16 : 0;
        // WORKTODO: do I need to add PI corresponding to an aggregation object here?
        for (size_t i = 0; i < num_pub_inputs_to_add; ++i) {
            dummy_circuit.add_public_variable(0);
        }

        return dummy_circuit;
    };

    // Construct a vector of flags indicating the type of circuit being verified in each recursion constraint
    std::vector<bool> is_kernel_flags;
    if (ivc_recursion_constraints.size() == 1) {
        if (ivc_recursion_constraints[0].proof_type == PROOF_TYPE::OINK) {
            is_kernel_flags.emplace_back(false);
        } else {
            is_kernel_flags.emplace_back(true);
        }
    }
    if (ivc_recursion_constraints.size() == 2) {
        is_kernel_flags.emplace_back(true);
        is_kernel_flags.emplace_back(false);
    }

    // Construct a mock ClientIVC corresponding to the above constraints
    ClientIVC ivc;
    for (const auto is_kernel : is_kernel_flags) {
        Builder dummy_circuit = construct_dummy_circuit(is_kernel);
        ivc.accumulate(dummy_circuit);
    }

    return ClientIVC{};
}

} // namespace acir_format
