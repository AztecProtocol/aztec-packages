// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/constexpr_utils.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <bit>
#include <cstddef>
#include <cstring>
#include <utility>

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
};

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
    GateKind gate_kind = GateKind::None;
    FF gate_value{};

    bool operator==(const GateRow& other) const = default;
};

// Gates are stored in tiles of GATE_TILE_SIZE: within a tile each field is a small contiguous
// array, so per-gate writes stay within one hot tile of sizeof(GateTile) bytes — roughly
// GATE_TILE_SIZE * sizeof(GateRow), ~2.4KB for a 32-byte FF — while per-column reads see
// contiguous multi-cache-line runs instead of one strided element per row (AoSoA).
// GATE_TILE_SIZE is a benchmarked cache trade-off for the 32-byte bn254 FF, deliberately a fixed
// constant rather than derived from sizeof(FF) so it cannot drift silently with the field type.
static constexpr size_t GATE_TILE_SIZE = 8;
static_assert(std::has_single_bit(GATE_TILE_SIZE));
static constexpr size_t GATE_TILE_SHIFT = std::countr_zero(GATE_TILE_SIZE);
static constexpr size_t GATE_TILE_MASK = GATE_TILE_SIZE - 1;

template <typename FF, size_t NUM_WIRES> struct GateTile {
    std::array<std::array<uint32_t, GATE_TILE_SIZE>, NUM_WIRES> wires{};
    std::array<FF, GATE_TILE_SIZE> q_m{};
    std::array<FF, GATE_TILE_SIZE> q_c{};
    std::array<FF, GATE_TILE_SIZE> q_1{};
    std::array<FF, GATE_TILE_SIZE> q_2{};
    std::array<FF, GATE_TILE_SIZE> q_3{};
    std::array<FF, GATE_TILE_SIZE> q_4{};
    std::array<FF, GATE_TILE_SIZE> q_5{};
    std::array<FF, GATE_TILE_SIZE> gate_value{};
    std::array<GateKind, GATE_TILE_SIZE> gate_kind{};

    // Gate-selector read semantics: a slot reads its gate_value for the kind it holds, zero for
    // every other kind.
    FF gate_selector_or_zero(size_t slot, GateKind kind) const
    {
        return gate_kind[slot] == kind ? gate_value[slot] : FF{ 0 };
    }

    bool operator==(const GateTile& other) const = default;
};

/**
 * @brief The (GateRow field, GateTile field) pair of one non-gate selector.
 */
template <typename FF, size_t NUM_WIRES> struct NonGateSelectorField {
    FF GateRow<FF, NUM_WIRES>::* row_field;
    std::array<FF, GATE_TILE_SIZE> GateTile<FF, NUM_WIRES>::* tile_field;
};

// The single definition of the non-gate selector list and its order: the selector count,
// append_gate's row->tile copies, and the block's column wiring all derive from this table.
// The q_m()..q_5() accessors on ExecutionTraceBlock index columns_ in this order.
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
 * @brief Column view over one non-gate selector field of the row-major gate storage.
 */
template <typename FF, size_t NUM_WIRES> class SelectorColumn : public Selector<FF> {
  public:
    using Tile = GateTile<FF, NUM_WIRES>;
    using Tiles = std::vector<Tile>;
    using Field = std::array<FF, GATE_TILE_SIZE> Tile::*;

    SelectorColumn(Tiles* tiles, const size_t* num_rows, Field field)
        : tiles_(tiles)
        , num_rows_(num_rows)
        , field_(field)
    {}

    void set(size_t idx, int value) override { at(idx) = value; }
    void set(size_t idx, const FF& value) override { at(idx) = value; }

    const FF& operator[](size_t i) const override
    {
        return ((*tiles_)[i >> GATE_TILE_SHIFT].*field_)[i & GATE_TILE_MASK];
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
            const auto& run = (*tiles_)[(start + i) >> GATE_TILE_SHIFT].*field_;
            memcpy(static_cast<void*>(dst + i), static_cast<const void*>(run.data()), sizeof(FF) * GATE_TILE_SIZE);
        }
        for (; i < count; ++i) {
            dst[i] = (*this)[start + i];
        }
    }

  private:
    FF& at(size_t i) { return ((*tiles_)[i >> GATE_TILE_SHIFT].*field_)[i & GATE_TILE_MASK]; }

    Tiles* tiles_;
    const size_t* num_rows_;
    Field field_;
};

/**
 * @brief Column view over the gate selector of one kind in the row-major gate storage: rows whose
 * gate_kind matches read their gate_value, all other rows read zero.
 */
template <typename FF, size_t NUM_WIRES> class GateSelectorColumn : public Selector<FF> {
  public:
    using Tile = GateTile<FF, NUM_WIRES>;
    using Tiles = std::vector<Tile>;

    GateSelectorColumn(Tiles* tiles, const size_t* num_rows, GateKind kind)
        : tiles_(tiles)
        , num_rows_(num_rows)
        , kind_(kind)
    {}

    void set(size_t idx, int value) override { set(idx, FF(value)); }
    void set(size_t idx, const FF& value) override
    {
        Tile& tile = (*tiles_)[idx >> GATE_TILE_SHIFT];
        const size_t slot = idx & GATE_TILE_MASK;
        if (tile.gate_kind[slot] != kind_) {
            // Only one gate kind may be active per row; claiming the row is only legal if no other
            // kind holds a nonzero value on it.
            BB_ASSERT(tile.gate_value[slot] == FF{ 0 },
                      "GateSelectorColumn: overwriting an active gate selector of another kind");
            tile.gate_kind[slot] = kind_;
        }
        tile.gate_value[slot] = value;
    }

    const FF& operator[](size_t i) const override
    {
        const Tile& tile = (*tiles_)[i >> GATE_TILE_SHIFT];
        const size_t slot = i & GATE_TILE_MASK;
        return tile.gate_kind[slot] == kind_ ? tile.gate_value[slot] : zero_value();
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
            constexpr_for<0, GATE_TILE_SIZE, 1>([&]<size_t k>() { dst[i + k] = tile.gate_selector_or_zero(k, kind_); });
        }
        for (; i < count; ++i) {
            dst[i] = (*this)[start + i];
        }
    }

    GateKind kind() const { return kind_; }

  private:
    static const FF& zero_value()
    {
        static const FF zero{};
        return zero;
    }

    Tiles* tiles_;
    const size_t* num_rows_;
    GateKind kind_;
};

/**
 * @brief Mutable view over one wire column of the row-major gate storage.
 */
template <typename FF, size_t NUM_WIRES> class WireColumn {
  public:
    using Tile = GateTile<FF, NUM_WIRES>;
    using Tiles = std::vector<Tile>;

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
template <typename FF, size_t NUM_WIRES_> class ExecutionTraceBlock {
  public:
    static constexpr size_t NUM_WIRES = NUM_WIRES_;
    static constexpr size_t NUM_NON_GATE_SELECTORS = NON_GATE_SELECTORS<FF, NUM_WIRES>.size();

    using SelectorType = Selector<FF>;
    using Row = GateRow<FF, NUM_WIRES>;
    using Tile = GateTile<FF, NUM_WIRES>;
    using WireType = WireColumn<FF, NUM_WIRES>;
    using Wires = std::array<WireType, NUM_WIRES>;

    ExecutionTraceBlock() = default;

    /**
     * @brief Construct a block that owns the listed gate kinds.
     */
    ExecutionTraceBlock(std::initializer_list<GateKind> kinds)
    {
        gate_columns_.reserve(kinds.size());
        for (GateKind k : kinds) {
            gate_columns_.emplace_back(&tiles, &num_rows_, k);
        }
    }

    // The column views alias this block's row storage; copies and moves rebind them to their own storage.
    ExecutionTraceBlock(const ExecutionTraceBlock& other)
        : cached_size_(other.cached_size_)
        , data_freed_(other.data_freed_)
        , trace_offset_(other.trace_offset_)
        , tiles(other.tiles)
        , num_rows_(other.num_rows_)
    {
        copy_stack_traces_from(other);
        copy_gate_columns_from(other);
    }
    ExecutionTraceBlock& operator=(const ExecutionTraceBlock& other)
    {
        if (this == &other) {
            return *this;
        }
        cached_size_ = other.cached_size_;
        data_freed_ = other.data_freed_;
        trace_offset_ = other.trace_offset_;
        tiles = other.tiles;
        num_rows_ = other.num_rows_;
        copy_stack_traces_from(other);
        copy_gate_columns_from(other);
        return *this;
    }
    ExecutionTraceBlock(ExecutionTraceBlock&& other) noexcept
        : cached_size_(other.cached_size_)
        , data_freed_(other.data_freed_)
        , trace_offset_(other.trace_offset_)
        , tiles(std::move(other.tiles))
        , num_rows_(other.num_rows_)
    {
        move_stack_traces_from(other);
        copy_gate_columns_from(other);
    }
    ExecutionTraceBlock& operator=(ExecutionTraceBlock&& other) noexcept
    {
        cached_size_ = other.cached_size_;
        data_freed_ = other.data_freed_;
        trace_offset_ = other.trace_offset_;
        tiles = std::move(other.tiles);
        num_rows_ = other.num_rows_;
        move_stack_traces_from(other);
        copy_gate_columns_from(other);
        return *this;
    }
    ~ExecutionTraceBlock() = default;

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

    bool operator==(const ExecutionTraceBlock& other) const
    {
        return cached_size_ == other.cached_size_ && data_freed_ == other.data_freed_ &&
               trace_offset_ == other.trace_offset_ && num_rows_ == other.num_rows_ && tiles == other.tiles &&
               owned_gate_kinds() == other.owned_gate_kinds();
    }

    size_t size() const { return data_freed_ ? cached_size_ : num_rows_; }

    /**
     * @brief Append one complete gate: wires, non-gate selectors, and the (single) active gate selector.
     */
    void append_gate(const Row& row)
    {
#ifdef CHECK_CIRCUIT_STACKTRACES
        this->stack_traces.populate();
#endif
        this->tracy_gate();
        BB_ASSERT_DEBUG(row.gate_kind == GateKind::None || owns_gate_kind(row.gate_kind),
                        "ExecutionTraceBlock: block does not own this gate kind.");
        Tile& tile = tile_for_append();
        const size_t slot = num_rows_ & GATE_TILE_MASK;
        for (size_t w = 0; w < NUM_WIRES; ++w) {
            tile.wires[w][slot] = row.wires[w];
        }
        for (const auto& sel : NON_GATE_SELECTORS<FF, NUM_WIRES>) {
            (tile.*sel.tile_field)[slot] = row.*sel.row_field;
        }
        tile.gate_kind[slot] = row.gate_kind;
        tile.gate_value[slot] = row.gate_value;
        ++num_rows_;
    }

    /**
     * @brief Reserve capacity for `num_rows` gates.
     */
    void reserve(size_t num_rows) { tiles.reserve((num_rows + GATE_TILE_SIZE - 1) >> GATE_TILE_SHIFT); }

    bool owns_gate_kind(GateKind kind) const
    {
        for (const auto& col : gate_columns_) {
            if (col.kind() == kind) {
                return true;
            }
        }
        return false;
    }

    std::vector<GateKind> owned_gate_kinds() const
    {
        std::vector<GateKind> kinds;
        kinds.reserve(gate_columns_.size());
        for (const auto& col : gate_columns_) {
            kinds.push_back(col.kind());
        }
        return kinds;
    }

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
    ~ExecutionTraceBlock()
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
        tiles.shrink_to_fit();
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

    std::vector<Tile> tiles;
    size_t num_rows_ = 0;

    // Wire column views; rebound on copy/move alongside the selector views.
    Wires wires{ WireType{ &tiles, &num_rows_, 0 },
                 WireType{ &tiles, &num_rows_, 1 },
                 WireType{ &tiles, &num_rows_, 2 },
                 WireType{ &tiles, &num_rows_, 3 } };

  private:
    // The stack traces are indexed by row, so they have to travel with the rows they describe.
    void copy_stack_traces_from([[maybe_unused]] const ExecutionTraceBlock& other)
    {
#ifdef CHECK_CIRCUIT_STACKTRACES
        stack_traces = other.stack_traces;
#endif
    }
    void move_stack_traces_from([[maybe_unused]] ExecutionTraceBlock& other)
    {
#ifdef CHECK_CIRCUIT_STACKTRACES
        stack_traces = std::move(other.stack_traces);
#endif
    }

    void copy_gate_columns_from(const ExecutionTraceBlock& other)
    {
        for (size_t i = 0; i < NUM_WIRES; ++i) {
            wires[i] = WireType{ &tiles, &num_rows_, i };
        }
        gate_columns_.clear();
        gate_columns_.reserve(other.gate_columns_.size());
        for (const auto& col : other.gate_columns_) {
            gate_columns_.emplace_back(&tiles, &num_rows_, col.kind());
        }
    }

    Tile& tile_for_append()
    {
        if ((num_rows_ & GATE_TILE_MASK) == 0 && (num_rows_ >> GATE_TILE_SHIFT) == tiles.size()) {
            return tiles.emplace_back();
        }
        return tiles[num_rows_ >> GATE_TILE_SHIFT];
    }

    template <size_t... Is>
    std::array<SelectorColumn<FF, NUM_WIRES>, NUM_NON_GATE_SELECTORS> make_selector_columns(std::index_sequence<Is...>)
    {
        return { SelectorColumn<FF, NUM_WIRES>{
            &tiles, &num_rows_, NON_GATE_SELECTORS<FF, NUM_WIRES>[Is].tile_field }... };
    }

    // Column views into the tiles, one per NON_GATE_SELECTORS entry in table order; rebound on
    // copy/move (see the copy/move constructors).
    std::array<SelectorColumn<FF, NUM_WIRES>, NUM_NON_GATE_SELECTORS> columns_ =
        make_selector_columns(std::make_index_sequence<NUM_NON_GATE_SELECTORS>{});

    std::vector<GateSelectorColumn<FF, NUM_WIRES>> gate_columns_;
};

/**
 * @brief Gate-selector value at `(block, idx)` for `kind`, returning zero if the block does not own
 * this kind or the row's active kind differs. Use at cross-block read sites where the caller
 * iterates blocks of unknown kind.
 */
template <typename FF, size_t NUM_WIRES>
FF read_gate_selector(const ExecutionTraceBlock<FF, NUM_WIRES>& block, GateKind kind, size_t idx)
{
    if (idx >= block.size()) {
        return FF{ 0 };
    }
    const auto& tile = block.tiles[idx >> GATE_TILE_SHIFT];
    const size_t slot = idx & GATE_TILE_MASK;
    return tile.gate_selector_or_zero(slot, kind);
}

} // namespace bb
