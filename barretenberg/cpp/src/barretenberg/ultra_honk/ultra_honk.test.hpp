#pragma once

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include <gtest/gtest.h>

namespace bb {

using AggregationState = stdlib::recursion::PairingPoints<UltraCircuitBuilder>;

template <typename Flavor> class UltraHonkTests : public ::testing::Test {
  public:
    using ProverInstance = ProverInstance_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using Prover = UltraProver_<Flavor>;
    using Verifier = UltraVerifier_<Flavor>;

    std::vector<uint32_t> add_variables(auto& circuit_builder, std::vector<bb::fr> variables)
    {
        std::vector<uint32_t> res;
        for (auto& variable : variables) {
            res.emplace_back(circuit_builder.add_variable(variable));
        }
        return res;
    }

    void set_default_pairing_points_and_ipa_claim_and_proof(UltraCircuitBuilder& builder)
    {
        if constexpr (HasIPAAccumulator<Flavor>) {
            stdlib::recursion::honk::RollupIO::add_default(builder);
        } else {
            stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>::add_default(builder);
        }
    }

    void prove_and_verify(typename Flavor::CircuitBuilder& circuit_builder, bool expected_result)
    {
        auto prover_instance = std::make_shared<ProverInstance>(circuit_builder);
        prove_and_verify(prover_instance, expected_result);
    };

    void prove_and_verify(const std::shared_ptr<ProverInstance>& prover_instance, bool expected_result)
    {
        auto verification_key = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
        Prover prover(prover_instance, verification_key);
        auto proof = prover.construct_proof();
        if constexpr (HasIPAAccumulator<Flavor>) {
            VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
            Verifier verifier(verification_key, ipa_verification_key);
            bool result = verifier.template verify_proof<RollupIO>(proof, prover_instance->ipa_proof).result;
            EXPECT_EQ(result, expected_result);
        } else {
            Verifier verifier(verification_key);
            bool result = verifier.template verify_proof<DefaultIO>(proof).result;
            EXPECT_EQ(result, expected_result);
        }
    };

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

} // namespace bb
