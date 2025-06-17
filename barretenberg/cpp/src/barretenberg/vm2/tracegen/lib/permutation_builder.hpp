#pragma once

#include <string>
#include <unordered_set>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// This class is only needed to set the correct size of the inverse column.
// TODO: In the future we'll repurpose this class to keep track of the active rows,
// and let the provers use it to more efficiently compute the inverses.
template <typename PermutationSettings> class PermutationBuilder : public InteractionBuilderInterface {
  public:
    void process(TraceContainer& trace) override { SetDummyInverses<PermutationSettings>(trace); }
};

// Builds a permutation and performs additional checks.
// Only use in tests and debugging. This is slow and memory intensive.
template <typename PermutationSettings> class DebugPermutationBuilder : public PermutationBuilder<PermutationSettings> {
  public:
    using ArrayTuple = std::array<FF, PermutationSettings::COLUMNS_PER_SET>;

    void process(TraceContainer& trace) override
    {
        PermutationBuilder<PermutationSettings>::process(trace);

        // Collect the source and destination tuples.
        source_tuples.clear();
        trace.visit_column(PermutationSettings::SRC_SELECTOR, [&](uint32_t row, const FF&) {
            auto src_values = trace.get_multiple(PermutationSettings::SRC_COLUMNS, row);
            source_tuples[src_values].insert(row);
        });
        destination_tuples.clear();
        trace.visit_column(PermutationSettings::DST_SELECTOR, [&](uint32_t row, const FF&) {
            auto dst_values = trace.get_multiple(PermutationSettings::DST_COLUMNS, row);
            destination_tuples[dst_values].insert(row);
        });

        auto build_error_message =
            [&](const ArrayTuple& tuple, const auto& columns, const auto& src_rows, const auto& dst_rows) {
                std::string error = "Failure to build permutation " + std::string(PermutationSettings::NAME) + ".\n";
                error += format("Tuple ",
                                column_values_to_string(tuple, columns),
                                " has multiplicity ",
                                src_rows.size(),
                                " in the source, but ",
                                dst_rows.size(),
                                " in the destination.\n");
                error += format("Source rows: ");
                for (auto row : src_rows) {
                    error += format(row, " ");
                }
                error += format("\n");
                error += format("Destination rows: ");
                for (auto row : dst_rows) {
                    error += format(row, " ");
                }
                return error;
            };

        // Check that every source tuple is found in the destination with the same multiplicity.
        for (const auto& [src_tuple, src_rows] : source_tuples) {
            auto dst_rows = destination_tuples.contains(src_tuple) ? destination_tuples.at(src_tuple)
                                                                   : std::unordered_set<uint32_t>();
            if (src_rows.size() != dst_rows.size()) {
                throw std::runtime_error(
                    build_error_message(src_tuple, PermutationSettings::SRC_COLUMNS, src_rows, dst_rows));
            }
        }
        // Check that every destination tuple is found in the source with the same multiplicity.
        for (const auto& [dst_tuple, dst_rows] : destination_tuples) {
            auto src_rows =
                source_tuples.contains(dst_tuple) ? source_tuples.at(dst_tuple) : std::unordered_set<uint32_t>();
            if (src_rows.size() != dst_rows.size()) {
                throw std::runtime_error(
                    build_error_message(dst_tuple, PermutationSettings::DST_COLUMNS, src_rows, dst_rows));
            }
        }
    }

  private:
    unordered_flat_map<ArrayTuple, std::unordered_set<uint32_t>> source_tuples;
    unordered_flat_map<ArrayTuple, std::unordered_set<uint32_t>> destination_tuples;
};

} // namespace bb::avm2::tracegen
