#include "circuit_checker.hpp"
#include <barretenberg/plonk/proof_system/constants.hpp>
#include <barretenberg/proof_system/circuit_builder/standard_circuit_builder.hpp>
#include <unordered_map>
#include <unordered_set>

namespace bb {

/**
 * @brief Circuit check functionality for Ultra arithmetization
 *
 * @param builder
 */
template <>
bool CircuitChecker::check<UltraCircuitBuilder_<UltraArith<bb::fr>>>(
    const UltraCircuitBuilder_<UltraArith<bb::fr>>& builder_in)
{
    using Values = UltraFlavor::AllValues;
    using Params = RelationParameters<FF>;

    // Create a copy of the input circuit and finalize it
    UltraCircuitBuilder_<UltraArith<bb::fr>> builder{ builder_in };
    builder.finalize_circuit();

    // Construct a hash table for table entries to efficiently determine if a lookup gate is valid
    LookupHashTable lookup_hash_table;
    for (const auto& table : builder.lookup_tables) {
        const FF table_index(table.table_index);
        for (size_t i = 0; i < table.size; ++i) {
            lookup_hash_table.insert({ table.column_1[i], table.column_2[i], table.column_3[i], table_index });
        }
    }

    // Construct hash table for memory read/write indices to efficiently determine if a row is a memory read/write
    TagCheckData tag_data{ builder };

    Values values;
    Params params;
    params.eta = tag_data.eta;

    bool result = true;
    for (size_t idx = 0; idx < builder.num_gates; ++idx) {
        populate_values(builder, values, tag_data, idx);

        result = result && check_relation<Arithmetic>(values, params);
        result = result && check_relation<Elliptic>(values, params);
        result = result && check_relation<Auxiliary>(values, params);
        result = result && check_relation<GenPermSort>(values, params);
        result = result && check_lookup(values, lookup_hash_table);
    }

    result = result && check_tag_data(tag_data);

    return result;
};

/**
 * @brief Check that a given relation is satisfied for the provided inputs corresponding to a single row
 *
 * @tparam Relation
 * @param values Values of the relation inputs at a single row
 * @param params
 */
template <typename Relation> bool CircuitChecker::check_relation(auto& values, auto& params)
{
    using SubrelationEvaluations = typename Relation::SumcheckArrayOfValuesOverSubrelations;
    SubrelationEvaluations subrelation_evaluations;
    for (auto& eval : subrelation_evaluations) {
        eval = 0;
    }

    // Evaluate each subrelation in the relation
    Relation::accumulate(subrelation_evaluations, values, params, /*scaling_factor=*/1);

    // Ensure each subrelation evaluates to zero
    for (auto& eval : subrelation_evaluations) {
        if (eval != 0) {
            // info("Relation fails at index ", idx);
            return false;
        }
    }

    return true;
}

/**
 * @brief Check whether the values in a lookup gate are contained within the hash table representing all lookup table
 * data used in the circuit
 *
 * @param values
 * @param lookup_hash_table
 */
bool CircuitChecker::check_lookup(auto& values, auto& lookup_hash_table)
{
    if (!values.q_lookup.is_zero()) {
        return lookup_hash_table.contains({ values.w_l + values.q_r * values.w_l_shift,
                                            values.w_r + values.q_m * values.w_r_shift,
                                            values.w_o + values.q_c * values.w_o_shift,
                                            values.q_o });
    }
    return true;
};

/**
 * @brief Check whether the left and right tag products are equal
 *
 * @param tag_data
 */
bool CircuitChecker::check_tag_data(const TagCheckData& tag_data)
{
    return tag_data.left_product == tag_data.right_product;
};

/**
 * @brief Populate the values required to check the correctness of a single "row" of the circuit
 *
 * @tparam Builder
 * @param builder
 * @param values
 * @param tag_data
 * @param idx
 */
template <typename Builder>
void CircuitChecker::populate_values(Builder& builder, auto& values, TagCheckData& tag_data, size_t idx)
{
    auto& block = builder.blocks.main;

    // Function to quickly update tag products and encountered variable set by index and value
    auto update_tag_check_data = [&](const size_t variable_index, const FF& value) {
        size_t real_index = builder.real_variable_index[variable_index];
        // Check to ensure that we are not including a variable twice
        if (tag_data.encountered_variables.contains(real_index)) {
            return;
        }
        uint32_t tag_in = builder.real_variable_tags[real_index];
        if (tag_in != DUMMY_TAG) {
            uint32_t tag_out = builder.tau.at(tag_in);
            tag_data.left_product *= value + tag_data.gamma * FF(tag_in);
            tag_data.right_product *= value + tag_data.gamma * FF(tag_out);
            tag_data.encountered_variables.insert(real_index);
        }
    };

    // A lambda function for computing a memory record term of the form w3 * eta^3 + w2 * eta^2 + w1 * eta
    auto compute_memory_record_term = [](const FF& w_1, const FF& w_2, const FF& w_3, const FF& eta) {
        return ((w_3 * eta + w_2) * eta + w_1) * eta;
    };

    // Set wire values. Wire 4 is treated specially since it may contain memory records
    values.w_l = builder.get_variable(block.w_l()[idx]);
    values.w_r = builder.get_variable(block.w_r()[idx]);
    values.w_o = builder.get_variable(block.w_o()[idx]);
    if (tag_data.memory_read_record_gates.contains(idx)) {
        values.w_4 = compute_memory_record_term(values.w_l, values.w_r, values.w_o, tag_data.eta);
    } else if (tag_data.memory_write_record_gates.contains(idx)) {
        values.w_4 = compute_memory_record_term(values.w_l, values.w_r, values.w_o, tag_data.eta) + FF::one();
    } else {
        values.w_4 = builder.get_variable(block.w_4()[idx]);
    }

    // Set shifted wire values. Again, wire 4 is treated specially. On final row, set shift values to zero
    values.w_l_shift = idx < block.size() - 1 ? builder.get_variable(block.w_l()[idx + 1]) : 0;
    values.w_r_shift = idx < block.size() - 1 ? builder.get_variable(block.w_r()[idx + 1]) : 0;
    values.w_o_shift = idx < block.size() - 1 ? builder.get_variable(block.w_o()[idx + 1]) : 0;
    if (tag_data.memory_read_record_gates.contains(idx + 1)) {
        values.w_4_shift =
            compute_memory_record_term(values.w_l_shift, values.w_r_shift, values.w_o_shift, tag_data.eta);
    } else if (tag_data.memory_write_record_gates.contains(idx + 1)) {
        values.w_4_shift =
            compute_memory_record_term(values.w_l_shift, values.w_r_shift, values.w_o_shift, tag_data.eta) + FF::one();
    } else {
        values.w_4_shift = idx < block.size() - 1 ? builder.get_variable(block.w_4()[idx + 1]) : 0;
    }

    // Update tag check data
    update_tag_check_data(block.w_l()[idx], values.w_l);
    update_tag_check_data(block.w_r()[idx], values.w_r);
    update_tag_check_data(block.w_o()[idx], values.w_o);
    update_tag_check_data(block.w_4()[idx], values.w_4);

    // Set selector values
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
}

/**
 * @brief Circuit check functionality for Standard arithmetization
 *
 * @param builder
 */
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

} // namespace bb
