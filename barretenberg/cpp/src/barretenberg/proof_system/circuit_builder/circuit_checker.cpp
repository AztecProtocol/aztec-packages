#include "circuit_checker.hpp"
#include <barretenberg/plonk/proof_system/constants.hpp>
#include <barretenberg/proof_system/circuit_builder/standard_circuit_builder.hpp>
#include <unordered_map>
#include <unordered_set>

namespace bb {

template <> bool CircuitChecker::check<StandardCircuitBuilder_<bb::fr>>(StandardCircuitBuilder_<bb::fr>& builder)
{
    using FF = bb::fr;
    FF gate_sum;
    FF left, right, output;
    for (size_t i = 0; i < builder.num_gates; i++) {

        gate_sum = FF::zero();
        left = builder.get_variable(builder.blocks.arithmetic.w_l()[i]);
        right = builder.get_variable(builder.blocks.arithmetic.w_r()[i]);
        output = builder.get_variable(builder.blocks.arithmetic.w_o()[i]);
        gate_sum = builder.blocks.arithmetic.q_m()[i] * left * right + builder.blocks.arithmetic.q_1()[i] * left +
                   builder.blocks.arithmetic.q_2()[i] * right + builder.blocks.arithmetic.q_3()[i] * output +
                   builder.blocks.arithmetic.q_c()[i];
        if (!gate_sum.is_zero()) {
            info("gate number", i);
            return false;
        }
    }
    return true;
};

} // namespace bb
