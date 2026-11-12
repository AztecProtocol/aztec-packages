#include "barretenberg/serialize/msgpack_impl.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "plookup.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::plookup;

namespace {
using Builder = UltraCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using plookup_read = stdlib::plookup_read<Builder>;

// Runs the full read and the selected-row read on two equal builders and requires equal circuits and results.
template <size_t N>
void check_rows_match_full_read(const MultiTableId id,
                                const std::array<ColumnIdx, N>& columns,
                                const std::array<size_t, N>& rows)
{
    for (const bool witness_key : { true, false }) {
        const auto make_key = [&](Builder& builder) {
            const fr value(0x12345678);
            // A nontrivial affine witness expression exercises key normalization; 3 * value + 7 < 2^32.
            return witness_key ? field_ct(witness_ct(&builder, value)) * fr(3) + fr(7) : field_ct(&builder, value);
        };
        Builder full_builder;
        Builder rows_builder;
        const auto full = plookup_read::get_lookup_accumulators(id, make_key(full_builder));
        const auto selected = plookup_read::read_rows_from_table(id, make_key(rows_builder), columns, rows);

        for (size_t i = 0; i < N; ++i) {
            const field_ct& expected = full[columns[i]][rows[i]];
            EXPECT_EQ(expected.get_value(), selected[i].get_value());
            EXPECT_EQ(expected.is_constant(), selected[i].is_constant());
            EXPECT_TRUE(field_ct::witness_indices_match(expected, selected[i]));
            EXPECT_EQ(selected[i].get_context(), &rows_builder);
        }
        EXPECT_EQ(full_builder.get_variables(), rows_builder.get_variables());
        EXPECT_EQ(full_builder.num_gates(), rows_builder.num_gates());
        // The exported circuit records variables, selectors, wires and lookup tables.
        const auto full_circuit = full_builder.export_circuit();
        const auto rows_circuit = rows_builder.export_circuit();
        EXPECT_EQ(std::string(full_circuit.data(), full_circuit.size()),
                  std::string(rows_circuit.data(), rows_circuit.size()));
        EXPECT_TRUE(CircuitChecker::check(rows_builder));
    }
}
} // namespace

TEST(PlookupRows, MatchFullReadForSha256InputTables)
{
    check_rows_match_full_read<3>(
        MultiTableId::SHA256_CH_INPUT, { ColumnIdx::C3, ColumnIdx::C2, ColumnIdx::C2 }, { 0, 0, 2 });
    check_rows_match_full_read<3>(
        MultiTableId::SHA256_MAJ_INPUT, { ColumnIdx::C3, ColumnIdx::C2, ColumnIdx::C2 }, { 0, 0, 1 });
    check_rows_match_full_read<8>(MultiTableId::SHA256_WITNESS_INPUT,
                                  { ColumnIdx::C1,
                                    ColumnIdx::C2,
                                    ColumnIdx::C3,
                                    ColumnIdx::C1,
                                    ColumnIdx::C2,
                                    ColumnIdx::C3,
                                    ColumnIdx::C2,
                                    ColumnIdx::C3 },
                                  { 3, 0, 1, 0, 3, 2, 2, 3 });
}
