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

template <>
bool CircuitChecker::check<UltraCircuitBuilder_<UltraArith<bb::fr>>>(UltraCircuitBuilder_<UltraArith<bb::fr>>& builder)
{
    bool result = true;
    result = result && check_arithmetic_relation(builder);
    return result;
};

template <typename Builder> bool CircuitChecker::check_arithmetic_relation(Builder& builder)
{
    using FF = bb::fr;
    using Relation = UltraArithmeticRelation<FF>;
    using Values = UltraFlavor::AllValues;
    using SubrelationEvaluations = typename Relation::SumcheckArrayOfValuesOverSubrelations;
    using Params = RelationParameters<FF>;

    Values values;
    Params params;
    SubrelationEvaluations subrelation_evaluations;
    for (auto& eval : subrelation_evaluations) {
        eval = 0;
    }

    auto& block = builder.blocks.main;

    for (size_t idx = 0; idx < builder.num_gates; ++idx) {

        values.w_l = builder.get_variable(block.w_l()[idx]);
        values.w_r = builder.get_variable(block.w_r()[idx]);
        values.w_o = builder.get_variable(block.w_o()[idx]);
        values.w_4 = builder.get_variable(block.w_4()[idx]);
        values.q_m = block.q_m()[idx];
        values.q_c = block.q_c()[idx];
        values.q_l = block.q_1()[idx];
        values.q_r = block.q_2()[idx];
        values.q_o = block.q_3()[idx];
        values.q_4 = block.q_4()[idx];
        values.q_arith = block.q_arith()[idx];

        values.w_4_shift = idx < builder.num_gates - 1 ? builder.get_variable(block.w_4()[idx + 1]) : 0;

        // info("Arithmetic relation index ", idx);
        // info("values.w_l = ", values.w_l);
        // info("values.w_r = ", values.w_r);
        // info("values.w_o = ", values.w_o);
        // info("values.w_4 = ", values.w_4);
        // info("values.q_m = ", values.q_m);
        // info("values.q_c = ", values.q_c);
        // info("values.q_l = ", values.q_l);
        // info("values.q_r = ", values.q_r);
        // info("values.q_o = ", values.q_o);
        // info("values.q_4 = ", values.q_4);
        // info("values.q_arith = ", values.q_arith);
        // info("values.w_4_shift = ", values.w_4_shift);

        // Evaluate each constraint in the relation and check that each is satisfied
        Relation::accumulate(subrelation_evaluations, values, params, 1);

        // bool satisfied = true;
        for (auto& eval : subrelation_evaluations) {
            if (eval != 0) {
                info("Arithmetic relation fails at index ", idx);
                return false;
            }
        }
    }

    return true;
};

} // namespace bb
