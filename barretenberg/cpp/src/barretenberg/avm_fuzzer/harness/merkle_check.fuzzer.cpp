#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"

#include <cassert>
#include <cstdint>
#include <fuzzer/FuzzedDataProvider.h>

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/harness/mutation_helper.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/merkle_check_event.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/merkle_check_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;
using namespace bb::avm2::fuzzing;

using bb::avm2::FF;

using merkle_check_rel = bb::avm2::merkle_check<FF>;

struct MerkleCheckFuzzerInput {
    bool is_write = false;
    FF current_value = 0;
    FF new_value = 0;
    uint64_t leaf_index = 0;
    std::array<FF, 64> sibling_path;
    FF root = 0;
    uint64_t tree_height = 10;

    uint64_t trimmed_leaf_index() const
    {
        // Truncate upper bits of leaf index by 2**tree_height
        return leaf_index & ((1ULL << tree_height) - 1);
    }

    std::span<const FF> trimmed_sibling_path() const
    {
        // Trim sibling path by tree height
        return std::span<const FF>(sibling_path).subspan(0, tree_height);
    }

    MSGPACK_FIELDS(is_write, current_value, new_value, leaf_index, sibling_path, root, tree_height);
};

namespace {

bool predict_if_will_throw(const MerkleCheckFuzzerInput& input)
{
    if (static_cast<uint128_t>(input.leaf_index) > (static_cast<uint128_t>(1) << input.tree_height)) {
        fuzz_info("Should throw: leaf index is too large, leaf index: ",
                  input.leaf_index,
                  ", tree height: ",
                  input.tree_height);
        return true;
    }

    if (input.tree_height > 64) {
        fuzz_info("Should throw: tree height is too large, tree height: ", input.tree_height);
        return true;
    }

    FF expected_root =
        unconstrained_root_from_path(input.current_value, input.trimmed_leaf_index(), input.trimmed_sibling_path());

    if (expected_root != input.root) {
        fuzz_info("Should throw: root does not match expected root");
        return true;
    }

    return false;
}

} // namespace

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t max_size, unsigned int seed)
{
    MerkleCheckFuzzerInput input;
    try {
        // Deserialize current input
        msgpack::unpack((reinterpret_cast<const char*>(data)), size).get().convert(input);
    } catch (const std::exception& e) {
        // Leave default
        input = {};
    }

    std::mt19937_64 rng(seed);

    // Choose mutation
    auto dist = std::uniform_int_distribution<int>(0, 6);

    int choice = dist(rng);

    auto random_field = [&rng]() -> FF {
        std::uniform_int_distribution<uint64_t> dist(0, std::numeric_limits<uint64_t>::max());
        return FF(dist(rng), dist(rng), dist(rng), dist(rng));
    };

    switch (choice) {
    case 0: {
        // Set correct root
        input.root =
            unconstrained_root_from_path(input.current_value, input.trimmed_leaf_index(), input.trimmed_sibling_path());

        break;
    }
    case 1: {
        // Flip is_write
        input.is_write = !input.is_write;
        break;
    }
    case 2: {
        // Random new current value
        input.current_value = random_field();
        break;
    }
    case 3: {
        // Swap current and new value
        std::swap(input.current_value, input.new_value);
        break;
    }
    case 4: {
        // Modify leaf index
        std::uniform_int_distribution<uint64_t> dist(0, std::numeric_limits<uint64_t>::max());
        input.leaf_index = dist(rng);
        break;
    }
    case 5: {
        // Modify tree height
        std::uniform_int_distribution<uint64_t> dist(1, 64);
        input.tree_height = dist(rng);
        break;
    }
    case 6: {
        // Update sibling path item at random index
        std::uniform_int_distribution<size_t> dist(0, input.sibling_path.size() - 1);
        size_t index = dist(rng);
        input.sibling_path[index] = random_field();
        break;
    }
    default:
        break;
    }

    auto [mutated_data, mutated_data_size] = msgpack_encode_buffer(input);
    if (mutated_data_size > max_size) {
        delete[] mutated_data;
        return 0;
    }

    memcpy(data, mutated_data, mutated_data_size);
    delete[] mutated_data;

    return mutated_data_size;
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    MerkleCheckFuzzerInput input;
    try {
        msgpack::unpack((reinterpret_cast<const char*>(data)), size).get().convert(input);
    } catch (const std::exception& e) {
        // Invalid input, return early
        return 0;
    }

    // Setup gadgets
    ExecutionIdManager execution_id_manager(1);
    // Pure since it's unused
    PureGreaterThan gt;

    EventEmitter<Poseidon2HashEvent> poseidon2_hash_emitter;
    EventEmitter<Poseidon2PermutationEvent> poseidon2_perm_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> poseidon2_perm_mem_emitter;
    Poseidon2 poseidon2(
        execution_id_manager, gt, poseidon2_hash_emitter, poseidon2_perm_emitter, poseidon2_perm_mem_emitter);

    EventEmitter<MerkleCheckEvent> merkle_check_emitter;
    MerkleCheck merkle_check(poseidon2, merkle_check_emitter);

    bool will_throw = predict_if_will_throw(input);
    std::optional<FF> new_root = std::nullopt;

    try {
        if (input.is_write) {
            new_root = merkle_check.write(
                input.current_value, input.new_value, input.leaf_index, input.trimmed_sibling_path(), input.root);
        } else {
            merkle_check.assert_membership(
                input.current_value, input.leaf_index, input.trimmed_sibling_path(), input.root);
        }
    } catch (std::exception& e) {
        if (will_throw) {
            return 0;
        }
        throw e;
    }

    if (will_throw) {
        throw std::runtime_error("Expected exception was not thrown");
    }

    if (new_root.has_value()) {
        FF expected_new_root =
            unconstrained_root_from_path(input.new_value, input.trimmed_leaf_index(), input.trimmed_sibling_path());
        if (new_root.value() != expected_new_root) {
            throw std::runtime_error("New root does not match expected root");
        }
    }

    if (poseidon2_perm_mem_emitter.get_events().size() > 0) {
        throw std::runtime_error("Poseidon2 permutation memory events were emitted");
    }

    // Build the trace

    auto trace = TestTraceContainer({ { { avm2::Column::precomputed_first_row, 1 } } });

    Poseidon2TraceBuilder poseidon2_trace_builder;
    poseidon2_trace_builder.process_permutation(poseidon2_perm_emitter.dump_events(), trace);
    poseidon2_trace_builder.process_hash(poseidon2_hash_emitter.dump_events(), trace);

    MerkleCheckTraceBuilder merkle_check_trace_builder;
    merkle_check_trace_builder.process(merkle_check_emitter.dump_events(), trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<merkle_check_rel>(trace);
    check_all_interactions<MerkleCheckTraceBuilder>(trace);

    return 0;
}
