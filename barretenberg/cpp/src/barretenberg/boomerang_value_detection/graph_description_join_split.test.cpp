#include "./graph.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/streams.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/merkle_tree/index.hpp"
#include "barretenberg/examples/join_split/constants.hpp"
#include "barretenberg/examples/join_split/index.hpp"
#include "barretenberg/examples/join_split/inner_proof_data.hpp"
#include "barretenberg/examples/join_split/join_split_circuit.hpp"
#include "barretenberg/examples/join_split/join_split_tx.hpp"
#include "barretenberg/examples/join_split/notes/native/index.hpp"
#include "barretenberg/examples/join_split/types.hpp"
#include "barretenberg/plonk/proof_system/proving_key/serialize.hpp"

using namespace cdg;
using namespace bb;
using namespace bb::join_split_example::proofs::join_split;
using namespace bb::stdlib;
using namespace bb::crypto::merkle_tree;
using namespace bb::join_split_example::proofs::notes::native;
using namespace bb::join_split_example;
using namespace bb::join_split_example::proofs::notes;
using namespace bb::join_split_example::fixtures;

join_split_tx zero_input_setup(const user_context& user)
{
    auto store = std::make_unique<MemoryStore>();
    auto tree = std::make_unique<MerkleTree<MemoryStore, PedersenHashPolicy>>(*store, 32);
    [[maybe_unused]] bridge_call_data empty_bridge_call_data = { .bridge_address_id = 0,
                                                                 .input_asset_id_a = 0,
                                                                 .input_asset_id_b = 0,
                                                                 .output_asset_id_a = 0,
                                                                 .output_asset_id_b = 0,
                                                                 .config = { .second_input_in_use = false,
                                                                             .second_output_in_use = false },
                                                                 .aux_data = 0 };
    value::value_note default_value_note;
    value::value_note value_notes[14];
    [[maybe_unused]] const uint32_t asset_id = 1;
    [[maybe_unused]] const uint32_t defi_interaction_nonce = 7;
    [[maybe_unused]] const uint32_t virtual_asset_id_flag = (uint32_t(1) << (MAX_NUM_ASSETS_BIT_LENGTH - 1));
    [[maybe_unused]] constexpr uint256_t NOTE_VALUE_MAX = (uint256_t(1) << NOTE_VALUE_BIT_LENGTH) - 1;

    value::value_note input_note1 = { 0, 0, 0, user.owner.public_key, user.note_secret, 0, fr::random_element() };
    value::value_note input_note2 = { 0, 0, 0, user.owner.public_key, user.note_secret, 0, fr::random_element() };
    auto input_nullifier1 = compute_nullifier(input_note1.commit(), user.owner.private_key, false);
    auto input_nullifier2 = compute_nullifier(input_note2.commit(), user.owner.private_key, false);
    value::value_note output_note1 = { 0, 0, 0, user.owner.public_key, user.note_secret, 0, input_nullifier1 };
    value::value_note output_note2 = { 0, 0, 0, user.owner.public_key, user.note_secret, 0, input_nullifier2 };

    join_split_tx tx;
    tx.proof_id = proof_ids::SEND;
    tx.public_value = 0;
    tx.public_owner = 0;
    tx.asset_id = 0;
    tx.num_input_notes = 0;
    tx.input_index = { 0, 1 };
    tx.old_data_root = tree->root();
    tx.input_path = { tree->get_hash_path(0), tree->get_hash_path(1) };
    tx.input_note = { input_note1, input_note2 };
    tx.output_note = { output_note1, output_note2 };
    tx.partial_claim_note.input_nullifier = 0;
    tx.account_private_key = user.owner.private_key;
    tx.alias_hash = join_split_example::fixtures::generate_alias_hash("penguin");
    tx.account_required = false;
    tx.account_note_index = 0;
    tx.account_note_path = tree->get_hash_path(0);
    tx.signing_pub_key = user.signing_keys[0].public_key;
    tx.backward_link = 0;
    tx.allow_chain = 0;
    return tx;
}

TEST(boomerang_join_split, graph_description_firt_test)
{
    user_context user = join_split_example::fixtures::create_user_context();
    join_split_tx tx = zero_input_setup(user);
    tx.proof_id = proof_ids::DEPOSIT;
    tx.public_value = 10;
    tx.public_owner = fr::random_element();
    tx.output_note[0].value = 7;

    tx.signature = sign_join_split_tx(tx, user.owner);
    auto circuit = new_join_split_circuit(tx);
    auto graph = Graph(circuit);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(circuit);
    //graph.print_variable_in_one_gate(circuit, 5517);
    info("size of variables_in_one_gate == ", variables_in_one_gate.size());
    for (const auto& elem: variables_in_one_gate) {
        info("elem == ", elem);
    }
}