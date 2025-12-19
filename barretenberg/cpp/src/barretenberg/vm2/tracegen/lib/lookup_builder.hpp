#pragma once

#include <array>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <stdexcept>
#include <utility>

#include "barretenberg/common/tuple.hpp"
#include "barretenberg/common/utils.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/map_hashes.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/shared_index_cache.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// Helper to generate a tuple type with N const FF& elements.
namespace detail {
template <size_t N, typename = std::make_index_sequence<N>> struct RefTupleHelper;
template <size_t N, size_t... Is> struct RefTupleHelper<N, std::index_sequence<Is...>> {
    template <size_t> using ConstFFRef = const FF&;
    using type = flat_tuple::tuple<ConstFFRef<Is>...>;
};
} // namespace detail
template <size_t N> using RefTuple = typename detail::RefTupleHelper<N>::type;

// A lookup builder that uses a function `find_in_dst` to find the destination row for a given source tuple.
template <typename LookupSettings_> class IndexedLookupTraceBuilder : public InteractionBuilderInterface {
  public:
    IndexedLookupTraceBuilder()
        : outer_dst_selector(LookupSettings_::DST_SELECTOR)
    {}
    IndexedLookupTraceBuilder(Column outer_dst_selector)
        : outer_dst_selector(outer_dst_selector)
    {}
    ~IndexedLookupTraceBuilder() override = default;

    void process(TraceContainer& trace) override
    {
        init(trace);

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
            // Set the fine grained inner selector if it's not already one.
            if (LookupSettings::DST_SELECTOR != this->outer_dst_selector &&
                trace.get(LookupSettings::DST_SELECTOR, dst_row) != 1) {
                trace.set(LookupSettings::DST_SELECTOR, dst_row, 1);
            }
        });
    }

  protected:
    using LookupSettings = LookupSettings_;
    using TupleType = RefTuple<LookupSettings::LOOKUP_TUPLE_SIZE>;
    virtual uint32_t find_in_dst(const TupleType& tup) const = 0;
    virtual void init(TraceContainer&) {}; // Optional initialization step.

    // The outer (bigger) table selector.
    Column outer_dst_selector;
};

// This class is used when the lookup is into a non-precomputed table.
// It calculates the counts by trying to find the tuple in the destination columns.
// It uses a SharedIndexCache to avoid rebuilding the index when multiple lookups target the same destination.
// This class should work for any lookup that is not precomputed.
template <typename LookupSettings_>
class LookupIntoDynamicTableGeneric : public IndexedLookupTraceBuilder<LookupSettings_> {
  public:
    LookupIntoDynamicTableGeneric(SharedIndexCache& cache)
        : IndexedLookupTraceBuilder<LookupSettings_>()
        , cache_(cache)
    {}
    LookupIntoDynamicTableGeneric(SharedIndexCache& cache, Column outer_dst_selector)
        : IndexedLookupTraceBuilder<LookupSettings_>(outer_dst_selector)
        , cache_(cache)
    {}
    virtual ~LookupIntoDynamicTableGeneric() = default;

    size_t get_destination_columns_fingerprint() const override
    {
        return bb::utils::hash_as_tuple(this->outer_dst_selector, LookupSettings::DST_COLUMNS);
    }

  protected:
    using LookupSettings = LookupSettings_;
    using TupleType = RefTuple<LookupSettings::LOOKUP_TUPLE_SIZE>;

    void init(TraceContainer& trace) override
    {
        trace_ptr_ = &trace;
        index_ptr_ = &cache_.get_or_build(this->outer_dst_selector,
                                          LookupSettings::DST_COLUMNS,
                                          trace,
                                          [this](const TraceContainer& t) { return build_index(t); });
    }

    uint32_t find_in_dst(const TupleType& tup) const override
    {
        size_t key_hash = std::hash<TupleType>{}(tup);
        auto it = index_ptr_->find(key_hash);
        if (it != index_ptr_->end()) {
            uint32_t row = it->second;
            // Verify the actual values match (handles hash collisions).
            auto dst_values = trace_ptr_->get_multiple(LookupSettings::DST_COLUMNS, row);
            if (dst_values == tup) {
                return row;
            }
        }
        throw std::runtime_error("Failed computing counts for " + std::string(LookupSettings::NAME) +
                                 ". Could not find tuple in destination. " +
                                 "SRC tuple: " + column_values_to_string(tup, LookupSettings::SRC_COLUMNS));
    }

  private:
    DstIndex build_index(const TraceContainer& trace)
    {
        DstIndex idx;
        idx.reserve(trace.get_column_rows(this->outer_dst_selector));
        trace.visit_column(this->outer_dst_selector, [&](uint32_t row, const FF&) {
            auto dst_values = trace.get_multiple(LookupSettings::DST_COLUMNS, row);
            size_t key_hash = std::hash<decltype(dst_values)>{}(dst_values);
            // FIXME: THIS IS NOT CORRECT!!!
            // If hash collision, keep the first one (don't insert if key already exists).
            idx.insert({ key_hash, row });
        });
        return idx;
    }

    SharedIndexCache& cache_;
    const DstIndex* index_ptr_ = nullptr;
    const TraceContainer* trace_ptr_ = nullptr;
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
    LookupIntoDynamicTableSequential()
        : outer_dst_selector(LookupSettings::DST_SELECTOR)
    {}
    LookupIntoDynamicTableSequential(Column outer_dst_selector)
        : outer_dst_selector(outer_dst_selector)
    {}
    ~LookupIntoDynamicTableSequential() override = default;

    void process(TraceContainer& trace) override
    {
        uint32_t dst_row = 0;
        uint32_t max_dst_row = trace.get_column_rows(this->outer_dst_selector);

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
                auto dst_selector = trace.get(this->outer_dst_selector, dst_row);
                if (dst_selector == 1 && src_values == trace.get_multiple(LookupSettings::DST_COLUMNS, dst_row)) {
                    trace.set(LookupSettings::COUNTS, dst_row, trace.get(LookupSettings::COUNTS, dst_row) + 1);

                    // Set the fine grained inner selector if it's not already one.
                    if (LookupSettings::DST_SELECTOR != this->outer_dst_selector &&
                        trace.get(LookupSettings::DST_SELECTOR, dst_row) != 1) {
                        trace.set(LookupSettings::DST_SELECTOR, dst_row, 1);
                    }

                    found = true;
                    // We don't want to increment dst_row if we found a match.
                    // It could be that the next "query" will find the same tuple.
                    break;
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

  private:
    // The outer (bigger) table selector.
    Column outer_dst_selector;
};

} // namespace bb::avm2::tracegen
