#include "./plookup.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include <limits>

namespace bb::stdlib {

using plookup::ColumnIdx;
using plookup::MultiTableId;
using namespace bb;

namespace {
// Selects the last row of a column in read_selected_lookup_rows.
constexpr size_t LAST_LOOKUP_ROW = std::numeric_limits<size_t>::max();

// The builders still generate every lookup witness and gate. Only the returned field_t wrappers
// are selected: constructing or tagging a wrapper does not modify its builder or witness value.
template <typename Builder, size_t N>
std::array<field_t<Builder>, N> read_selected_lookup_rows(const MultiTableId id,
                                                          const field_t<Builder>& key_a,
                                                          const field_t<Builder>& key_b,
                                                          const bool is_2_to_1_lookup,
                                                          const std::array<ColumnIdx, N>& columns,
                                                          const std::array<size_t, N>& rows)
{
    Builder* ctx = key_a.get_context() ? key_a.get_context() : key_b.get_context();
    const auto lookup_data =
        plookup::get_lookup_accumulators(id, key_a.get_value(), key_b.get_value(), is_2_to_1_lookup);
    const auto row = [&](size_t i) {
        const size_t num_rows = lookup_data[columns[i]].size();
        BB_ASSERT_DEBUG(rows[i] == LAST_LOOKUP_ROW || rows[i] < num_rows);
        return rows[i] == LAST_LOOKUP_ROW ? num_rows - 1 : rows[i];
    };
    std::array<field_t<Builder>, N> result;
    if (key_a.is_constant() && (key_b.is_constant() || !is_2_to_1_lookup)) {
        for (size_t i = 0; i < N; ++i) {
            result[i] = field_t<Builder>(ctx, lookup_data[columns[i]][row(i)]);
        }
        return result;
    }

    // Keep the normalization and constant-witness operations in the same order as the full API.
    uint32_t lhs_index = key_a.get_witness_index();
    uint32_t rhs_index = key_b.get_witness_index();
    if (key_a.is_constant()) {
        lhs_index = ctx->put_constant_variable(key_a.get_value());
    }
    if (key_b.is_constant() && is_2_to_1_lookup) {
        rhs_index = ctx->put_constant_variable(key_b.get_value());
    }
    auto key_b_witness = std::make_optional(rhs_index);
    if (rhs_index == stdlib::IS_CONSTANT) {
        key_b_witness = std::nullopt;
    }
    const auto accumulator_witnesses =
        ctx->create_gates_from_plookup_accumulators(id, lookup_data, lhs_index, key_b_witness);
    const auto merged_tag = OriginTag(key_a.get_origin_tag(), key_b.get_origin_tag());
    for (size_t i = 0; i < N; ++i) {
        result[i] = field_t<Builder>::from_witness_index(ctx, accumulator_witnesses[columns[i]][row(i)]);
        result[i].set_origin_tag(merged_tag);
    }
    return result;
}
} // namespace

template <typename Builder>
plookup::ReadData<field_t<Builder>> plookup_read<Builder>::get_lookup_accumulators(const MultiTableId id,
                                                                                   const field_t<Builder>& key_a,
                                                                                   const field_t<Builder>& key_b,
                                                                                   const bool is_2_to_1_lookup)
{
    Builder* ctx = key_a.get_context() ? key_a.get_context() : key_b.get_context();
    const plookup::ReadData<bb::fr> lookup_data =
        plookup::get_lookup_accumulators(id, key_a.get_value(), key_b.get_value(), is_2_to_1_lookup);

    plookup::ReadData<field_t<Builder>> lookup;

    // If both keys are constant (or key_b unused), we can directly create constant field elements
    if (key_a.is_constant() && (key_b.is_constant() || !is_2_to_1_lookup)) {
        for (size_t i = 0; i < lookup_data[ColumnIdx::C1].size(); ++i) {
            lookup[ColumnIdx::C1].emplace_back(field_t<Builder>(ctx, lookup_data[ColumnIdx::C1][i]));
            lookup[ColumnIdx::C2].emplace_back(field_t<Builder>(ctx, lookup_data[ColumnIdx::C2][i]));
            lookup[ColumnIdx::C3].emplace_back(field_t<Builder>(ctx, lookup_data[ColumnIdx::C3][i]));
        }
    } else {
        // At least one key needs witness constraints, so create plookup gates
        uint32_t lhs_index = key_a.get_witness_index();
        uint32_t rhs_index = key_b.get_witness_index();

        if (key_a.is_constant()) {
            lhs_index = ctx->put_constant_variable(key_a.get_value());
        }
        if (key_b.is_constant() && is_2_to_1_lookup) {
            rhs_index = ctx->put_constant_variable(key_b.get_value());
        }

        auto key_b_witness = std::make_optional(rhs_index);
        if (rhs_index == stdlib::IS_CONSTANT) {
            key_b_witness = std::nullopt;
        }

        const auto accumulator_witnesses =
            ctx->create_gates_from_plookup_accumulators(id, lookup_data, lhs_index, key_b_witness);

        const auto merged_tag = OriginTag(key_a.get_origin_tag(), key_b.get_origin_tag());
        for (size_t i = 0; i < lookup_data[ColumnIdx::C1].size(); ++i) {
            lookup[ColumnIdx::C1].emplace_back(
                field_t<Builder>::from_witness_index(ctx, accumulator_witnesses[ColumnIdx::C1][i]));
            lookup[ColumnIdx::C2].emplace_back(
                field_t<Builder>::from_witness_index(ctx, accumulator_witnesses[ColumnIdx::C2][i]));
            lookup[ColumnIdx::C3].emplace_back(
                field_t<Builder>::from_witness_index(ctx, accumulator_witnesses[ColumnIdx::C3][i]));
            lookup[ColumnIdx::C1].back().set_origin_tag(merged_tag);
            lookup[ColumnIdx::C2].back().set_origin_tag(merged_tag);
            lookup[ColumnIdx::C3].back().set_origin_tag(merged_tag);
        }
    }
    return lookup;
}

template <typename Builder>
std::pair<field_t<Builder>, field_t<Builder>> plookup_read<Builder>::read_pair_from_table(const MultiTableId id,
                                                                                          const field_t<Builder>& key)
{
#ifndef __wasm__
    auto result = read_selected_lookup_rows<Builder, 2>(id, key, 0, false, { ColumnIdx::C2, ColumnIdx::C3 }, { 0, 0 });
    return { std::move(result[0]), std::move(result[1]) };
#else
    const auto lookup = get_lookup_accumulators(id, key);

    return { lookup[ColumnIdx::C2][0], lookup[ColumnIdx::C3][0] };
#endif
}

template <typename Builder>
field_t<Builder> plookup_read<Builder>::read_from_2_to_1_table(const MultiTableId id,
                                                               const field_t<Builder>& key_a,
                                                               const field_t<Builder>& key_b)
{
#ifndef __wasm__
    auto result = read_selected_lookup_rows<Builder, 1>(id, key_a, key_b, true, { ColumnIdx::C3 }, { 0 });
    return std::move(result[0]);
#else
    const auto lookup = get_lookup_accumulators(id, key_a, key_b, /*is_2_to_1_lookup=*/true);

    return lookup[ColumnIdx::C3][0];
#endif
}

template <typename Builder>
field_t<Builder> plookup_read<Builder>::read_from_1_to_2_table(const MultiTableId id, const field_t<Builder>& key_a)
{
#ifndef __wasm__
    auto result = read_selected_lookup_rows<Builder, 1>(id, key_a, 0, false, { ColumnIdx::C2 }, { 0 });
    return std::move(result[0]);
#else
    const auto lookup = get_lookup_accumulators(id, key_a);

    return lookup[ColumnIdx::C2][0];
#endif
}

#ifndef __wasm__
// Return the reconstructed second column and the final third-column slice, without materializing
// the other circuit-field wrappers. The underlying lookup queries, witnesses and gates are unchanged.
template <typename Builder>
std::pair<field_t<Builder>, field_t<Builder>> plookup_read<Builder>::read_first_and_last_from_table(
    const MultiTableId id, const field_t<Builder>& key)
{
    auto result = read_selected_lookup_rows<Builder, 2>(
        id, key, 0, false, { ColumnIdx::C2, ColumnIdx::C3 }, { 0, LAST_LOOKUP_ROW });
    return { std::move(result[0]), std::move(result[1]) };
}
#endif

template <typename Builder>
template <size_t N>
std::array<field_t<Builder>, N> plookup_read<Builder>::read_rows_from_table(const MultiTableId id,
                                                                            const field_t<Builder>& key,
                                                                            const std::array<ColumnIdx, N>& columns,
                                                                            const std::array<size_t, N>& rows)
{
    return read_selected_lookup_rows<Builder, N>(id, key, 0, false, columns, rows);
}

template class plookup_read<bb::UltraCircuitBuilder>;
// Plookup-backed: only the arithmetizations that keep the lookup gate.
INSTANTIATE_CLASS_FOR_EACH_MEGA_BUILDER_WITH_LOOKUP(plookup_read)

// read_rows_from_table for the row counts SHA-256 uses, on every builder SHA-256 is instantiated for (v6.0.0 adds
// MegaAppCircuitBuilder through the macro above).
template std::array<field_t<bb::UltraCircuitBuilder>, 3> plookup_read<bb::UltraCircuitBuilder>::read_rows_from_table<3>(
    MultiTableId,
    const field_t<bb::UltraCircuitBuilder>&,
    const std::array<ColumnIdx, 3>&,
    const std::array<size_t, 3>&);
template std::array<field_t<bb::UltraCircuitBuilder>, 8> plookup_read<bb::UltraCircuitBuilder>::read_rows_from_table<8>(
    MultiTableId,
    const field_t<bb::UltraCircuitBuilder>&,
    const std::array<ColumnIdx, 8>&,
    const std::array<size_t, 8>&);
template std::array<field_t<bb::MegaCircuitBuilder>, 3> plookup_read<bb::MegaCircuitBuilder>::read_rows_from_table<3>(
    MultiTableId,
    const field_t<bb::MegaCircuitBuilder>&,
    const std::array<ColumnIdx, 3>&,
    const std::array<size_t, 3>&);
template std::array<field_t<bb::MegaCircuitBuilder>, 8> plookup_read<bb::MegaCircuitBuilder>::read_rows_from_table<8>(
    MultiTableId,
    const field_t<bb::MegaCircuitBuilder>&,
    const std::array<ColumnIdx, 8>&,
    const std::array<size_t, 8>&);
template std::array<field_t<bb::MegaAppCircuitBuilder>, 3> plookup_read<
    bb::MegaAppCircuitBuilder>::read_rows_from_table<3>(MultiTableId,
                                                        const field_t<bb::MegaAppCircuitBuilder>&,
                                                        const std::array<ColumnIdx, 3>&,
                                                        const std::array<size_t, 3>&);
template std::array<field_t<bb::MegaAppCircuitBuilder>, 8> plookup_read<
    bb::MegaAppCircuitBuilder>::read_rows_from_table<8>(MultiTableId,
                                                        const field_t<bb::MegaAppCircuitBuilder>&,
                                                        const std::array<ColumnIdx, 8>&,
                                                        const std::array<size_t, 8>&);
} // namespace bb::stdlib
