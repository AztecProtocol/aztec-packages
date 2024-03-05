#pragma once

#include "barretenberg/plonk/composer/ultra_composer.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/plonk/proof_system/prover/prover.hpp"
#include "barretenberg/stdlib/commitment/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/encryption/schnorr/schnorr.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"

namespace bb::join_split_example {

using CircuitBuilder = bb::UltraCircuitBuilder;

using witness_ct = stdlib::witness_t<CircuitBuilder>;
using public_witness_ct = stdlib::public_witness_t<CircuitBuilder>;
using bool_ct = stdlib::bool_t<CircuitBuilder>;
using byte_array_ct = stdlib::byte_array<CircuitBuilder>;
using field_ct = stdlib::field_t<CircuitBuilder>;
using suint_ct = stdlib::safe_uint_t<CircuitBuilder>;
using uint32_ct = stdlib::uint32<CircuitBuilder>;
using group_ct = stdlib::cycle_group<CircuitBuilder>;
using pedersen_commitment = stdlib::pedersen_commitment<CircuitBuilder>;
using pedersen_hash = stdlib::pedersen_hash<CircuitBuilder>;
using bn254 = stdlib::bn254<CircuitBuilder>;
using hash_path_ct = crypto::merkle_tree::hash_path<CircuitBuilder>;
using schnorr_signature_bits = stdlib::schnorr_signature_bits<CircuitBuilder>;

} // namespace bb::join_split_example
