#pragma once

#include <array>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <vector>

#include "barretenberg/common/tuple.hpp"
#include "barretenberg/common/utils.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

/**
 * Suppose you have n permutations (P1, ..., Pn) such that
 * - The destination tuple columns (and therefore table) are the same for all of them (e.g., mem.address, mem.value).
 * - There is a "global" destination table selector (mem.sel)
 * - The source selectors are different, and already set (e.g., execution.sel_addressing_base,
 * execution.sel_addressing_indirect_0..., sha256.mem_op_1...)
 * - The destination selectors are different, but UNSET. E.g., mem.sel_addressing_base,
 * mem.sel_addressing_indirect_0...).
 *
 * You want to find, for each source row of each permutation, a row in the destination
 * table and set the right destination selector. For the next source row or permutation, you should not be able to
 * consider the "already used" destination rows, because this is a permutation.
 */
template <typename... PermutationSettings_> class MultiPermutationBuilder : public InteractionBuilderInterface {
  public:
    MultiPermutationBuilder(Column dst_table_selector)
        : dst_table_selector(dst_table_selector)
    {}
    ~MultiPermutationBuilder() override = default;

    void process(TraceContainer& trace) override
    {
        // Index the destination columns.
        init(trace);

        // Set the destination selector for each permutation.
        (set_destination_selector<PermutationSettings_>(trace), ...);

        // Set all the dummy inverses or whatever else is needed.
        (PermutationBuilder<PermutationSettings_>().process(trace), ...);
    }

    template <typename PermutationSettings> void set_destination_selector(TraceContainer& trace)
    {
        // Find each source tuple in the destination table, and set a 1 in the destination selector.
        trace.visit_column(PermutationSettings::SRC_SELECTOR, [&](uint32_t row, const FF&) {
            auto src_values = trace.get_multiple(PermutationSettings::SRC_COLUMNS, row);
            auto index_it = row_idx.find(src_values);
            if (index_it == row_idx.end() || index_it->second.empty()) {
                throw std::runtime_error("Failed setting selectors for " + std::string(PermutationSettings::NAME) +
                                         ". Could not find tuple in destination.\nSRC tuple (row " +
                                         std::to_string(row) +
                                         "): " + column_values_to_string(src_values, PermutationSettings::SRC_COLUMNS));
            }
            // Get one of the available rows for the tuple.
            // TODO: This could be done in parallel, with only a lock on the row vector.
            std::vector<uint32_t>& possible_dst_rows = index_it->second;
            uint32_t dst_row = possible_dst_rows.back();
            trace.set(PermutationSettings::DST_SELECTOR, dst_row, 1);
            // We remove the used row from the list of possible rows.
            // Since this is a permutation, you can use a row only once.
            possible_dst_rows.pop_back();
            // NOTE: we don't remove the key src_values from the map if it's empty, because that triggers a rehash.
        });
    }

    void init(TraceContainer& trace)
    {
        // Index the destination columns.
        // For each row in the destination table, extract the value of columns (a, b, c, ...)
        // and add the row number to the index. See the comment on `row_idx` for more details.
        row_idx.reserve(trace.get_column_rows(dst_table_selector));
        trace.visit_column(dst_table_selector, [&](uint32_t row, const FF&) {
            auto dst_values = trace.get_multiple(DST_COLUMNS, row);
            row_idx[dst_values].push_back(row);
        });
    }

  private:
    // All permutations are expected to have the same destination columns.
    using REPRESENTATIVE_PERM = std::tuple_element_t<0, flat_tuple::tuple<PermutationSettings_...>>;
    static constexpr auto DST_COLUMNS = REPRESENTATIVE_PERM::DST_COLUMNS; // std::array.
    static constexpr size_t COLUMNS_PER_SET = DST_COLUMNS.size();
    static_assert(((DST_COLUMNS == PermutationSettings_::DST_COLUMNS) && ...));
    // The destination selectors, however, are not the same.
    // We need an extra "destination TABLE selector" which is the selector of the whole table.
    Column dst_table_selector;

    // In a permutation (or lookup) you are trying to find a src suple of values
    // (a, b, c, ...) in some destination table. That is, you want a row number in the destination table.
    // The following map contains (a, b, c, ...) -> [row_number_1, row_number_2, ...].
    // That is, you can efficiently find all the rows in the destination table that match the src tuple.
    // TODO: Using the whole tuple as the key is not memory efficient.
    using ArrayTuple = std::array<FF, COLUMNS_PER_SET>;
    unordered_flat_map<ArrayTuple, /*rows*/ std::vector<uint32_t>> row_idx;
};

} // namespace bb::avm2::tracegen
