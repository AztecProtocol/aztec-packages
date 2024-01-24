#include "compute_circuit_data.hpp"
#include "../notes/native/index.hpp"
#include "barretenberg/join_split_example/types.hpp"
#include "barretenberg/stdlib/merkle_tree/hash_path.hpp"
#include "join_split_circuit.hpp"
#include "sign_join_split_tx.hpp"

namespace bb::join_split_example::proofs::join_split {

using namespace bb::join_split_example::proofs::join_split;
using namespace bb::stdlib;
using namespace bb::join_split_example::proofs::notes::native;
using namespace bb::stdlib::merkle_tree;

join_split_tx noop_tx()
{
    grumpkin::fr priv_key = grumpkin::fr::random_element();
    grumpkin::g1::affine_element pub_key = grumpkin::g1::one * priv_key;

    value::value_note input_note1 = { 0, 0, 0, pub_key, fr::random_element(), 0, fr::random_element() };
    value::value_note input_note2 = { 0, 0, 0, pub_key, fr::random_element(), 0, fr::random_element() };
    auto input_nullifier1 = compute_nullifier(input_note1.commit(), priv_key, false);
    auto input_nullifier2 = compute_nullifier(input_note2.commit(), priv_key, false);
    value::value_note output_note1 = { 0, 0, 0, pub_key, fr::random_element(), 0, input_nullifier1 };
    value::value_note output_note2 = { 0, 0, 0, pub_key, fr::random_element(), 0, input_nullifier2 };

    auto gibberish_path = fr_hash_path(DATA_TREE_DEPTH, std::make_pair(fr::random_element(), fr::random_element()));

    join_split_tx tx;
    tx.proof_id = proof_ids::DEPOSIT;
    tx.public_value = 1;
    tx.public_owner = fr::one();
    tx.asset_id = 0;
    tx.num_input_notes = 0;
    tx.input_index = { 0, 1 };
    tx.old_data_root = fr::random_element();
    tx.input_path = { gibberish_path, gibberish_path };
    tx.input_note = { input_note1, input_note2 };
    tx.output_note = { output_note1, output_note2 };
    tx.partial_claim_note = {
        .deposit_value = 0,
        .bridge_call_data = 0,
        .note_secret = fr::random_element(),
        .input_nullifier = 0,
    };
    tx.account_note_index = 0;
    tx.account_note_path = gibberish_path;
    tx.signing_pub_key = pub_key;
    tx.account_private_key = priv_key;
    tx.alias_hash = 0;
    tx.account_required = false;
    tx.backward_link = fr::zero();
    tx.allow_chain = 0;

    tx.signature = sign_join_split_tx(tx, { priv_key, pub_key });

    return tx;
}

circuit_data get_circuit_data(std::shared_ptr<bb::srs::factories::CrsFactory<curve::BN254>> const& srs, bool mock)
{
    std::cerr << "Getting join-split circuit data..." << std::endl;

    auto build_circuit = [&](Builder& builder) {
        join_split_tx tx(noop_tx());
        join_split_circuit(builder, tx);
    };

    return proofs::get_circuit_data<Composer>(
        "join split", "", srs, "", true, false, false, true, true, true, mock, build_circuit);
}

} // namespace bb::join_split_example::proofs::join_split
