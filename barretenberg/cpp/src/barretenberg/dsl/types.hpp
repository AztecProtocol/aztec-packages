#pragma once
#include "barretenberg/plonk/composer/ultra_composer.hpp"

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/plonk/proof_system/prover/prover.hpp"
#include "barretenberg/stdlib/commitment/pedersen/pedersen.hpp"
#include "barretenberg/stdlib/encryption/schnorr/schnorr.hpp"
#include "barretenberg/stdlib/merkle_tree/hash_path.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/bit_array/bit_array.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256k1.hpp"
#include "barretenberg/stdlib/primitives/curves/secp256r1.hpp"
#include "barretenberg/stdlib/primitives/memory/ram_table.hpp"
#include "barretenberg/stdlib/primitives/memory/rom_table.hpp"
#include "barretenberg/stdlib/primitives/packed_byte_array/packed_byte_array.hpp"
#include "barretenberg/stdlib/primitives/uint/uint.hpp"
#include "barretenberg/stdlib/primitives/witness/witness.hpp"
#include "barretenberg/stdlib/recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/recursion/verification_key/verification_key.hpp"
#include "barretenberg/stdlib/recursion/verifier/program_settings.hpp"

namespace acir_format {

using Builder = proof_system::UltraCircuitBuilder;
using GoblinBuilder = barretenberg::Goblin::Builder;
using Composer = plonk::UltraComposer;

using Prover =
    std::conditional_t<std::same_as<Composer, plonk::UltraComposer>, plonk::UltraWithKeccakProver, plonk::Prover>;

using Verifier =
    std::conditional_t<std::same_as<Composer, plonk::UltraComposer>, plonk::UltraWithKeccakVerifier, plonk::Verifier>;

using RecursiveProver = plonk::UltraProver;

using witness_ct = proof_system::plonk::stdlib::witness_t<Builder>;
using public_witness_ct = proof_system::plonk::stdlib::public_witness_t<Builder>;
using bool_ct = proof_system::plonk::stdlib::bool_t<Builder>;
using byte_array_ct = proof_system::plonk::stdlib::byte_array<Builder>;
using packed_byte_array_ct = proof_system::plonk::stdlib::packed_byte_array<Builder>;
using field_ct = proof_system::plonk::stdlib::field_t<Builder>;
using suint_ct = proof_system::plonk::stdlib::safe_uint_t<Builder>;
using uint8_ct = proof_system::plonk::stdlib::uint8<Builder>;
using uint16_ct = proof_system::plonk::stdlib::uint16<Builder>;
using uint32_ct = proof_system::plonk::stdlib::uint32<Builder>;
using uint64_ct = proof_system::plonk::stdlib::uint64<Builder>;
using bit_array_ct = proof_system::plonk::stdlib::bit_array<Builder>;
using fq_ct = proof_system::plonk::stdlib::bigfield<Builder, barretenberg::Bn254FqParams>;
using biggroup_ct = proof_system::plonk::stdlib::element<Builder, fq_ct, field_ct, barretenberg::g1>;
using cycle_group_ct = proof_system::plonk::stdlib::cycle_group<Builder>;
using cycle_scalar_ct = proof_system::plonk::stdlib::cycle_group<Builder>::cycle_scalar;
using pedersen_commitment = proof_system::plonk::stdlib::pedersen_commitment<Builder>;
using bn254 = proof_system::plonk::stdlib::bn254<Builder>;
using secp256k1_ct = proof_system::plonk::stdlib::secp256k1<Builder>;
using secp256r1_ct = proof_system::plonk::stdlib::secp256r1<Builder>;

using hash_path_ct = proof_system::plonk::stdlib::merkle_tree::hash_path<Builder>;

using schnorr_signature_bits_ct = proof_system::plonk::stdlib::schnorr::signature_bits<Builder>;

// Ultra-composer specific typesv
using rom_table_ct = proof_system::plonk::stdlib::rom_table<Builder>;
using ram_table_ct = proof_system::plonk::stdlib::ram_table<Builder>;

using verification_key_ct = proof_system::plonk::stdlib::recursion::verification_key<bn254>;
using aggregation_state_ct = proof_system::plonk::stdlib::recursion::aggregation_state<bn254>;
using noir_recursive_settings = proof_system::plonk::stdlib::recursion::recursive_ultra_verifier_settings<bn254>;
using Transcript_ct = proof_system::plonk::stdlib::recursion::Transcript<Builder>;

} // namespace acir_format
