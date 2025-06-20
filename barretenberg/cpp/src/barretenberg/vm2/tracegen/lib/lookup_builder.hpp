#pragma once

#include <array>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <stdexcept>

#include "barretenberg/common/utils.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// A lookup builder that uses a function `find_in_dst` to find the destination row for a given source tuple.
template <typename LookupSettings_> class IndexedLookupTraceBuilder : public InteractionBuilderInterface {
  public:
    ~IndexedLookupTraceBuilder() override = default;

    void process(TraceContainer& trace) override
    {
        init(trace);

        SetDummyInverses<LookupSettings_>(trace);

        // Let "src_sel {c1, c2, ...} in dst_sel {d1, d2, ...}" be a lookup,
        // For each row that has a 1 in the src_sel, we take the values of {c1, c2, ...},
        // find a row dst_row in the target columns {d1, d2, ...} where the values match.
        // Then we increment the count in the counts column at dst_row.
        // The complexity is O(|src_selector|) * O(find_in_dst).
        trace.visit_column(LookupSettings::SRC_SELECTOR, [&](uint32_t row, const FF&) {
            auto src_values = trace.get_multiple(LookupSettings::SRC_COLUMNS, row);
            uint32_t dst_row = 0;
            try {
                dst_row = find_in_dst(src_values); // Assumes an efficient implementation.
            } catch (const std::runtime_error& e) {
                // Add row information and rethrow.
                throw std::runtime_error(std::string(e.what()) + " at row " + std::to_string(row));
            }

            trace.set(LookupSettings::COUNTS, dst_row, trace.get(LookupSettings::COUNTS, dst_row) + 1);
        });
    }

  protected:
    using LookupSettings = LookupSettings_;
    virtual uint32_t find_in_dst(const std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>& tup) const = 0;
    virtual void init(TraceContainer&){}; // Optional initialization step.
};

// This class is used when the lookup is into a non-precomputed table.
// It calculates the counts by trying to find the tuple in the destination columns.
// It creates an index of the destination columns on init, and uses it to find the tuple efficiently.
// This class should work for any lookup that is not precomputed.
template <typename LookupSettings_>
class LookupIntoDynamicTableGeneric : public IndexedLookupTraceBuilder<LookupSettings_> {
  public:
    virtual ~LookupIntoDynamicTableGeneric() = default;

  protected:
    using LookupSettings = LookupSettings_;
    using ArrayTuple = std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>;

    void init(TraceContainer& trace) override
    {
        row_idx.reserve(trace.get_column_rows(LookupSettings::DST_SELECTOR));
        trace.visit_column(LookupSettings::DST_SELECTOR, [&](uint32_t row, const FF&) {
            auto dst_values = trace.get_multiple(LookupSettings::DST_COLUMNS, row);
            row_idx.insert({ dst_values, row });
        });
    }

    uint32_t find_in_dst(const ArrayTuple& tup) const override
    {
        auto it = row_idx.find(tup);
        if (it != row_idx.end()) {
            return it->second;
        }
        throw std::runtime_error("Failed computing counts for " + std::string(LookupSettings::NAME) +
                                 ". Could not find tuple in destination. " +
                                 "SRC tuple: " + column_values_to_string(tup, LookupSettings::SRC_COLUMNS));
    }

  private:
    // TODO: Using the whole tuple as the key is not memory efficient.
    unordered_flat_map<ArrayTuple, uint32_t> row_idx;
};

// This class is used when the lookup is into a non-precomputed table.
// It is optimized for the case when the source and destination tuples
// are expected to be in the same order (possibly with other tuples in the middle
// in the destination table).
// The approach is that for a given source row, you start sequentially looking at the
// destination rows until you find a match. Then you move to the next source row.
// Then you keep looking from the last destination row you found a match.
// WARNING: Do not use this class if you expect to "reuse" destination rows.
// In this case the two tables will likely not be in order.
template <typename LookupSettings> class LookupIntoDynamicTableSequential : public InteractionBuilderInterface {
  public:
    ~LookupIntoDynamicTableSequential() override = default;

    void process(TraceContainer& trace) override
    {
        uint32_t dst_row = 0;
        uint32_t max_dst_row = trace.get_column_rows(LookupSettings::DST_SELECTOR);

        SetDummyInverses<LookupSettings>(trace);

        // For the sequential builder, it is critical that we visit the source rows in order.
        // Since the trace does not guarantee visiting rows in order, we need to collect the rows.
        std::vector<uint32_t> src_rows_in_order;
        src_rows_in_order.reserve(trace.get_column_rows(LookupSettings::SRC_SELECTOR));
        trace.visit_column(LookupSettings::SRC_SELECTOR,
                           [&](uint32_t row, const FF&) { src_rows_in_order.push_back(row); });
        std::sort(src_rows_in_order.begin(), src_rows_in_order.end());

        for (uint32_t row : src_rows_in_order) {
            auto src_values = trace.get_multiple(LookupSettings::SRC_COLUMNS, row);

            // We find the first row in the destination columns where the values match.
            bool found = false;
            while (!found && dst_row < max_dst_row) {
                // TODO: As an optimization, we could try to only walk the rows where the selector is active.
                // We can't just do a visit because we cannot skip rows with that.
                auto dst_selector = trace.get(LookupSettings::DST_SELECTOR, dst_row);
                if (dst_selector == 1 && src_values == trace.get_multiple(LookupSettings::DST_COLUMNS, dst_row)) {
                    trace.set(LookupSettings::COUNTS, dst_row, trace.get(LookupSettings::COUNTS, dst_row) + 1);
                    found = true;
                }
                ++dst_row;
            }

            if (!found) {
                throw std::runtime_error(
                    "Failed computing counts for " + std::string(LookupSettings::NAME) +
                    ". Could not find tuple in destination.\nSRC tuple (row " + std::to_string(row) +
                    "): " + column_values_to_string(src_values, LookupSettings::SRC_COLUMNS) +
                    "\nNOTE: Remember that you cannot use LookupIntoDynamicTableSequential with a deduplicated trace!");
            }
        }
    }
};

} // namespace bb::avm2::tracegen

// Define a hash function for std::array so that it can be used as a key in a std::unordered_map.
template <typename T, size_t SIZE> struct std::hash<std::array<T, SIZE>> {
    std::size_t operator()(const std::array<T, SIZE>& arr) const noexcept
    {
        return [&arr]<size_t... Is>(std::index_sequence<Is...>) {
            return bb::utils::hash_as_tuple(arr[Is]...);
        }(std::make_index_sequence<SIZE>{});
    }
};
