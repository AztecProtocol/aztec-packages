// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/slab_allocator.hpp"
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

template <typename FF> class Selector {
  public:
    void emplace_back(const FF& value) { push_back(value); }
    virtual void emplace_back(int) = 0;
    virtual void push_back(const FF&) = 0;
    virtual void resize(size_t) = 0;
    virtual const FF& operator[](size_t) const = 0;
    virtual size_t size() const = 0;
    virtual const FF& back() const = 0;
    virtual bool empty() const = 0;
    virtual std::vector<uint8_t> to_buffer() const = 0;
    virtual void set(size_t, int) = 0;
    virtual void set_back(int) = 0;
    virtual void set(size_t, const FF&) = 0;
};

template <typename FF> class ZeroSelector : public Selector<FF> {
  public:
    using Selector<FF>::emplace_back;
    void emplace_back(int value) override
    {
        BB_ASSERT_EQ(value, 0, "emplace_back non-zero to ZeroSelector is not allowed");
        size_++;
    }
    void push_back(const FF& value) override
    {
        ASSERT(value.is_zero());
        size_++;
    }
    void set_back(int value) override
    {
        BB_ASSERT_EQ(value, 0, "emplace_back non-zero to ZeroSelector is not allowed");
    }
    void set(size_t idx, int value) override
    {
        BB_ASSERT_LT(idx, size_);
        BB_ASSERT_EQ(value, 0, "set non-zero to ZeroSelector is not allowed");
    }
    void set(size_t idx, const FF& value) override
    {
        BB_ASSERT_LT(idx, size_);
        ASSERT(value.is_zero());
        size_++;
    }
    void resize(size_t new_size) override { size_ = new_size; }

    bool operator==(const ZeroSelector& other) const { return size_ == other.size(); };
    const FF& operator[](size_t index) const override
    {
        BB_ASSERT_LT(index, size_);
        ASSERT(zero.is_zero());
        return zero;
    };
    const FF& back() const override
    {
        ASSERT(zero.is_zero());
        return zero;
    }

    size_t size() const override { return size_; }
    bool empty() const override { return size_ == 0; }

    std::vector<uint8_t> to_buffer() const override
    {
        ASSERT(zero.is_zero());
        using serialize::write;
        std::vector<uint8_t> buf;
        for (size_t i = 0; i < size_; i++) {
            write(buf, zero);
        }
        return buf;
    }

  private:
    static constexpr FF zero = 0;
    size_t size_ = 0;
};

template <typename FF> class SlabVectorSelector : public Selector<FF> {
  public:
    using Selector<FF>::emplace_back;
    void emplace_back(int i) override { data.emplace_back(i); }
    void push_back(const FF& value) override { data.push_back(value); }
    void set_back(int value) override { data.back() = value; }
    void set(size_t idx, int i) override { data[idx] = i; }
    void set(size_t idx, const FF& value) override { data[idx] = value; }
    void resize(size_t new_size) override { data.resize(new_size); }

    bool operator==(const SlabVectorSelector& other) const { return data == other.data; }
    const FF& operator[](size_t i) const override { return data[i]; };
    const FF& back() const override { return data.back(); }

    size_t size() const override { return data.size(); }
    bool empty() const override { return data.empty(); }

    std::vector<uint8_t> to_buffer() const override { return ::to_buffer(data); }

  private:
    SlabVector<FF> data;
};

/**
 * @brief Basic structure for storing gate data in a builder
 *
 * @tparam FF
 * @tparam NUM_WIRES
 * @tparam NUM_SELECTORS
 */
template <typename FF, size_t NUM_WIRES_> class ExecutionTraceBlock {
  public:
    static constexpr size_t NUM_WIRES = NUM_WIRES_;

    using SelectorType = Selector<FF>;
    using WireType = SlabVector<uint32_t>;
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
    uint32_t trace_offset_ = std::numeric_limits<uint32_t>::max(); // where this block starts in the trace

    uint32_t trace_offset() const
    {
        ASSERT(trace_offset_ != std::numeric_limits<uint32_t>::max());
        return trace_offset_;
    }

    bool operator==(const ExecutionTraceBlock& other) const = default;

    size_t size() const { return std::get<0>(this->wires).size(); }

    void reserve(size_t size_hint)
    {
        for (auto& w : wires) {
            w.reserve(size_hint);
        }
        for (auto& p : get_selectors()) {
            p.reserve(size_hint);
        }
#ifdef CHECK_CIRCUIT_STACKTRACES
        stack_traces.stack_traces.reserve(size_hint);
#endif
    }

    uint32_t get_fixed_size(bool is_structured = true) const
    {
        return is_structured ? fixed_size : static_cast<uint32_t>(size());
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
    uint32_t fixed_size = 0; // Fixed size for use in structured trace

    virtual RefVector<Selector<FF>> get_selectors() = 0;
    virtual RefVector<const Selector<FF>> get_selectors() const = 0;

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

    const Selector<FF>& q_m() const { return non_gate_selectors[0]; };
    const Selector<FF>& q_c() const { return non_gate_selectors[1]; };
    const Selector<FF>& q_1() const { return non_gate_selectors[2]; };
    const Selector<FF>& q_2() const { return non_gate_selectors[3]; };
    const Selector<FF>& q_3() const { return non_gate_selectors[4]; };
    const Selector<FF>& q_4() const { return non_gate_selectors[5]; };

  protected:
    std::array<SlabVectorSelector<FF>, 6> non_gate_selectors;
};

} // namespace bb
