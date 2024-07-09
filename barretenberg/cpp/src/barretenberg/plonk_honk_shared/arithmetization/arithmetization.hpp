#pragma once
#include "barretenberg/common/ref_array.hpp"
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

// This is a set of fixed block sizes that accomodates the circuits currently processed in the ClientIvc bench.
// Note 1: The individual block sizes do NOT need to be powers of 2, this is just for conciseness.
// Note 2: Current sizes result in a full trace size of 2^18. It's not possible to define a fixed structure
// that accomdates both the kernel and the function circuit while remaining under 2^17. This is because the
// circuits differ in structure but are also both designed to be "full" within the 2^17 size.
enum class TraceStructure { NONE, SMALL_TEST, CLIENT_IVC_BENCH, E2E_FULL_TEST };

/**
 * @brief Basic structure for storing gate data in a builder
 *
 * @tparam FF
 * @tparam NUM_WIRES
 * @tparam NUM_SELECTORS
 */
template <typename FF, size_t NUM_WIRES, size_t NUM_SELECTORS> class ExecutionTraceBlock {
  public:
    using SelectorType = std::vector<FF, bb::ContainerSlabAllocator<FF>>;
    using WireType = std::vector<uint32_t, bb::ContainerSlabAllocator<uint32_t>>;
    using Selectors = std::array<SelectorType, NUM_SELECTORS>;
    using Wires = std::array<WireType, NUM_WIRES>;

#ifdef CHECK_CIRCUIT_STACKTRACES
    // If enabled, we keep slow stack traces to be able to correlate gates with code locations where they were added
    StackTraces stack_traces;
#endif

    Wires wires; // vectors of indices into a witness variables array
    Selectors selectors;
    bool has_ram_rom = false;   // does the block contain RAM/ROM gates
    bool is_pub_inputs = false; // is this the public inputs block

    uint32_t fixed_size = 0; // Fixed size for use in structured trace

    bool operator==(const ExecutionTraceBlock& other) const = default;

    size_t size() const { return std::get<0>(this->wires).size(); }

    void reserve(size_t size_hint)
    {
        for (auto& w : wires) {
            w.reserve(size_hint);
        }
        for (auto& p : selectors) {
            p.reserve(size_hint);
        }
#ifdef CHECK_CIRCUIT_STACKTRACES
        stack_traces.stack_traces.reserve(size_hint);
#endif
    }

    uint32_t get_fixed_size() const { return fixed_size; }
    void set_fixed_size(uint32_t size_in) { fixed_size = size_in; }
};

class TranslatorArith {
  public:
    static constexpr size_t NUM_WIRES = 81;
    static constexpr size_t NUM_SELECTORS = 0;
};

} // namespace bb