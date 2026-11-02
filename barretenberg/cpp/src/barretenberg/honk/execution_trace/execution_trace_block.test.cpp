#include "barretenberg/honk/execution_trace/execution_trace_block.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include <gtest/gtest.h>
#include <vector>

using namespace bb;

namespace {

using FF = fr;
using Block = ExecutionTraceBlock<FF, GateKind::Arith, GateKind::Elliptic>;
using Row = Block::Row;
constexpr size_t BLOCK_WIRES = Block::NUM_WIRES;

// The same field element in its other internal representative, value + p (fr is held in [0, 2p)).
FF non_reduced(const FF& value)
{
    const FF reduced = value.reduce_once();
    const uint256_t shifted =
        uint256_t(reduced.data[0], reduced.data[1], reduced.data[2], reduced.data[3]) + FF::modulus;
    FF result;
    for (size_t i = 0; i < 4; ++i) {
        result.data[i] = shifted.data[i];
    }
    return result;
}

// Selector values a circuit can produce: zero, small integers, -1, large ACIR coefficients, values that collide after
// narrowing to 32 bits, and a second representative of an existing value.
std::vector<FF> selector_value_pool()
{
    auto& engine = numeric::get_debug_randomness();
    std::vector<FF> pool{ FF(0), FF(1), FF(2), -FF(1), -FF(2), FF(1) / FF(3), FF::modulus - 1 };
    const FF base = FF::random_element(&engine);
    pool.push_back(base);
    pool.push_back(base + FF(uint256_t(1) << 32));
    pool.push_back(base + FF(uint256_t(1) << 64));
    pool.push_back(FF(uint256_t(1) << 253));
    for (size_t i = 0; i < 40; ++i) {
        pool.push_back(FF::random_element(&engine));
    }
    pool.push_back(non_reduced(pool[3]));
    pool.push_back(non_reduced(base));
    return pool;
}

struct ExpectedRow {
    std::array<uint32_t, BLOCK_WIRES> wires;
    std::array<FF, 7> non_gate;
    GateKind kind;
    FF gate_value;
};

std::vector<ExpectedRow> random_rows(size_t num_rows)
{
    auto& engine = numeric::get_debug_randomness();
    const auto pool = selector_value_pool();
    const auto pick = [&]() { return pool[engine.get_random_uint32() % pool.size()]; };
    std::vector<ExpectedRow> rows(num_rows);
    for (auto& row : rows) {
        for (auto& w : row.wires) {
            w = engine.get_random_uint32();
        }
        for (auto& v : row.non_gate) {
            v = pick();
        }
        const uint32_t kind = engine.get_random_uint32() % 3;
        row.kind = kind == 0 ? GateKind::None : (kind == 1 ? GateKind::Arith : GateKind::Elliptic);
        row.gate_value = row.kind == GateKind::None ? FF(0) : pick();
    }
    return rows;
}

void append(Block& block, const ExpectedRow& expected)
{
    Row row{ .wires = expected.wires,
             .q_m = expected.non_gate[0],
             .q_c = expected.non_gate[1],
             .q_1 = expected.non_gate[2],
             .q_2 = expected.non_gate[3],
             .q_3 = expected.non_gate[4],
             .q_4 = expected.non_gate[5],
             .q_5 = expected.non_gate[6],
             .gate_value = expected.gate_value };
    if (expected.kind == GateKind::Arith) {
        block.append_gate<GateKind::Arith>(row);
    } else if (expected.kind == GateKind::Elliptic) {
        block.append_gate<GateKind::Elliptic>(row);
    } else {
        block.append_unconstrained_row(row);
    }
}

std::array<Selector<FF>*, 7> non_gate_columns(Block& block)
{
    return { &block.q_m(), &block.q_c(), &block.q_1(), &block.q_2(), &block.q_3(), &block.q_4(), &block.q_5() };
}

FF expected_gate_selector(const ExpectedRow& row, GateKind kind)
{
    return row.kind == kind ? row.gate_value : FF(0);
}

void expect_block_matches(Block& block, const std::vector<ExpectedRow>& rows)
{
    ASSERT_EQ(block.size(), rows.size());
    const auto columns = non_gate_columns(block);
    for (size_t i = 0; i < rows.size(); ++i) {
        for (size_t w = 0; w < BLOCK_WIRES; ++w) {
            EXPECT_EQ(block.wires[w][i], rows[i].wires[w]);
        }
        for (size_t c = 0; c < columns.size(); ++c) {
            EXPECT_EQ((*columns[c])[i], rows[i].non_gate[c]) << "row " << i << " column " << c;
        }
        for (GateKind kind : { GateKind::Arith, GateKind::Elliptic }) {
            EXPECT_EQ(block.gate_selector_for(kind)[i], expected_gate_selector(rows[i], kind)) << "row " << i;
            EXPECT_EQ(read_gate_selector(block, kind, i), expected_gate_selector(rows[i], kind)) << "row " << i;
        }
        EXPECT_EQ(read_gate_selector(block, GateKind::Memory, i), FF(0));
    }
}

} // namespace

TEST(ExecutionTraceBlock, SelectorValuesRoundTrip)
{
    constexpr size_t NUM_ROWS = 3001; // several tiles plus a partial one
    const auto rows = random_rows(NUM_ROWS);
    Block block;
    for (const auto& row : rows) {
        append(block, row);
    }
    expect_block_matches(block, rows);
    EXPECT_EQ(block.q_c().back(), rows.back().non_gate[1]);

    // copy_into over unaligned and aligned windows, straight into the destination.
    const auto columns = non_gate_columns(block);
    for (auto [start, count] : { std::pair<size_t, size_t>{ 0, NUM_ROWS }, { 3, 21 }, { 8, 16 }, { 13, 2 } }) {
        for (size_t c = 0; c < columns.size(); ++c) {
            std::vector<FF> dst(count);
            columns[c]->copy_into(dst.data(), start, count);
            for (size_t i = 0; i < count; ++i) {
                EXPECT_EQ(dst[i], rows[start + i].non_gate[c]) << "column " << c << " row " << start + i;
            }
        }
        for (GateKind kind : { GateKind::Arith, GateKind::Elliptic }) {
            std::vector<FF> dst(count);
            block.gate_selector_for(kind).copy_into(dst.data(), start, count);
            for (size_t i = 0; i < count; ++i) {
                EXPECT_EQ(dst[i], expected_gate_selector(rows[start + i], kind)) << "row " << start + i;
            }
        }
    }
}

TEST(ExecutionTraceBlock, SetOverwritesAndKeepsReferencesValid)
{
    auto rows = random_rows(100);
    Block block;
    for (const auto& row : rows) {
        append(block, row);
    }
    const FF& held = block.q_1()[5];
    const FF held_value = held;

    const auto pool = selector_value_pool();
    auto& engine = numeric::get_debug_randomness();
    for (size_t i = 0; i < rows.size(); ++i) {
        const FF fresh = FF::random_element(&engine); // grows the tables well past their initial size
        block.q_c().set(i, fresh);
        rows[i].non_gate[1] = fresh;
        block.q_m().set(i, static_cast<int>(i) - 50);
        rows[i].non_gate[0] = FF(static_cast<int>(i) - 50);
        if (rows[i].kind != GateKind::Elliptic) {
            // Claims unconstrained rows for Arith.
            block.gate_selector_for(GateKind::Arith).set(i, pool[i % pool.size()]);
            rows[i].kind = GateKind::Arith;
            rows[i].gate_value = pool[i % pool.size()];
        }
    }
    EXPECT_EQ(held, held_value);
    expect_block_matches(block, rows);
}

TEST(ExecutionTraceBlock, CopyMoveAndEqualityFollowValues)
{
    const auto rows = random_rows(500);
    Block block;
    for (const auto& row : rows) {
        append(block, row);
    }

    Block copy = block;
    expect_block_matches(copy, rows);
    EXPECT_EQ(copy, block);

    // Same values, first seen in a different order, so the blocks assign different ids.
    Block reordered;
    for (const auto& row : rows) {
        append(reordered, ExpectedRow{ row.wires, {}, GateKind::None, FF(0) });
    }
    for (size_t i = rows.size(); i-- > 0;) {
        const auto columns = non_gate_columns(reordered);
        for (size_t c = 0; c < columns.size(); ++c) {
            columns[c]->set(i, rows[i].non_gate[c]);
        }
        if (rows[i].kind != GateKind::None) {
            reordered.gate_selector_for(rows[i].kind).set(i, rows[i].gate_value);
        }
    }
    EXPECT_EQ(reordered, block);
    reordered.q_5().set(7, rows[7].non_gate[6] + FF(1));
    EXPECT_FALSE(reordered == block);

    Block moved = std::move(copy);
    expect_block_matches(moved, rows);

    moved.free_data();
    EXPECT_EQ(moved.size(), rows.size());
}

// One uint32 id per wire and per selector column (q_m, q_c, q_1..q_5, gate_value) plus the gate kind byte.
TEST(ExecutionTraceBlock, PerGateStorage)
{
    using Tile = Block::Tile;
    constexpr size_t PER_GATE = (BLOCK_WIRES + 8) * sizeof(uint32_t) + sizeof(GateKind);
    EXPECT_EQ(PER_GATE, 49UL);
    EXPECT_EQ(sizeof(Tile), PER_GATE * GATE_TILE_SIZE);

    // Growth appends chunks without moving existing tiles.
    Block block;
    append(block, random_rows(1).front());
    const Tile* first = &block.tiles[0];
    for (const auto& row : random_rows(20000)) {
        append(block, row);
    }
    EXPECT_EQ(&block.tiles[0], first);
    EXPECT_LT(block.tiles.capacity() - block.tiles.size(), TileChunks<Tile>::CHUNK_TILES);
}
