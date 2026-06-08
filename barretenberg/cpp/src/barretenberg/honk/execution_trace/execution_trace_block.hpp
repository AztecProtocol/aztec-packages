// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <cstddef>

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
    void print(size_t gate_idx) const { backward::Printer{}.print(stack_traces.at(gate_idx)); }
    // Don't interfere with equality semantics of structs that include this in debug builds
    bool operator==(const StackTraces& other) const
    {
        static_cast<void>(other);
        return true;
    }
};
#endif

/**
 * @brief Abstract interface for a generic selector.
 * @details A selector holds field elements that represent gate enable signals in circuit constraints.
 *          This interface defines basic operations required for concrete selector implementations.
 *
 * @tparam FF The finite field element type.
 */
template <typename FF> class Selector {
  public:
    Selector() = default;
    virtual ~Selector() = default;

    // Delete copy/move to avoid object slicing and unintended behavior
    Selector(const Selector&) = default;
    Selector& operator=(const Selector&) = default;
    Selector(Selector&&) = delete;
    Selector& operator=(Selector&&) = delete;

    /**
     * @brief Append a field element to the selector.
     * @param value Field element to append.
     */
    void emplace_back(const FF& value) { push_back(value); }

    /**
     * @brief Append an integer value to the selector.
     * @param value Must be convertible to FF.
     */
    virtual void emplace_back(int value) = 0;

    /**
     * @brief Push a field element to the selector.
     * @param value Field element to add.
     */
    virtual void push_back(const FF& value) = 0;

    /**
     * @brief Resize the selector.
     * @param new_size The new size.
     */
    virtual void resize(size_t new_size) = 0;

    /**
     * @brief Get value at specified index.
     * @param index Index of the element.
     * @return Reference to the field element at index.
     */
    virtual const FF& operator[](size_t index) const = 0;

    /**
     * @brief Get the last value in the selector.
     * @return Reference to the last field element.
     */
    virtual const FF& back() const = 0;

    /**
     * @brief Get the number of elements.
     */
    virtual size_t size() const = 0;

    /**
     * @brief Check if the selector is empty.
     */
    virtual bool empty() const = 0;

    /**
     * @brief Set the value at index using integer.
     * @param idx Index.
     * @param value Integer value.
     */
    virtual void set(size_t idx, int value) = 0;

    /**
     * @brief Set the value at index using a field element.
     * @param idx Index.
     * @param value Field element.
     */
    virtual void set(size_t idx, const FF& value) = 0;

    /**
     * @brief Release all memory held by this selector.
     */
    virtual void free_memory() {}
};

/**
 * @brief Selector backed by a slab allocator vector.
 * @details Allows dynamic values with fast memory allocation from slabs.
 *
 * @tparam FF The finite field element type.
 */
template <typename FF> class SlabVectorSelector : public Selector<FF> {
  public:
    using Selector<FF>::emplace_back;

    void emplace_back(int i) override { data.emplace_back(i); }
    void push_back(const FF& value) override { data.push_back(value); }
    void set(size_t idx, int i) override { data[idx] = i; }
    void set(size_t idx, const FF& value) override { data[idx] = value; }
    void resize(size_t new_size) override { data.resize(new_size); }

    bool operator==(const SlabVectorSelector& other) const { return data == other.data; }

    const FF& operator[](size_t i) const override { return data[i]; }
    const FF& back() const override { return data.back(); }

    size_t size() const override { return data.size(); }
    bool empty() const override { return data.empty(); }

    void free_memory() override
    {
        data.clear();
        data.shrink_to_fit();
    }

  private:
    std::vector<FF> data;
};

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
 * @brief Basic structure for storing gate data in a builder. Holds wires, the 7 non-gate selectors
 * present on every block, and a variable-length list of `(GateKind, Selector)` pairs identifying
 * the gate selectors this block owns.
 */
template <typename FF, size_t NUM_WIRES_> class ExecutionTraceBlock {
  public:
    static constexpr size_t NUM_WIRES = NUM_WIRES_;

    using SelectorType = Selector<FF>;
    using WireType = std::vector<uint32_t>;
    using Wires = std::array<WireType, NUM_WIRES>;

    ExecutionTraceBlock() = default;

    /**
     * @brief Construct a block that owns the listed gate kinds.
     */
    ExecutionTraceBlock(std::initializer_list<GateKind> kinds)
    {
        gate_selectors.reserve(kinds.size());
        for (GateKind k : kinds) {
            gate_selectors.emplace_back(std::piecewise_construct, std::forward_as_tuple(k), std::forward_as_tuple());
        }
    }

    ExecutionTraceBlock(const ExecutionTraceBlock&) = default;
    ExecutionTraceBlock& operator=(const ExecutionTraceBlock&) = default;
    ExecutionTraceBlock(ExecutionTraceBlock&&) noexcept = default;
    ExecutionTraceBlock& operator=(ExecutionTraceBlock&&) noexcept = default;
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

    Wires wires;                                                   // vectors of indices into a witness variables array
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

    bool operator==(const ExecutionTraceBlock& other) const = default;

    size_t size() const { return data_freed_ ? cached_size_ : std::get<0>(this->wires).size(); }

    /**
     * @brief Reference to this block's selector for `kind`; aborts if the block does not own it.
     * For cross-block reads, use `read_gate_selector` instead.
     */
    SlabVectorSelector<FF>& gate_selector_for(GateKind kind)
    {
        for (auto& [k, s] : gate_selectors) {
            if (k == kind) {
                return s;
            }
        }
        throw_or_abort("ExecutionTraceBlock: block does not own this gate kind");
        return gate_selectors[0].second; // unreachable
    }

    /**
     * @brief Append a row writing `value` to every gate-selector this block owns. To activate one
     * specific kind on a multi-kind block, use the kind-explicit overload below.
     */
    void set_gate_selector(const FF& value)
    {
        for (auto& [k, s] : gate_selectors) {
            s.emplace_back(value);
        }
    }

    /**
     * @brief Append a row activating one gate kind. Writes `value` to the selector for `kind` and
     * 0 to all other owned-kind selectors, keeping all gate selectors the same length.
     */
    void set_gate_selector(GateKind kind, const FF& value)
    {
        bool kind_found = false;
        for (auto& [k, s] : gate_selectors) {
            bool is_kind = (k == kind);
            BB_ASSERT_DEBUG(!(kind_found && is_kind), "ExecutionTraceBlock: multiple matches in single block.");
            kind_found |= is_kind;

            s.emplace_back(is_kind ? value : FF{ 0 });
        }
        BB_ASSERT(kind_found, "ExecutionTraceBlock: block does not own this gate kind.");
    }

    /**
     * @brief All selectors of this block: 7 non-gate followed by the owned gate selectors.
     */
    RefVector<Selector<FF>> get_selectors()
    {
        std::vector<Selector<FF>*> ptrs;
        ptrs.reserve(non_gate_selectors.size() + gate_selectors.size());
        for (auto& s : non_gate_selectors) {
            ptrs.push_back(&s);
        }
        for (auto& [k, s] : gate_selectors) {
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
     * @brief Release wire and selector memory. Caches block size so size() still works.
     * @details Called after trace data has been copied to prover polynomials.
     */
    void free_data()
    {
        cached_size_ = std::get<0>(wires).size();
        data_freed_ = true;
        for (auto& wire : wires) {
            wire.clear();
            wire.shrink_to_fit();
        }
        for (auto& sel : non_gate_selectors) {
            sel.free_memory();
        }
        for (auto& [k, sel] : gate_selectors) {
            sel.free_memory();
        }
    }

    void populate_wires(const uint32_t& idx_1, const uint32_t& idx_2, const uint32_t& idx_3, const uint32_t& idx_4)
    {
#ifdef CHECK_CIRCUIT_STACKTRACES
        this->stack_traces.populate();
#endif
        this->tracy_gate();
        this->wires[0].emplace_back(idx_1);
        this->wires[1].emplace_back(idx_2);
        this->wires[2].emplace_back(idx_3);
        this->wires[3].emplace_back(idx_4);
    }

    auto& w_l() { return std::get<0>(this->wires); };
    auto& w_r() { return std::get<1>(this->wires); };
    auto& w_o() { return std::get<2>(this->wires); };
    auto& w_4() { return std::get<3>(this->wires); };

    Selector<FF>& q_m() { return non_gate_selectors[0]; };
    Selector<FF>& q_c() { return non_gate_selectors[1]; };
    Selector<FF>& q_1() { return non_gate_selectors[2]; };
    Selector<FF>& q_2() { return non_gate_selectors[3]; };
    Selector<FF>& q_3() { return non_gate_selectors[4]; };
    Selector<FF>& q_4() { return non_gate_selectors[5]; };
    Selector<FF>& q_5() { return non_gate_selectors[6]; };

    std::array<SlabVectorSelector<FF>, 7> non_gate_selectors;

    std::vector<std::pair<GateKind, SlabVectorSelector<FF>>> gate_selectors;
};

/**
 * @brief Gate-selector value at `(block, idx)` for `kind`, returning zero if `block` does not own
 * this kind. Use at cross-block read sites where the caller iterates blocks of unknown kind.
 */
template <typename FF, size_t NUM_WIRES>
FF read_gate_selector(const ExecutionTraceBlock<FF, NUM_WIRES>& block, GateKind kind, size_t idx)
{
    for (const auto& [k, s] : block.gate_selectors) {
        if (k == kind) {
            return s[idx];
        }
    }
    return FF{ 0 };
}

} // namespace bb
