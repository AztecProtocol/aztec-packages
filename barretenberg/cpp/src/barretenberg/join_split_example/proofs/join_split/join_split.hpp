#pragma once
#include "barretenberg/join_split_example/types.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "join_split_tx.hpp"

namespace bb::join_split_example::proofs::join_split {

void init_verification_key();

Builder new_join_split_prover(join_split_tx const& tx);

bool verify_proof(Builder& builder);

std::shared_ptr<plonk::verification_key> get_verification_key();

} // namespace bb::join_split_example::proofs::join_split
