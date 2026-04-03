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

// Thread-local index for parallel circuit construction. Used by Selector, ExecutionTraceBlock,
// and CircuitBuilderBase to route operations through per-thread cursors.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
inline thread_local size_t parallel_thread_idx = 0;
inline void set_parallel_thread_index(size_t idx)
{
    parallel_thread_idx = idx;
}
inline size_t get_parallel_thread_index()
{
    return parallel_thread_idx;
}

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

    /**
     * @brief Enable cursor mode for a specific thread.
     * @details Used for parallel circuit construction where blocks are pre-allocated and threads write at
     * pre-determined offsets. The underlying storage must already be sized to accommodate the writes.
     * Thread index is set via set_active_thread_index() before processing opcodes.
     */
    void enable_cursor_mode(size_t thread_idx, size_t start)
    {
        if (thread_idx >= cursors_.size()) {
            cursors_.resize(thread_idx + 1, CURSOR_DISABLED);
        }
        cursors_[thread_idx] = start;
    }

    // Legacy single-thread interface (uses thread index 0)
    void enable_cursor_mode(size_t start) { enable_cursor_mode(0, start); }

    void disable_cursor_mode(size_t thread_idx)
    {
        if (thread_idx < cursors_.size()) {
            cursors_[thread_idx] = CURSOR_DISABLED;
        }
    }
    void disable_cursor_mode() { disable_cursor_mode(0); }

    bool is_cursor_mode() const { return active_cursor() != CURSOR_DISABLED; }

    size_t active_cursor() const
    {
        auto idx = get_parallel_thread_index();
        return (cursors_.empty() || idx >= cursors_.size()) ? CURSOR_DISABLED : cursors_[idx];
    }

    size_t& active_cursor_ref() { return cursors_[get_parallel_thread_index()]; }

    static constexpr size_t CURSOR_DISABLED = std::numeric_limits<size_t>::max();

  protected:
    std::vector<size_t> cursors_; // per-thread cursors
};

/**
 * @brief Selector specialization that only allows zeros.
 * @details Efficient representation for selectors that are guaranteed to be zero everywhere.
 *
 * @tparam FF The finite field element type.
 */
template <typename FF> class ZeroSelector : public Selector<FF> {
  public:
    using Selector<FF>::emplace_back;

    void emplace_back(int value) override
    {
        BB_ASSERT_EQ(value, 0, "Calling ZeroSelector::emplace_back with a non zero value.");
        if (this->is_cursor_mode()) {
            this->active_cursor_ref()++;
        } else {
            size_++;
        }
    }

    void push_back(const FF& value) override
    {
        BB_ASSERT(value.is_zero());
        if (this->is_cursor_mode()) {
            this->active_cursor_ref()++;
        } else {
            size_++;
        }
    }

    void set(size_t, int) override { BB_ASSERT(false, "ZeroSelector::set should not be called"); }
    void set(size_t, const FF&) override { BB_ASSERT(false, "ZeroSelector::set should not be called"); }

    void resize(size_t new_size) override { size_ = new_size; }

    bool operator==(const ZeroSelector& other) const { return size_ == other.size(); }

    const FF& operator[](size_t index) const override
    {
        BB_ASSERT_DEBUG(index < size_);
        return zero;
    }

    const FF& back() const override { return zero; }

    size_t size() const override { return size_; }

    bool empty() const override { return size_ == 0; }

    void free_memory() override { size_ = 0; }

  private:
    static constexpr FF zero = 0;
    size_t size_ = 0;
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

    void emplace_back(int i) override
    {
        if (this->is_cursor_mode()) {
            data[this->active_cursor_ref()++] = i;
        } else {
            data.emplace_back(i);
        }
    }
    void push_back(const FF& value) override
    {
        if (this->is_cursor_mode()) {
            data[this->active_cursor_ref()++] = value;
        } else {
            data.push_back(value);
        }
    }
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
 * @brief Basic structure for storing gate data in a builder
 *
 * @tparam FF
 * @tparam NUM_WIRES
 */
template <typename FF, size_t NUM_WIRES_> class ExecutionTraceBlock {
  public:
    static constexpr size_t NUM_WIRES = NUM_WIRES_;

    using SelectorType = Selector<FF>;
    using WireType = std::vector<uint32_t>;
    using Wires = std::array<WireType, NUM_WIRES>;

    ExecutionTraceBlock() = default;
    ExecutionTraceBlock(const ExecutionTraceBlock&) = default;
    ExecutionTraceBlock& operator=(const ExecutionTraceBlock&) = default;
    ExecutionTraceBlock(ExecutionTraceBlock&&) noexcept = default;
    ExecutionTraceBlock& operator=(ExecutionTraceBlock&&) noexcept = default;

    virtual ~ExecutionTraceBlock() = default;

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
    std::vector<size_t> wire_cursors_;                             // per-thread wire cursors
    std::vector<size_t> wire_cursor_starts_;                       // per-thread cursor start positions (task boundary)

    size_t wire_active_cursor() const
    {
        auto idx = get_parallel_thread_index();
        return (wire_cursors_.empty() || idx >= wire_cursors_.size()) ? Selector<FF>::CURSOR_DISABLED
                                                                      : wire_cursors_[idx];
    }

    uint32_t trace_offset() const
    {
        BB_ASSERT(trace_offset_ != std::numeric_limits<uint32_t>::max());
        return trace_offset_;
    }

    bool operator==(const ExecutionTraceBlock& other) const = default;

    size_t size() const { return data_freed_ ? cached_size_ : std::get<0>(this->wires).size(); }

    /**
     * @brief Get the index of the gate most recently written (via populate_wires).
     * @details In cursor mode, populate_wires writes at the cursor and then increments it,
     * so the last gate is at cursor - 1. In normal mode, it's size() - 1 as usual.
     * Must be called immediately after populate_wires (before any other writes to this block).
     */
    size_t last_gate_index() const
    {
        size_t wc = wire_active_cursor();
        if (wc != Selector<FF>::CURSOR_DISABLED) {
            return wc - 1;
        }
        return size() - 1;
    }

    /**
     * @brief Get the index where the next gate will be written.
     * @details In cursor mode, returns the current cursor position. In normal mode, returns size().
     */
    size_t next_gate_index() const
    {
        size_t wc = wire_active_cursor();
        if (wc != Selector<FF>::CURSOR_DISABLED) {
            return wc;
        }
        return size();
    }

    /**
     * @brief Enable cursor mode for a thread: subsequent gate writes go to position `start` and advance.
     * @details The block's wires and selectors must already be sized to accommodate the writes.
     * Used for parallel circuit construction where threads write to pre-allocated regions.
     */
    void enable_cursor_mode(size_t thread_idx, size_t start)
    {
        if (thread_idx >= wire_cursors_.size()) {
            wire_cursors_.resize(thread_idx + 1, Selector<FF>::CURSOR_DISABLED);
            wire_cursor_starts_.resize(thread_idx + 1, 0);
        }
        wire_cursors_[thread_idx] = start;
        wire_cursor_starts_[thread_idx] = start;
        for (auto& sel : get_selectors()) {
            sel.enable_cursor_mode(thread_idx, start);
        }
    }

    /**
     * @brief Get the start position of the current task's region in this block.
     * @details Returns the position where enable_cursor_mode was last called for this thread.
     * Used to prevent gate fusion across task boundaries.
     */
    size_t wire_cursor_start() const
    {
        auto idx = get_parallel_thread_index();
        return (wire_cursor_starts_.empty() || idx >= wire_cursor_starts_.size()) ? 0 : wire_cursor_starts_[idx];
    }

    // Legacy single-thread interface
    void enable_cursor_mode(size_t start) { enable_cursor_mode(0, start); }

    void disable_cursor_mode(size_t thread_idx)
    {
        if (thread_idx < wire_cursors_.size()) {
            wire_cursors_[thread_idx] = Selector<FF>::CURSOR_DISABLED;
        }
        for (auto& sel : get_selectors()) {
            sel.disable_cursor_mode(thread_idx);
        }
    }

    void disable_cursor_mode() { disable_cursor_mode(0); }

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

    virtual RefVector<Selector<FF>> get_selectors() = 0;

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
        for (auto& sel : get_selectors()) {
            sel.free_memory();
        }
    }

    void populate_wires(const uint32_t& idx_1, const uint32_t& idx_2, const uint32_t& idx_3, const uint32_t& idx_4)
    {
#ifdef CHECK_CIRCUIT_STACKTRACES
        this->stack_traces.populate();
#endif
        this->tracy_gate();
        size_t wc = wire_active_cursor();
        if (wc != Selector<FF>::CURSOR_DISABLED) {
            this->wires[0][wc] = idx_1;
            this->wires[1][wc] = idx_2;
            this->wires[2][wc] = idx_3;
            this->wires[3][wc] = idx_4;
            wire_cursors_[get_parallel_thread_index()]++;
        } else {
            this->wires[0].emplace_back(idx_1);
            this->wires[1].emplace_back(idx_2);
            this->wires[2].emplace_back(idx_3);
            this->wires[3].emplace_back(idx_4);
        }
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

  protected:
    std::array<SlabVectorSelector<FF>, 6> non_gate_selectors;
};

} // namespace bb
