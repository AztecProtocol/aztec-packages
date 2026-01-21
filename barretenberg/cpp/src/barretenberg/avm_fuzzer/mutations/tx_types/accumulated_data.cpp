#include "barretenberg/avm_fuzzer/mutations/tx_types/accumulated_data.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"

using bb::avm2::AztecAddress;
using bb::avm2::FF;

namespace {

// Generate a random note hash
FF generate_note_hash(std::mt19937_64& rng)
{
    return generate_random_field(rng);
}

void mutate_note_hash(FF& note_hash, std::mt19937_64& rng)
{
    mutate_field(note_hash, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
}

// Generate a random nullifier. Can't be zero.
FF generate_nullifier(std::mt19937_64& rng)
{
    FF nullifier = 0;
    while (nullifier == 0) {
        nullifier = generate_random_field(rng);
    }
    return nullifier;
}

// Mutate a nullifier. Can't be zero.
void mutate_nullifier(FF& nullifier, std::mt19937_64& rng)
{
    mutate_field(nullifier, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
    while (nullifier == 0) {
        mutate_field(nullifier, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
    }
}

// Generate a random L2 to L1 message
ScopedL2ToL1Message generate_l2_to_l1_message(std::mt19937_64& rng)
{
    return ScopedL2ToL1Message{
        .message = L2ToL1Message{ .recipient = generate_random_field(rng), .content = generate_random_field(rng) },
        .contract_address = generate_random_field(rng),
    };
}

void mutate_l2_to_l1_msg(ScopedL2ToL1Message& msg, std::mt19937_64& rng)
{
    auto choice = std::uniform_int_distribution<uint8_t>(0, 2)(rng);

    switch (choice) {
    case 0:
        // Mutate recipient
        msg.message.recipient = generate_random_field(rng);
        break;
    case 1:
        // Mutate content
        msg.message.content = generate_random_field(rng);
        break;
    case 2:
        // Mutate contract_address
        msg.contract_address = generate_random_field(rng);
        break;
    default:
        break;
    }
}

AccumulatedData generate_accumulated_data(std::mt19937_64& rng)
{
    // When we generate new accumulated data we can simply generate a small number of entries
    // We test the limits during mutation
    std::vector<FF> note_hashes;
    size_t num_note_hashes = std::uniform_int_distribution<size_t>(0, 4)(rng);
    note_hashes.reserve(num_note_hashes);
    for (size_t i = 0; i < num_note_hashes; i++) {
        note_hashes.push_back(generate_note_hash(rng));
    }
    std::vector<FF> nullifiers;
    size_t num_nullifiers = std::uniform_int_distribution<size_t>(0, 4)(rng);
    nullifiers.reserve(num_nullifiers);
    for (size_t i = 0; i < num_nullifiers; i++) {
        nullifiers.push_back(generate_nullifier(rng));
    }
    std::vector<ScopedL2ToL1Message> l2_to_l1_messages;
    size_t num_messages = std::uniform_int_distribution<size_t>(0, 4)(rng);
    l2_to_l1_messages.reserve(num_messages);
    for (size_t i = 0; i < num_messages; i++) {
        l2_to_l1_messages.push_back(generate_l2_to_l1_message(rng));
    }

    return AccumulatedData{
        .note_hashes = note_hashes,
        .nullifiers = nullifiers,
        .l2_to_l1_messages = l2_to_l1_messages,
    };
}

void mutate_accumulated_data(AccumulatedData& input, std::mt19937_64& rng)
{
    using namespace bb::avm2::fuzzer;
    // We only really care about the existence of note hashes, nullifiers, and L2 to L1 messages
    // or if these values end up triggering limit errors during execution.
    auto choice = ACCUMULATED_DATA_MUTATION_CONFIGURATION.select(rng);
    switch (choice) {
    case AccumulatedDataMutationOptions::NoteHashes:
        mutate_vec_with_limit<FF>(input.note_hashes,
                                  rng,
                                  mutate_note_hash,
                                  generate_note_hash,
                                  BASIC_VEC_MUTATION_CONFIGURATION,
                                  MAX_NOTE_HASHES_PER_TX);
        break;
    case AccumulatedDataMutationOptions::NoteHashesLimit: {
        size_t original_size = input.note_hashes.size();
        input.note_hashes.resize(MAX_NOTE_HASHES_PER_TX);
        for (size_t i = original_size; i < MAX_NOTE_HASHES_PER_TX; i++) {
            input.note_hashes[i] = generate_note_hash(rng);
        }
        break;
    }
    case AccumulatedDataMutationOptions::Nullifiers:
        mutate_vec_with_limit<FF>(input.nullifiers,
                                  rng,
                                  mutate_nullifier,
                                  generate_nullifier,
                                  BASIC_VEC_MUTATION_CONFIGURATION,
                                  MAX_NULLIFIERS_PER_TX);
        break;
    case AccumulatedDataMutationOptions::NullifiersLimit: {
        size_t original_size = input.nullifiers.size();
        input.nullifiers.resize(MAX_NULLIFIERS_PER_TX);
        for (size_t i = original_size; i < MAX_NULLIFIERS_PER_TX; i++) {
            input.nullifiers[i] = generate_nullifier(rng);
        }
        break;
    }
    case AccumulatedDataMutationOptions::L2ToL1Messages:
        mutate_vec_with_limit<ScopedL2ToL1Message>(input.l2_to_l1_messages,
                                                   rng,
                                                   mutate_l2_to_l1_msg,
                                                   generate_l2_to_l1_message,
                                                   BASIC_VEC_MUTATION_CONFIGURATION,
                                                   MAX_L2_TO_L1_MSGS_PER_TX);
        break;
    case AccumulatedDataMutationOptions::L2ToL1MessagesLimit: {
        size_t original_size = input.l2_to_l1_messages.size();
        input.l2_to_l1_messages.resize(MAX_L2_TO_L1_MSGS_PER_TX);
        for (size_t i = original_size; i < MAX_L2_TO_L1_MSGS_PER_TX; i++) {
            input.l2_to_l1_messages[i] = generate_l2_to_l1_message(rng);
        }
        break;
    }
    }
}

} // namespace

namespace bb::avm2::fuzzer {

AccumulatedData generate_non_revertible_accumulated_data(std::mt19937_64& rng)
{
    AccumulatedData data = generate_accumulated_data(rng);
    if (data.nullifiers.empty()) {
        // Need to ensure the "tx nullifier" exists
        data.nullifiers.push_back(generate_nullifier(rng));
    }
    return data;
}
void mutate_non_revertible_accumulated_data(AccumulatedData& data, std::mt19937_64& rng)
{
    mutate_accumulated_data(data, rng);
    if (data.nullifiers.empty()) {
        // Need to ensure the "tx nullifier" exists
        data.nullifiers.push_back(generate_nullifier(rng));
    }
}

AccumulatedData generate_revertible_accumulated_data(std::mt19937_64& rng)
{
    return generate_accumulated_data(rng);
}

void mutate_revertible_accumulated_data(AccumulatedData& data, std::mt19937_64& rng)
{
    mutate_accumulated_data(data, rng);
};

} // namespace bb::avm2::fuzzer
