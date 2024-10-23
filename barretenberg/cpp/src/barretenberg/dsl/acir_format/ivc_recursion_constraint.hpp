#pragma once
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

ClientIVC::VerifierInputs create_dummy_vkey_and_proof_for_ivc(const PROOF_TYPE proof_type);

ClientIVC::VerifierInputs create_dummy_vkey_and_proof_oink(size_t num_public_inputs);

ClientIVC::MergeProof create_dummy_merge_proof();

} // namespace acir_format
