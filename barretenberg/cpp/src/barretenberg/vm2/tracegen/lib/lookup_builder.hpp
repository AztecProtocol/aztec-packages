#pragma once

#include <array>
#include <bit>
#include <cstddef>
#include <stdexcept>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

template <typename LookupSettings_> class BaseLookupTraceBuilder {
  public:
    virtual ~BaseLookupTraceBuilder() = default;

    void process(TraceContainer& trace)
    {
        init(trace);

        // Let "src_sel {c1, c2, ...} in dst_sel {d1, d2, ...}" be a lookup,
        // For each row that has a 1 in the src_sel, we take the values of {c1, c2, ...},
        // find a row dst_row in the target columns {d1, d2, ...} where the values match.
        // Then we increment the count in the counts column at dst_row.
        // The complexity is O(|src_selector|) * O(find_in_dst).
        trace.visit_column(LookupSettings::SRC_SELECTOR, [&](uint32_t row, const FF& src_sel_value) {
            assert(src_sel_value == 1);
            (void)src_sel_value; // Avoid GCC complaining of unused parameter when asserts are disabled.

            auto src_values = trace.get_multiple(LookupSettings::SRC_COLUMNS, row);
            uint32_t dst_row = find_in_dst(src_values); // Assumes an efficient implementation.
            trace.set(LookupSettings::COUNTS, dst_row, trace.get(LookupSettings::COUNTS, dst_row) + 1);

            // We set a dummy value in the inverse column so that the size of the column is right.
            // The correct value will be set by the prover.
            trace.set(LookupSettings::INVERSES, row, 0xdeadbeef);
        });

        // We set a dummy value in the inverse column so that the size of the column is right.
        // The correct value will be set by the prover.
        trace.visit_column(LookupSettings::DST_SELECTOR,
                           [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
    }

  protected:
    using LookupSettings = LookupSettings_;
    virtual uint32_t find_in_dst(const std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>& tup) const = 0;
    virtual void init(TraceContainer&) {}; // Optional initialization step.
};

// This class is used when the lookup is into a non-precomputed table.
// It calculates the counts by trying to find the tuple in the destination columns.
// It creates an index of the destination columns on init, and uses it to find the tuple efficiently.
template <typename LookupSettings_> class LookupIntoDynamicTable : public BaseLookupTraceBuilder<LookupSettings_> {
  public:
    virtual ~LookupIntoDynamicTable() = default;

  protected:
    using LookupSettings = LookupSettings_;
    using ArrayTuple = std::array<FF, LookupSettings::LOOKUP_TUPLE_SIZE>;

    void init(TraceContainer& trace) override
    {
        row_idx.reserve(trace.get_column_rows(LookupSettings::DST_SELECTOR));
        trace.visit_column(LookupSettings::DST_SELECTOR, [&](uint32_t row, const FF& dst_sel_value) {
            assert(dst_sel_value == 1);
            (void)dst_sel_value; // Avoid GCC complaining of unused parameter when asserts are disabled.

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
        // throw std::runtime_error("Failed computing counts for " + std::string(LookupSettings::NAME) +
        //                          ". Could not find tuple in destination.");
        throw std::runtime_error("Failed computing counts. Could not find tuple in destination.");
    }

  private:
    // TODO: Using the whole tuple as the key is not memory efficient.
    unordered_flat_map<ArrayTuple, uint32_t> row_idx;
};

} // namespace bb::avm2::tracegen

// Define a hash function for std::array so that it can be used as a key in a std::unordered_map.
template <typename T, size_t SIZE> struct std::hash<std::array<T, SIZE>> {
    std::size_t operator()(const std::array<T, SIZE>& arr) const noexcept
    {
        std::size_t hash = 0;
        for (const auto& elem : arr) {
            hash = std::rotl(hash, 1);
            hash ^= std::hash<T>{}(elem);
        }
        return hash;
    }
};