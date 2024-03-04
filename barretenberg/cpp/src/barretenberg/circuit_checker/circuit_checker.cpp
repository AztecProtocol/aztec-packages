#include "circuit_checker.hpp"
#include <barretenberg/plonk/proof_system/constants.hpp>
#include <barretenberg/proof_system/circuit_builder/standard_circuit_builder.hpp>
#include <unordered_map>
#include <unordered_set>

namespace bb {

template <> bool CircuitChecker::check<StandardCircuitBuilder_<bb::fr>>(const StandardCircuitBuilder_<bb::fr>& builder)
{
    using FF = bb::fr;
    const auto& block = builder.blocks.arithmetic;
    for (size_t i = 0; i < builder.num_gates; i++) {
        FF left = builder.get_variable(block.w_l()[i]);
        FF right = builder.get_variable(block.w_r()[i]);
        FF output = builder.get_variable(block.w_o()[i]);
        FF gate_sum = block.q_m()[i] * left * right + block.q_1()[i] * left + block.q_2()[i] * right +
                      block.q_3()[i] * output + block.q_c()[i];
        if (!gate_sum.is_zero()) {
            info("gate number", i);
            return false;
        }
    }
    return true;
};

template <>
bool CircuitChecker::check<UltraCircuitBuilder_<UltraArith<bb::fr>>>(
    const UltraCircuitBuilder_<UltraArith<bb::fr>>& builder_in)
{
    using Values = UltraFlavor::AllValues;
    using Params = RelationParameters<FF>;

    UltraCircuitBuilder_<UltraArith<bb::fr>> builder{ builder_in };
    builder.finalize_circuit();

    bool result = true;

    // Construct a hash table for table entries to efficiently determine if a lookup gate is valid
    std::unordered_set<std::array<FF, 4>, HashFrTuple> table_hash;
    for (const auto& table : builder.lookup_tables) {
        const FF table_index(table.table_index);
        for (size_t i = 0; i < table.size; ++i) {
            table_hash.insert({ table.column_1[i], table.column_2[i], table.column_3[i], table_index });
        }
    }

    // Construct hash table for memory read/write indices to efficiently determine if a row is a memory read/write
    TagCheckData tag_data{ builder };

    Values values;
    Params params;
    params.eta = tag_data.eta;

    for (size_t idx = 0; idx < builder.num_gates; ++idx) {

        populate_values(builder, values, idx, tag_data);

        result = result && check_relation<Arithmetic>(values, params);
        result = result && check_relation<Elliptic>(values, params);
        result = result && check_relation<Auxiliary>(values, params);
        result = result && check_relation<GenPermSort>(values, params);
        result = result && check_lookup(values, table_hash);
    }

    result = result && check_tag_data(tag_data);

    return result;
};

template <typename Relation> bool CircuitChecker::check_relation(auto& values, auto& params)
{
    using SubrelationEvaluations = typename Relation::SumcheckArrayOfValuesOverSubrelations;
    SubrelationEvaluations subrelation_evaluations;
    for (auto& eval : subrelation_evaluations) {
        eval = 0;
    }

    // Evaluate each constraint in the relation and check that each is satisfied
    Relation::accumulate(subrelation_evaluations, values, params, 1);

    // bool satisfied = true;
    size_t sub_rel_idx = 0;
    (void)sub_rel_idx;
    for (auto& eval : subrelation_evaluations) {
        sub_rel_idx++;
        if (eval != 0) {
            // info("Relation fails at index ", idx);
            return false;
        }
    }

    return true;
}

bool CircuitChecker::check_lookup(auto& values, auto& table_hash)
{
    if (!values.q_lookup.is_zero()) {
        bool lookup_is_valid = table_hash.contains({ values.w_l + values.q_r * values.w_l_shift,
                                                     values.w_r + values.q_m * values.w_r_shift,
                                                     values.w_o + values.q_c * values.w_o_shift,
                                                     values.q_o });
        return lookup_is_valid;
    }
    return true;
};

bool CircuitChecker::check_tag_data(const TagCheckData& tag_data)
{
    return tag_data.left_product == tag_data.right_product;
};

template <typename Builder>
void CircuitChecker::populate_values(Builder& builder, auto& values, size_t idx, TagCheckData& tag_data)
{
    auto& block = builder.blocks.main;

    // Function to quickly update tag products and encountered variable set by index and value
    auto update_tag_check_data = [&](const size_t variable_index, const FF& value) {
        size_t real_index = builder.real_variable_index[variable_index];
        // Check to ensure that we are not including a variable twice
        if (tag_data.encountered_variables.contains(real_index)) {
            return;
        }
        size_t tag_in = builder.real_variable_tags[real_index];
        if (tag_in != DUMMY_TAG) {
            size_t tag_out = builder.tau.at((uint32_t)tag_in);
            tag_data.left_product *= value + tag_data.gamma * FF(tag_in);
            tag_data.right_product *= value + tag_data.gamma * FF(tag_out);
            tag_data.encountered_variables.insert(real_index);
        }
    };

    values.w_l = builder.get_variable(block.w_l()[idx]);
    update_tag_check_data(block.w_l()[idx], values.w_l);
    values.w_r = builder.get_variable(block.w_r()[idx]);
    update_tag_check_data(block.w_r()[idx], values.w_r);
    values.w_o = builder.get_variable(block.w_o()[idx]);
    update_tag_check_data(block.w_o()[idx], values.w_o);

    // If we are touching a gate with memory access, we need to update the value of the 4th witness
    if (tag_data.memory_read_record_gates.contains(idx)) {
        values.w_4 = ((values.w_o * tag_data.eta + values.w_r) * tag_data.eta + values.w_l) * tag_data.eta;
    } else if (tag_data.memory_write_record_gates.contains(idx)) {
        values.w_4 = ((values.w_o * tag_data.eta + values.w_r) * tag_data.eta + values.w_l) * tag_data.eta + FF::one();
    } else {
        values.w_4 = builder.get_variable(block.w_4()[idx]);
    }
    update_tag_check_data(block.w_4()[idx], values.w_4);

    values.q_m = block.q_m()[idx];
    values.q_c = block.q_c()[idx];
    values.q_l = block.q_1()[idx];
    values.q_r = block.q_2()[idx];
    values.q_o = block.q_3()[idx];
    values.q_4 = block.q_4()[idx];
    values.q_arith = block.q_arith()[idx];
    values.q_sort = block.q_sort()[idx];
    values.q_elliptic = block.q_elliptic()[idx];
    values.q_aux = block.q_aux()[idx];
    values.q_lookup = block.q_lookup_type()[idx];

    // Populate shifted wire values; on the final row, populate with zeros
    values.w_l_shift = idx < block.size() - 1 ? builder.get_variable(block.w_l()[idx + 1]) : 0;
    values.w_r_shift = idx < block.size() - 1 ? builder.get_variable(block.w_r()[idx + 1]) : 0;
    values.w_o_shift = idx < block.size() - 1 ? builder.get_variable(block.w_o()[idx + 1]) : 0;

    // If we are touching a gate with memory access, we need to update the value of the 4th witness
    if (tag_data.memory_read_record_gates.contains(idx + 1)) {
        values.w_4_shift =
            ((values.w_o_shift * tag_data.eta + values.w_r_shift) * tag_data.eta + values.w_l_shift) * tag_data.eta;
    } else if (tag_data.memory_write_record_gates.contains(idx + 1)) {
        values.w_4_shift =
            ((values.w_o_shift * tag_data.eta + values.w_r_shift) * tag_data.eta + values.w_l_shift) * tag_data.eta +
            FF::one();
    } else {
        values.w_4_shift = idx < block.size() - 1 ? builder.get_variable(block.w_4()[idx + 1]) : 0;
    }
}

} // namespace bb
