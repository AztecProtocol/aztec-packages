// Tests for what the custom mutator hands back to libFuzzer. The mutator is the only place that turns
// programs into bytecode, so the contract artifacts it emits are what the fuzzer actually executes.
#include <gtest/gtest.h>

#include <algorithm>
#include <cstdint>
#include <random>
#include <set>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzzer_lib.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

// libFuzzer's own mutator is not linked into the test binary. Bytecode mutation only uses it to
// scribble over bytes, so leaving them alone is enough for the mutator to run.
extern "C" size_t LLVMFuzzerMutate(uint8_t*, size_t size, size_t)
{
    return size;
}

namespace {

using bb::avm2::FF;
using bb::avm2::fuzzer::FuzzerContext;
using bb::avm2::simulation::compute_contract_address;

constexpr size_t MAX_SIZE = 1 << 22;

FuzzerTxData unpack_tx_data(const std::vector<uint8_t>& buffer, size_t size)
{
    FuzzerTxData tx_data;
    msgpack::unpack(reinterpret_cast<const char*>(buffer.data()), size).get().convert(tx_data);
    return tx_data;
}

// The class ids the input's programs build to. A set because programs that are identical derive to the
// same contract address, and only one of them is registered.
std::set<FF> class_ids_of_programs(FuzzerTxData& tx_data)
{
    std::set<FF> class_ids;
    for (auto& fuzzer_data : tx_data.input_programs) {
        const auto [bytecode, contract_class, contract_instance] = build_bytecode_and_artifacts(fuzzer_data);
        class_ids.insert(contract_class.id);
    }
    return class_ids;
}

std::set<FF> carried_class_ids(const FuzzerTxData& tx_data)
{
    std::set<FF> class_ids;
    for (const auto& contract_class : tx_data.contract_classes) {
        class_ids.insert(contract_class.id);
    }
    return class_ids;
}

bool is_subset(const std::set<FF>& subset, const std::set<FF>& superset)
{
    return std::ranges::all_of(subset, [&](const FF& class_id) { return superset.contains(class_id); });
}

// A program mutation has to reach the contract artifacts, because those are what gets executed. If it
// does not, the mutated program runs no earlier than the next time the input reaches the mutator, and
// the input that carries it executes bytecode identical to its parent's, so libFuzzer sees no new
// coverage and usually drops it before that happens.
//
// The previous build has to stay registered alongside it, because the CALL targets the mutated program
// carries were generated against those addresses, and it has to keep running as the new version, so the
// enqueued calls must point at the current programs rather than at the copy kept for the stale targets.
TEST(MutatorTest, ProgramMutationsReachTheExecutedArtifacts)
{
    std::vector<uint8_t> buffer(MAX_SIZE);
    FuzzerContext initial_context;
    // An empty input does not deserialize, which is what makes the mutator generate a program to start
    // from.
    size_t size = mutate_tx_data(initial_context, buffer.data(), 0, MAX_SIZE, /*seed=*/1);

    size_t rounds_with_a_program_mutation = 0;
    for (unsigned int seed = 2; seed <= 200; seed++) {
        FuzzerTxData before = unpack_tx_data(buffer, size);
        auto class_ids_before = class_ids_of_programs(before);

        FuzzerContext context;
        size = mutate_tx_data(context, buffer.data(), size, MAX_SIZE, seed);

        FuzzerTxData after = unpack_tx_data(buffer, size);
        auto class_ids_after = class_ids_of_programs(after);
        if (class_ids_after == class_ids_before) {
            // This round mutated something other than the programs.
            continue;
        }
        rounds_with_a_program_mutation++;

        auto carried = carried_class_ids(after);
        EXPECT_TRUE(is_subset(class_ids_after, carried)) << "seed " << seed;
        EXPECT_TRUE(is_subset(class_ids_before, carried)) << "seed " << seed;

        std::set<AztecAddress> program_addresses;
        for (const auto& contract_instance : after.contract_instances) {
            if (class_ids_after.contains(contract_instance.current_contract_class_id)) {
                program_addresses.insert(compute_contract_address(contract_instance));
            }
        }
        for (const auto& call : after.tx.setup_enqueued_calls) {
            EXPECT_TRUE(program_addresses.contains(call.request.contract_address)) << "seed " << seed;
        }
        for (const auto& call : after.tx.app_logic_enqueued_calls) {
            EXPECT_TRUE(program_addresses.contains(call.request.contract_address)) << "seed " << seed;
        }
    }

    EXPECT_GT(rounds_with_a_program_mutation, 0);
}

} // namespace
