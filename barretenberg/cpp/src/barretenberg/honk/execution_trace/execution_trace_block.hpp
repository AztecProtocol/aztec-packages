#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <algorithm>
#include <array>
#include <bit>
#include <cstddef>
#include <cstring>
#include <functional>
#include <limits>
#include <memory>
#include <utility>
#include <vector>

#ifdef CHECK_CIRCUIT_STACKTRACES
#include <backward.hpp>
#endif

namespace bb {

#ifdef CHECK_CIRCUIT_STACKTRACES
struct BbStackTrace : backward::StackTrace {
    BbStackTrace() { load_here(32); }
};
struct StackTraces {
    std::vector<BbStackTrace> stack_traces;
    void populate() { stack_traces.emplace_back(); }
    // A block can hold more rows than recorded traces (e.g. rows appended before this trace list was
    // attached), and this runs from the circuit checker's failure path: report the gap rather than
    // throwing, so a legitimately failing circuit check is not reported as a C++ exception.
    void print(size_t gate_idx) const
    {
        if (gate_idx >= stack_traces.size()) {
            info("No stack trace recorded for gate index ", gate_idx, " (", stack_traces.size(), " recorded).");
            return;
        }
        backward::Printer{}.print(stack_traces.at(gate_idx));
    }
    // Don't interfere with equality semantics of structs that include this in debug builds
    bool operator==(const StackTraces& other) const
    {
        static_cast<void>(other);
        return true;
    }
};
#endif

/**
 * @brief Tag identifying which gate selector a block owns. Used by cross-block readers to decide
 * whether `(block, idx)` returns the block's value or zero.
 */
enum class GateKind : uint8_t {
    None = 0,
    BusRead,
    Lookup,
    Arith,
    BilinearBatchedEq,
    DeltaRange,
    Elliptic,
    Memory,
    Nnf,
    Poseidon2Ext,
    Poseidon2Int, // Ultra-only
    Poseidon2ExtInitial,
    Poseidon2QuadInt,
    Poseidon2QuadIntTerminal,
    Poseidon2TransitionEntry,
    NUM_GATE_KINDS, // sentinel; not a gate kind
};

/**
 * @brief Set of `GateKind`s as a bitmask, bit i holding kind i.
 */
using GateKindMask = uint32_t;
static_assert(static_cast<size_t>(GateKind::NUM_GATE_KINDS) <= sizeof(GateKindMask) * 8);

constexpr GateKindMask gate_kind_bit(GateKind kind)
{
    return GateKindMask{ 1 } << static_cast<uint8_t>(kind);
}
/**
 * @brief Fold a flavor's `GATE_KINDS` into the mask its execution trace declares, so the two can be compared
 * at compile time (see the static_asserts in the generated flavor headers).
 */
template <size_t N> constexpr GateKindMask gate_kinds_mask(const std::array<GateKind, N>& gate_kinds)
{
    GateKindMask mask = 0;
    for (GateKind kind : gate_kinds) {
        mask |= gate_kind_bit(kind);
    }
    return mask;
}

/**
 * @brief Fold a flavor's `BUILDER_BUS_INDICES` into the databus mask its execution trace declares.
 */
template <size_t N> constexpr uint32_t bus_indices_mask(const std::array<size_t, N>& bus_indices)
{
    uint32_t mask = 0;
    for (size_t idx : bus_indices) {
        mask |= uint32_t{ 1 } << idx;
    }
    return mask;
}

/**
 * @brief One gate: its wire indices, the non-gate selectors present on every block (see
 * NON_GATE_SELECTORS), and the single active gate selector (kind + value; at most one gate kind is
 * active per row).
 * @details Row-major storage: each gate is one contiguous append into one vector, instead of
 * scattered appends into per-column vectors (4 wires + 7 selectors + one vector per owned gate
 * kind). All gate creation paths either activate a single owned kind or leave every owned kind
 * zero, so (gate_kind, gate_value) captures the full gate-selector row.
 */
template <typename FF, size_t NUM_WIRES> struct GateRow {
    std::array<uint32_t, NUM_WIRES> wires{};
    FF q_m{};
    FF q_c{};
    FF q_1{};
    FF q_2{};
    FF q_3{};
    FF q_4{};
    FF q_5{};
    FF gate_value{};

    bool operator==(const GateRow& other) const = default;
};

// Gates are stored in tiles of GATE_TILE_SIZE: within a tile each field is a small contiguous
// array, so per-gate writes stay within one hot tile while per-column reads see contiguous runs
// instead of one strided element per row (AoSoA). GATE_TILE_SIZE is a benchmarked cache trade-off,
// deliberately a fixed constant.
static constexpr size_t GATE_TILE_SIZE = 8;
static_assert(std::has_single_bit(GATE_TILE_SIZE));
static constexpr size_t GATE_TILE_SHIFT = std::countr_zero(GATE_TILE_SIZE);
static constexpr size_t GATE_TILE_MASK = GATE_TILE_SIZE - 1;

/**
 * @brief Append-only storage in fixed-size chunks of 2^ChunkShift elements, so growth never reallocates or copies
 * existing elements (references to them stay valid) and the slack is under one chunk (a std::vector peaks at up to 3x
 * the used size while doubling).
 */
template <typename Tile, size_t ChunkShift = 8> class TileChunks {
  public:
    static constexpr size_t CHUNK_SHIFT = ChunkShift;
    static constexpr size_t CHUNK_TILES = size_t{ 1 } << CHUNK_SHIFT;
    static constexpr size_t CHUNK_MASK = CHUNK_TILES - 1;
    using Chunk = std::array<Tile, CHUNK_TILES>;

    TileChunks() = default;
    TileChunks(const TileChunks& other)
        : size_(other.size_)
    {
        chunks_.reserve(other.chunks_.size());
        for (const auto& chunk : other.chunks_) {
            chunks_.push_back(std::make_unique<Chunk>(*chunk));
        }
    }
    TileChunks& operator=(const TileChunks& other)
    {
        if (this != &other) {
            *this = TileChunks(other);
        }
        return *this;
    }
    TileChunks(TileChunks&& other) noexcept
        : chunks_(std::move(other.chunks_))
        , size_(std::exchange(other.size_, 0))
    {}
    TileChunks& operator=(TileChunks&& other) noexcept
    {
        chunks_ = std::move(other.chunks_);
        size_ = std::exchange(other.size_, 0);
        return *this;
    }
    ~TileChunks() = default;

    Tile& operator[](size_t i) { return (*chunks_[i >> CHUNK_SHIFT])[i & CHUNK_MASK]; }
    const Tile& operator[](size_t i) const { return (*chunks_[i >> CHUNK_SHIFT])[i & CHUNK_MASK]; }

    /** @brief Append a zero-initialized element. */
    Tile& emplace_back()
    {
        if (size_ == chunks_.size() * CHUNK_TILES) {
            chunks_.push_back(std::make_unique<Chunk>());
        }
        return (*this)[size_++];
    }

    void reserve(size_t num_tiles) { chunks_.reserve((num_tiles + CHUNK_MASK) >> CHUNK_SHIFT); }

    size_t size() const { return size_; }
    size_t capacity() const { return chunks_.size() * CHUNK_TILES; }

    void clear()
    {
        chunks_.clear();
        chunks_.shrink_to_fit();
        size_ = 0;
    }

  private:
    std::vector<std::unique_ptr<Chunk>> chunks_;
    size_t size_ = 0;
};

/**
 * @brief Dedup table of one selector column's values: each distinct value is stored once and gates store its id.
 * @details Selector values are circuit structure drawn from a small set (0, ±1, small integers, ACIR coefficients), so
 * gates store a uint32 id into the column's value table. Id 0 is always zero, so a zero-initialized tile reads as all
 * selectors zero. Values live in chunked storage so the references Selector::operator[] returns stay valid as the table
 * grows;
 * the index is open-addressed over ids and hashes the reduced value, matching field equality.
 */
template <typename FF> class SelectorValueTable {
  public:
    SelectorValueTable() { values_.emplace_back() = FF(0); }

    uint32_t intern(const FF& value)
    {
        if (value.is_zero()) {
            return 0;
        }
        if (2 * values_.size() >= slots_.size()) {
            grow();
        }
        const FF reduced = value.reduce_once();
        const size_t mask = slots_.size() - 1;
        for (size_t slot = std::hash<FF>{}(reduced)&mask;; slot = (slot + 1) & mask) {
            const uint32_t id = slots_[slot];
            if (id == EMPTY_SLOT) {
                BB_ASSERT_LT(values_.size(), static_cast<size_t>(EMPTY_SLOT), "SelectorValueTable: too many values");
                const auto new_id = static_cast<uint32_t>(values_.size());
                values_.emplace_back() = reduced;
                slots_[slot] = new_id;
                return new_id;
            }
            if (values_[id] == reduced) {
                return id;
            }
        }
    }

    const FF& operator[](uint32_t id) const { return values_[id]; }

    /** @brief Number of distinct values, zero included. */
    size_t size() const { return values_.size(); }

    /** @brief Approximate heap bytes held by the table. */
    size_t memory_bytes() const { return values_.capacity() * sizeof(FF) + slots_.capacity() * sizeof(uint32_t); }

    void clear() { *this = SelectorValueTable{}; }

  private:
    static constexpr uint32_t EMPTY_SLOT = std::numeric_limits<uint32_t>::max();

    void grow()
    {
        const size_t new_size = std::max<size_t>(16, slots_.size() * 2);
        slots_.assign(new_size, EMPTY_SLOT);
        const size_t mask = new_size - 1;
        for (uint32_t id = 1; id < values_.size(); ++id) {
            size_t slot = std::hash<FF>{}(values_[id]) & mask;
            while (slots_[slot] != EMPTY_SLOT) {
                slot = (slot + 1) & mask;
            }
            slots_[slot] = id;
        }
    }

    // 16 values per chunk: most tables hold a handful of values, and a block has one table per selector column.
    TileChunks<FF, 4> values_;
    std::vector<uint32_t> slots_;
};

/**
 * @brief Eight gates: wire indices, and per selector column the SelectorValueTable id of each gate's value.
 */
template <typename FF, size_t NUM_WIRES> struct GateTile {
    using Ids = std::array<uint32_t, GATE_TILE_SIZE>;

    std::array<Ids, NUM_WIRES> wires{};
    Ids q_m{};
    Ids q_c{};
    Ids q_1{};
    Ids q_2{};
    Ids q_3{};
    Ids q_4{};
    Ids q_5{};
    Ids gate_value{};
    std::array<GateKind, GATE_TILE_SIZE> gate_kind{};
};

/**
 * @brief The (GateRow field, GateTile field) pair of one non-gate selector.
 */
template <typename FF, size_t NUM_WIRES> struct NonGateSelectorField {
    FF GateRow<FF, NUM_WIRES>::* row_field;
    typename GateTile<FF, NUM_WIRES>::Ids GateTile<FF, NUM_WIRES>::* tile_field;
};

// The single definition of the non-gate selector list and its order: the selector count,
// append_gate's row->tile copies, and the block's column wiring all derive from this table.
// The q_m()..q_5() accessors on ExecutionTraceBlock index columns_ in this order, and the
// block's value tables are indexed the same way, with the gate value table last.
template <typename FF, size_t NUM_WIRES>
inline constexpr std::array NON_GATE_SELECTORS{
    NonGateSelectorField<FF, NUM_WIRES>{ &GateRow<FF, NUM_WIRES>::q_m, &GateTile<FF, NUM_WIRES>::q_m },
    NonGateSelectorField<FF, NUM_WIRES>{ &GateRow<FF, NUM_WIRES>::q_c, &GateTile<FF, NUM_WIRES>::q_c },
    NonGateSelectorField<FF, NUM_WIRES>{ &GateRow<FF, NUM_WIRES>::q_1, &GateTile<FF, NUM_WIRES>::q_1 },
    NonGateSelectorField<FF, NUM_WIRES>{ &GateRow<FF, NUM_WIRES>::q_2, &GateTile<FF, NUM_WIRES>::q_2 },
    NonGateSelectorField<FF, NUM_WIRES>{ &GateRow<FF, NUM_WIRES>::q_3, &GateTile<FF, NUM_WIRES>::q_3 },
    NonGateSelectorField<FF, NUM_WIRES>{ &GateRow<FF, NUM_WIRES>::q_4, &GateTile<FF, NUM_WIRES>::q_4 },
    NonGateSelectorField<FF, NUM_WIRES>{ &GateRow<FF, NUM_WIRES>::q_5, &GateTile<FF, NUM_WIRES>::q_5 },
};

/**
 * @brief Read (and targeted-write) interface over one selector column.
 * @details Columns are views into the row-major gate storage; appending happens exclusively through
 * ExecutionTraceBlock::append_gate, so this interface deliberately has no append or resize —
 * a misdirected per-column append is a compile error.
 */
template <typename FF> class Selector {
  public:
    Selector() = default;
    virtual ~Selector() = default;

    Selector(const Selector&) = default;
    Selector& operator=(const Selector&) = default;
    Selector(Selector&&) = delete;
    Selector& operator=(Selector&&) = delete;

    /**
     * @brief Set the value at index using integer.
     */
    virtual void set(size_t idx, int value) = 0;

    /**
     * @brief Set the value at index using a field element.
     */
    virtual void set(size_t idx, const FF& value) = 0;

    /**
     * @brief Get value at specified index.
     */
    virtual const FF& operator[](size_t index) const = 0;

    /**
     * @brief Get the last value in the selector.
     */
    virtual const FF& back() const = 0;

    virtual size_t size() const = 0;
    virtual bool empty() const = 0;

    /**
     * @brief Bulk-copy `count` values of this column starting at `start` into `dst` (tile-wise,
     * avoiding a virtual call per element).
     */
    virtual void copy_into(FF* dst, size_t start, size_t count) const = 0;
};

/**
 * @brief Column view over one non-gate selector field of the row-major gate storage: the tiles hold ids into the
 * column's SelectorValueTable.
 */
template <typename FF, size_t NUM_WIRES> class SelectorColumn : public Selector<FF> {
  public:
    using Tile = GateTile<FF, NUM_WIRES>;
    using Tiles = TileChunks<Tile>;
    using Field = typename Tile::Ids Tile::*;
    using Table = SelectorValueTable<FF>;

    SelectorColumn(Tiles* tiles, const size_t* num_rows, Field field, Table* table)
        : tiles_(tiles)
        , num_rows_(num_rows)
        , field_(field)
        , table_(table)
    {}

    void set(size_t idx, int value) override { set(idx, FF(value)); }
    void set(size_t idx, const FF& value) override { id_at(idx) = table_->intern(value); }

    const FF& operator[](size_t i) const override
    {
        return (*table_)[((*tiles_)[i >> GATE_TILE_SHIFT].*field_)[i & GATE_TILE_MASK]];
    }
    const FF& back() const override { return (*this)[*num_rows_ - 1]; }

    size_t size() const override { return *num_rows_; }
    bool empty() const override { return *num_rows_ == 0; }

    void copy_into(FF* dst, size_t start, size_t count) const override
    {
        size_t i = 0;
        while (i < count && ((start + i) & GATE_TILE_MASK) != 0) {
            dst[i] = (*this)[start + i];
            ++i;
        }
        for (; i + GATE_TILE_SIZE <= count; i += GATE_TILE_SIZE) {
            const auto& ids = (*tiles_)[(start + i) >> GATE_TILE_SHIFT].*field_;
            constexpr_for<0, GATE_TILE_SIZE, 1>([&]<size_t k>() { dst[i + k] = (*table_)[ids[k]]; });
        }
        for (; i < count; ++i) {
            dst[i] = (*this)[start + i];
        }
    }

  private:
    uint32_t& id_at(size_t i) { return ((*tiles_)[i >> GATE_TILE_SHIFT].*field_)[i & GATE_TILE_MASK]; }

    Tiles* tiles_;
    const size_t* num_rows_;
    Field field_;
    Table* table_;
};

/**
 * @brief Column view over the gate selector of one kind in the row-major gate storage: rows whose
 * gate_kind matches read their gate_value, all other rows read zero.
 */
template <typename FF, size_t NUM_WIRES> class GateSelectorColumn : public Selector<FF> {
  public:
    using Tile = GateTile<FF, NUM_WIRES>;
    using Tiles = TileChunks<Tile>;
    using Table = SelectorValueTable<FF>;

    GateSelectorColumn(Tiles* tiles, const size_t* num_rows, GateKind kind, Table* gate_values)
        : tiles_(tiles)
        , num_rows_(num_rows)
        , kind_(kind)
        , gate_values_(gate_values)
    {}

    void set(size_t idx, int value) override { set(idx, FF(value)); }
    void set(size_t idx, const FF& value) override
    {
        Tile& tile = (*tiles_)[idx >> GATE_TILE_SHIFT];
        const size_t slot = idx & GATE_TILE_MASK;
        if (tile.gate_kind[slot] != kind_) {
            // Only one gate kind may be active per row; claiming the row is only legal if no other
            // kind holds a nonzero value on it (id 0 is zero).
            BB_ASSERT(tile.gate_value[slot] == 0,
                      "GateSelectorColumn: overwriting an active gate selector of another kind");
            tile.gate_kind[slot] = kind_;
        }
        tile.gate_value[slot] = gate_values_->intern(value);
    }

    const FF& operator[](size_t i) const override
    {
        const Tile& tile = (*tiles_)[i >> GATE_TILE_SHIFT];
        const size_t slot = i & GATE_TILE_MASK;
        return (*gate_values_)[tile.gate_kind[slot] == kind_ ? tile.gate_value[slot] : 0];
    }
    const FF& back() const override { return (*this)[*num_rows_ - 1]; }

    size_t size() const override { return *num_rows_; }
    bool empty() const override { return *num_rows_ == 0; }

    void copy_into(FF* dst, size_t start, size_t count) const override
    {
        size_t i = 0;
        while (i < count && ((start + i) & GATE_TILE_MASK) != 0) {
            dst[i] = (*this)[start + i];
            ++i;
        }
        for (; i + GATE_TILE_SIZE <= count; i += GATE_TILE_SIZE) {
            const Tile& tile = (*tiles_)[(start + i) >> GATE_TILE_SHIFT];
            constexpr_for<0, GATE_TILE_SIZE, 1>(
                [&]<size_t k>() { dst[i + k] = (*gate_values_)[tile.gate_kind[k] == kind_ ? tile.gate_value[k] : 0]; });
        }
        for (; i < count; ++i) {
            dst[i] = (*this)[start + i];
        }
    }

    GateKind kind() const { return kind_; }

  private:
    Tiles* tiles_;
    const size_t* num_rows_;
    GateKind kind_;
    Table* gate_values_;
};

/**
 * @brief Mutable view over one wire column of the row-major gate storage.
 */
template <typename FF, size_t NUM_WIRES> class WireColumn {
  public:
    using Tile = GateTile<FF, NUM_WIRES>;
    using Tiles = TileChunks<Tile>;

    WireColumn(Tiles* tiles, const size_t* num_rows, size_t wire_idx)
        : tiles_(tiles)
        , num_rows_(num_rows)
        , wire_idx_(wire_idx)
    {}

    uint32_t& operator[](size_t i) { return (*tiles_)[i >> GATE_TILE_SHIFT].wires[wire_idx_][i & GATE_TILE_MASK]; }
    const uint32_t& operator[](size_t i) const
    {
        return (*tiles_)[i >> GATE_TILE_SHIFT].wires[wire_idx_][i & GATE_TILE_MASK];
    }
    uint32_t& back() { return (*this)[*num_rows_ - 1]; }
    const uint32_t& back() const { return (*this)[*num_rows_ - 1]; }
    size_t size() const { return *num_rows_; }
    bool empty() const { return *num_rows_ == 0; }

    // Minimal iterator support for range-for over a wire column.
    class const_iterator {
      public:
        const_iterator(const WireColumn* col, size_t i)
            : col_(col)
            , i_(i)
        {}
        const uint32_t& operator*() const { return (*col_)[i_]; }
        const_iterator& operator++()
        {
            ++i_;
            return *this;
        }
        bool operator!=(const const_iterator& other) const { return i_ != other.i_; }

      private:
        const WireColumn* col_;
        size_t i_;
    };
    const_iterator begin() const { return { this, 0 }; }
    const_iterator end() const { return { this, size() }; }

  private:
    Tiles* tiles_;
    const size_t* num_rows_;
    size_t wire_idx_;
};

/**
 * @brief Row-major storage for the gates of one execution trace block: one vector of GateRow.
 * Column accessors (wires, q_m..q_5, gate selectors) return persistent views into the rows.
 */
template <typename FF> class ExecutionTraceBlockStorage {
  public:
    static constexpr size_t NUM_WIRES = 4;
    static constexpr size_t NUM_NON_GATE_SELECTORS = NON_GATE_SELECTORS<FF, NUM_WIRES>.size();

    using Row = GateRow<FF, NUM_WIRES>;
    using Tile = GateTile<FF, NUM_WIRES>;
    using Table = SelectorValueTable<FF>;
    using WireType = WireColumn<FF, NUM_WIRES>;
    using Wires = std::array<WireType, NUM_WIRES>;

  protected:
    ExecutionTraceBlockStorage() = default;

    /**
     * @brief Construct a block that owns the listed gate kinds.
     */
    ExecutionTraceBlockStorage(std::initializer_list<GateKind> kinds)
    {
        gate_columns_.reserve(kinds.size());
        for (GateKind k : kinds) {
            gate_columns_.emplace_back(&tiles, &num_rows_, k, &gate_value_table());
        }
    }

  public:
    // The column views alias this block's row storage; copies and moves rebind them to their own storage.
    ExecutionTraceBlockStorage(const ExecutionTraceBlockStorage& other)
        : cached_size_(other.cached_size_)
        , data_freed_(other.data_freed_)
        , trace_offset_(other.trace_offset_)
        , tiles(other.tiles)
        , num_rows_(other.num_rows_)
        , value_tables_(other.value_tables_)
    {
        copy_stack_traces_from(other);
        copy_gate_columns_from(other);
    }
    ExecutionTraceBlockStorage& operator=(const ExecutionTraceBlockStorage& other)
    {
        if (this == &other) {
            return *this;
        }
        cached_size_ = other.cached_size_;
        data_freed_ = other.data_freed_;
        trace_offset_ = other.trace_offset_;
        tiles = other.tiles;
        num_rows_ = other.num_rows_;
        value_tables_ = other.value_tables_;
        copy_stack_traces_from(other);
        copy_gate_columns_from(other);
        return *this;
    }
    ExecutionTraceBlockStorage(ExecutionTraceBlockStorage&& other) noexcept
        : cached_size_(other.cached_size_)
        , data_freed_(other.data_freed_)
        , trace_offset_(other.trace_offset_)
        , tiles(std::move(other.tiles))
        , num_rows_(other.num_rows_)
        , value_tables_(std::move(other.value_tables_))
    {
        move_stack_traces_from(other);
        copy_gate_columns_from(other);
    }
    ExecutionTraceBlockStorage& operator=(ExecutionTraceBlockStorage&& other) noexcept
    {
        cached_size_ = other.cached_size_;
        data_freed_ = other.data_freed_;
        trace_offset_ = other.trace_offset_;
        tiles = std::move(other.tiles);
        num_rows_ = other.num_rows_;
        value_tables_ = std::move(other.value_tables_);
        move_stack_traces_from(other);
        copy_gate_columns_from(other);
        return *this;
    }
    ~ExecutionTraceBlockStorage() = default;

#ifdef CHECK_CIRCUIT_STACKTRACES
    // If enabled, we keep slow stack traces to be able to correlate gates with code locations where they were added
    StackTraces stack_traces;
#endif
#ifdef TRACY_HACK_GATES_AS_MEMORY
    std::vector<size_t> allocated_gates;
#endif
    void tracy_gate()
    {
#ifdef TRACY_HACK_GATES_AS_MEMORY
        std::unique_lock<std::mutex> lock(GLOBAL_GATE_MUTEX);
        GLOBAL_GATE++;
        TRACY_GATE_ALLOC(GLOBAL_GATE);
        allocated_gates.push_back(GLOBAL_GATE);
#endif
    }

    size_t cached_size_ = 0;                                       // set by free_data() so size() works after freeing
    bool data_freed_ = false;                                      // true after free_data() has been called
    uint32_t trace_offset_ = std::numeric_limits<uint32_t>::max(); // where this block starts in the trace

    uint32_t trace_offset() const
    {
        BB_ASSERT(trace_offset_ != std::numeric_limits<uint32_t>::max());
        return trace_offset_;
    }

    // The first trace row past this block's data (trace_offset + size).
    size_t trace_end() const { return trace_offset() + size(); }

    // Compares gate values, not ids: ids depend on the order in which each block first saw a value.
    bool operator==(const ExecutionTraceBlockStorage& other) const
    {
        if (cached_size_ != other.cached_size_ || data_freed_ != other.data_freed_ ||
            trace_offset_ != other.trace_offset_ || num_rows_ != other.num_rows_) {
            return false;
        }
        for (size_t i = 0; i < num_rows_; ++i) {
            const Tile& lhs = tiles[i >> GATE_TILE_SHIFT];
            const Tile& rhs = other.tiles[i >> GATE_TILE_SHIFT];
            const size_t slot = i & GATE_TILE_MASK;
            for (size_t w = 0; w < NUM_WIRES; ++w) {
                if (lhs.wires[w][slot] != rhs.wires[w][slot]) {
                    return false;
                }
            }
            for (size_t c = 0; c < NUM_NON_GATE_SELECTORS; ++c) {
                const auto field = NON_GATE_SELECTORS<FF, NUM_WIRES>[c].tile_field;
                if (value_tables_[c][(lhs.*field)[slot]] != other.value_tables_[c][(rhs.*field)[slot]]) {
                    return false;
                }
            }
            if (lhs.gate_kind[slot] != rhs.gate_kind[slot] ||
                gate_value_table()[lhs.gate_value[slot]] != other.gate_value_table()[rhs.gate_value[slot]]) {
                return false;
            }
        }
        return true;
    }

    /**
     * @brief Gate-selector value at row `idx` for `kind`: the row's gate value if it holds that kind, zero otherwise.
     */
    const FF& gate_selector_or_zero(size_t idx, GateKind kind) const
    {
        const Tile& tile = tiles[idx >> GATE_TILE_SHIFT];
        const size_t slot = idx & GATE_TILE_MASK;
        return gate_value_table()[tile.gate_kind[slot] == kind ? tile.gate_value[slot] : 0];
    }

    /** @brief Heap bytes held by the selector value tables. */
    size_t value_table_bytes() const
    {
        size_t bytes = 0;
        for (const auto& table : value_tables_) {
            bytes += table.memory_bytes();
        }
        return bytes;
    }

    /** @brief Distinct values per column (zero included): q_m..q_5 in NON_GATE_SELECTORS order, then gate values. */
    std::array<size_t, NUM_NON_GATE_SELECTORS + 1> value_table_sizes() const
    {
        std::array<size_t, NUM_NON_GATE_SELECTORS + 1> sizes{};
        for (size_t c = 0; c < sizes.size(); ++c) {
            sizes[c] = value_tables_[c].size();
        }
        return sizes;
    }

    size_t size() const { return data_freed_ ? cached_size_ : num_rows_; }

  private:
    template <typename, GateKind...> friend class ExecutionTraceBlock;

    /**
     * @brief Append one complete gate: wires, non-gate selectors, and the (single) active gate selector.
     */
    void append_row(Row row, GateKind kind)
    {
#ifdef CHECK_CIRCUIT_STACKTRACES
        this->stack_traces.populate();
#endif
        this->tracy_gate();
        Tile& tile = tile_for_append();
        const size_t slot = num_rows_ & GATE_TILE_MASK;
        for (size_t w = 0; w < NUM_WIRES; ++w) {
            tile.wires[w][slot] = row.wires[w];
        }
        for (size_t c = 0; c < NUM_NON_GATE_SELECTORS; ++c) {
            const auto& sel = NON_GATE_SELECTORS<FF, NUM_WIRES>[c];
            (tile.*sel.tile_field)[slot] = value_tables_[c].intern(row.*sel.row_field);
        }
        tile.gate_kind[slot] = kind;
        tile.gate_value[slot] = gate_value_table().intern(row.gate_value);
        ++num_rows_;
    }

  public:
    /**
     * @brief Reserve capacity for `num_rows` gates.
     */
    void reserve(size_t num_rows) { tiles.reserve((num_rows + GATE_TILE_SIZE - 1) >> GATE_TILE_SHIFT); }

    /**
     * @brief Reference to this block's selector view for `kind`; aborts if the block does not own it.
     * For cross-block reads, use `read_gate_selector` instead.
     */
    GateSelectorColumn<FF, NUM_WIRES>& gate_selector_for(GateKind kind)
    {
        for (auto& col : gate_columns_) {
            if (col.kind() == kind) {
                return col;
            }
        }
        throw_or_abort("ExecutionTraceBlock: block does not own this gate kind");
        return gate_columns_[0]; // unreachable
    }

    /**
     * @brief All selectors of this block: the non-gate selectors followed by the owned gate selectors.
     */
    RefVector<Selector<FF>> get_selectors()
    {
        std::vector<Selector<FF>*> ptrs;
        ptrs.reserve(columns_.size() + gate_columns_.size());
        for (auto& s : columns_) {
            ptrs.push_back(&s);
        }
        for (auto& s : gate_columns_) {
            ptrs.push_back(&s);
        }
        return RefVector<Selector<FF>>(ptrs);
    }

#ifdef TRACY_HACK_GATES_AS_MEMORY
    ~ExecutionTraceBlockStorage()
    {
        std::unique_lock<std::mutex> lock(GLOBAL_GATE_MUTEX);
        for ([[maybe_unused]] size_t gate : allocated_gates) {
            if (!FREED_GATES.contains(gate)) {
                TRACY_GATE_FREE(gate);
                FREED_GATES.insert(gate);
            }
        }
    }
#endif

    /**
     * @brief Release gate memory. Caches block size so size() still works.
     * @details Called after trace data has been copied to prover polynomials.
     */
    void free_data()
    {
        cached_size_ = num_rows_;
        data_freed_ = true;
        tiles.clear();
        for (auto& table : value_tables_) {
            table.clear();
        }
        num_rows_ = 0;
    }

    WireType& w_l() { return wires[0]; };
    WireType& w_r() { return wires[1]; };
    WireType& w_o() { return wires[2]; };
    WireType& w_4() { return wires[3]; };

    // Accessor indices follow NON_GATE_SELECTORS table order.
    SelectorColumn<FF, NUM_WIRES>& q_m() { return columns_[0]; };
    SelectorColumn<FF, NUM_WIRES>& q_c() { return columns_[1]; };
    SelectorColumn<FF, NUM_WIRES>& q_1() { return columns_[2]; };
    SelectorColumn<FF, NUM_WIRES>& q_2() { return columns_[3]; };
    SelectorColumn<FF, NUM_WIRES>& q_3() { return columns_[4]; };
    SelectorColumn<FF, NUM_WIRES>& q_4() { return columns_[5]; };
    SelectorColumn<FF, NUM_WIRES>& q_5() { return columns_[6]; };

    TileChunks<Tile> tiles;
    size_t num_rows_ = 0;

    // Wire column views; rebound on copy/move alongside the selector views.
    Wires wires{ WireType{ &tiles, &num_rows_, 0 },
                 WireType{ &tiles, &num_rows_, 1 },
                 WireType{ &tiles, &num_rows_, 2 },
                 WireType{ &tiles, &num_rows_, 3 } };

  private:
    // The stack traces are indexed by row, so they have to travel with the rows they describe.
    void copy_stack_traces_from([[maybe_unused]] const ExecutionTraceBlockStorage& other)
    {
#ifdef CHECK_CIRCUIT_STACKTRACES
        stack_traces = other.stack_traces;
#endif
    }
    void move_stack_traces_from([[maybe_unused]] ExecutionTraceBlockStorage& other)
    {
#ifdef CHECK_CIRCUIT_STACKTRACES
        stack_traces = std::move(other.stack_traces);
#endif
    }

    void copy_gate_columns_from(const ExecutionTraceBlockStorage& other)
    {
        for (size_t i = 0; i < NUM_WIRES; ++i) {
            wires[i] = WireType{ &tiles, &num_rows_, i };
        }
        gate_columns_.clear();
        gate_columns_.reserve(other.gate_columns_.size());
        for (const auto& col : other.gate_columns_) {
            gate_columns_.emplace_back(&tiles, &num_rows_, col.kind(), &gate_value_table());
        }
    }

    Tile& tile_for_append()
    {
        if ((num_rows_ & GATE_TILE_MASK) == 0 && (num_rows_ >> GATE_TILE_SHIFT) == tiles.size()) {
            return tiles.emplace_back();
        }
        return tiles[num_rows_ >> GATE_TILE_SHIFT];
    }

    Table& gate_value_table() { return value_tables_.back(); }
    const Table& gate_value_table() const { return value_tables_.back(); }

    template <size_t... Is>
    std::array<SelectorColumn<FF, NUM_WIRES>, NUM_NON_GATE_SELECTORS> make_selector_columns(std::index_sequence<Is...>)
    {
        return { SelectorColumn<FF, NUM_WIRES>{
            &tiles, &num_rows_, NON_GATE_SELECTORS<FF, NUM_WIRES>[Is].tile_field, &value_tables_[Is] }... };
    }

    // One value table per non-gate selector in NON_GATE_SELECTORS order, then the gate value table shared by the
    // block's gate kinds. Declared before the column views that point into it.
    std::array<Table, NUM_NON_GATE_SELECTORS + 1> value_tables_{};

    // Column views into the tiles, one per NON_GATE_SELECTORS entry in table order; rebound on
    // copy/move (see the copy/move constructors).
    std::array<SelectorColumn<FF, NUM_WIRES>, NUM_NON_GATE_SELECTORS> columns_ =
        make_selector_columns(std::make_index_sequence<NUM_NON_GATE_SELECTORS>{});

    std::vector<GateSelectorColumn<FF, NUM_WIRES>> gate_columns_;
};

/**
 * @brief A trace block whose supported gate kinds are enforced by typed append operations.
 */
template <typename FF, GateKind... OwnedKinds> class ExecutionTraceBlock : public ExecutionTraceBlockStorage<FF> {
    using Base = ExecutionTraceBlockStorage<FF>;

  public:
    using typename Base::Row;

    ExecutionTraceBlock()
        : Base({ OwnedKinds... })
    {}

    template <GateKind Kind>
        requires(((Kind == OwnedKinds) || ...))
    void append_gate(Row row)
    {
        Base::append_row(std::move(row), Kind);
    }

    void append_unconstrained_row(Row row) { Base::append_row(std::move(row), GateKind::None); }

    bool operator==(const ExecutionTraceBlock& other) const = default;
};

/**
 * @brief Gate-selector value at `(block, idx)` for `kind`, returning zero if the block does not own
 * this kind or the row differs. Use when iterating blocks of unknown kind.
 */
template <typename FF> FF read_gate_selector(const ExecutionTraceBlockStorage<FF>& block, GateKind kind, size_t idx)
{
    if (idx >= block.size()) {
        return FF{ 0 };
    }
    return block.gate_selector_or_zero(idx, kind);
}

} // namespace bb
