#pragma once

#include <array>
#include <bit>
#include <cstddef>
#include <stdexcept>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// Add new selector for optimizing inverse computations
static constexpr Column SEL_COUNT_NONZERO = Column::sel_count_nonzero;

template <typename LookupSettings_> class BaseLookupTraceBuilder : public InteractionBuilderInterface {
  public:
    ~BaseLookupTraceBuilder() override = default;

    void process(TraceContainer& trace) override
    {
        init(trace);

        // Initialize sel_count_nonzero to 0
        trace.visit_column(LookupSettings::DST_SELECTOR, [&](uint32_t row, const FF&) {
            trace.set(LookupSettings::SEL_COUNT_NONZERO, row, FF::zero());
        });

        // Let "src_sel {c1, c2, ...} in dst_sel {d1, d2, ...}" be a lookup,
        // For each row that has a 1 in the src_sel, we take the values of {c1, c2, ...},
        // find a row dst_row in the target columns {d1, d2, ...} where the values match.
        // Then we increment the count in the counts column at dst_row.
        // The complexity is O(|src_selector|) * O(find_in_dst).
        trace.visit_column(LookupSettings::SRC_SELECTOR, [&](uint32_t row, const FF& src_sel_value) {
            assert(src_sel_value == 1);
            (void)src_sel_value;

            auto src_values = trace.get_multiple(LookupSettings::SRC_COLUMNS, row);
            uint32_t dst_row = find_in_dst(src_values);

            // Update counts and sel_count_nonzero
            FF new_count = trace.get(LookupSettings::COUNTS, dst_row) + 1;
            trace.set(LookupSettings::COUNTS, dst_row, new_count);
            trace.set(LookupSettings::SEL_COUNT_NONZERO, dst_row, FF::one());

            // Set dummy value for inverse
            trace.set(LookupSettings::INVERSES, row, 0xdeadbeef);
        });

        // Set dummy values for inverses in destination rows
        trace.visit_column(LookupSettings::DST_SELECTOR,
                         [&](uint32_t row, const FF&) {
                             trace.set(LookupSettings::INVERSES, row, 0xdeadbeef);
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

// Optimize inverse computation by using sel_count_nonzero
template <typename AllEntities>
static inline auto inverse_polynomial_is_computed_at_row(const AllEntities& in)
{
    // Only compute inverses for rows with active source selector or non-zero count
    return (in._src_selector() == 1 || in._sel_count_nonzero() == 1);
}

// Add constraint to ensure sel_count_nonzero is correct
template <typename Builder>
void add_sel_count_nonzero_constraint(Builder& builder, const FF& count)
{
    // sel_count_nonzero == 1 <=> count != 0
    builder.assert_equal(sel_count_nonzero, count != 0);
}

// Add efficient traversal of non-zero rows for inverse computation
template <typename Settings, typename Trace>
void compute_inverses(Trace& trace)
{
    // Use trace object to efficiently visit non-zero rows
    trace.visit_nonzero_rows([&](uint32_t row) {
        if (trace.get(Settings::SRC_SELECTOR, row) == 1 ||
            trace.get(Settings::SEL_COUNT_NONZERO, row) == 1) {
            // Compute and set inverse only for relevant rows
            FF inverse = compute_inverse_for_row<Settings>(trace, row);
            trace.set(Settings::INVERSES, row, inverse);
        } else {
            // Set dummy value for other rows
            trace.set(Settings::INVERSES, row, 0xdeadbeef);
        }
    });
}

// Helper function to compute inverse for a specific row
template <typename Settings, typename Trace>
FF compute_inverse_for_row(Trace& trace, uint32_t row)
{
    // Get values needed for inverse computation
    auto src_values = trace.get_multiple(Settings::SRC_COLUMNS, row);
    auto dst_values = trace.get_multiple(Settings::DST_COLUMNS, row);
    return compute_lookup_inverse(src_values, dst_values);
}

// Original (unoptimized) inverse computation for testing/comparison
template <typename Settings, typename Trace>
void compute_inverses_original(Trace& trace)
{
    // Iterate through all rows
    for (uint32_t row = 0; row < trace.size(); row++) {
        if (trace.get(Settings::SRC_SELECTOR, row) == 1 ||
            trace.get(Settings::DST_SELECTOR, row) == 1) {
            // Compute inverse for every row with active selector
            FF inverse = compute_inverse_for_row<Settings>(trace, row);
            trace.set(Settings::INVERSES, row, inverse);
        } else {
            trace.set(Settings::INVERSES, row, 0xdeadbeef);
        }
    }
}

// Compute inverse for lookup relation
template <typename T, size_t N>
FF compute_lookup_inverse(const std::array<T, N>& src_values, const std::array<T, N>& dst_values)
{
    // Compute product of differences for lookup relation
    FF product = FF::one();
    for (size_t i = 0; i < N; ++i) {
        product *= (src_values[i] - dst_values[i]);
    }
    // Return inverse of the product
    return product.invert();
}

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
