#pragma once
#include "./mock/mock_circuit.hpp"
#include "barretenberg/ecc/curves/bn254/fq12.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"
#include "barretenberg/stdlib/recursion/verifier/verifier.hpp"
#include "barretenberg/stdlib/recursion/aggregation_state/aggregation_state.hpp"

namespace join_split_example {
namespace proofs {

template <typename Composer> struct verify_result {
    verify_result()
        : logic_verified(false)
        , verified(false)
    {}

    bool logic_verified;
    std::string err;
    std::vector<fr> public_inputs;
    plonk::stdlib::recursion::aggregation_state<plonk::stdlib::bn254<Composer>> aggregation_state;

    std::vector<uint8_t> proof_data;
    bool verified;
    std::shared_ptr<plonk::verification_key> verification_key;
    size_t number_of_gates;
};

template <typename Composer>
inline bool pairing_check(plonk::stdlib::recursion::aggregation_state<plonk::stdlib::bn254<Composer>> aggregation_state,
                          std::shared_ptr<barretenberg::srs::factories::VerifierCrs> const& srs)
{
    g1::affine_element P[2];
    P[0].x = barretenberg::fq(aggregation_state.P0.x.get_value().lo);
    P[0].y = barretenberg::fq(aggregation_state.P0.y.get_value().lo);
    P[1].x = barretenberg::fq(aggregation_state.P1.x.get_value().lo);
    P[1].y = barretenberg::fq(aggregation_state.P1.y.get_value().lo);
    barretenberg::fq12 inner_proof_result =
        barretenberg::pairing::reduced_ate_pairing_batch_precomputed(P, srs->get_precomputed_g2_lines(), 2);
    return inner_proof_result == barretenberg::fq12::one();
}

template <typename Composer, typename Tx, typename CircuitData, typename F>
auto verify_logic_internal(Composer& composer, Tx& tx, CircuitData const& cd, char const* name, F const& build_circuit)
{
    info(name, ": Building circuit...");
    Timer timer;
    auto result = build_circuit(composer, tx, cd);
    info(name, ": Circuit built in ", timer.toString(), "s");

    if (composer.failed()) {
        info(name, ": Circuit logic failed: " + composer.err());
        result.err = composer.err();
        return result;
    }

    if (!cd.srs) {
        info(name, ": Srs not provided.");
        return result;
    }

    if (!pairing_check(result.aggregation_state, cd.srs->get_verifier_crs())) {
        info(name, ": Native pairing check failed.");
        return result;
    }

    result.public_inputs = composer.get_public_inputs();
    result.logic_verified = true;
    result.number_of_gates = composer.get_num_gates();

    return result;
}

template <typename Composer, typename Tx, typename CircuitData, typename F>
auto verify_internal(Composer& composer, Tx& tx, CircuitData const& cd, char const* name, F const& build_circuit)
{
    Timer timer;
    auto result = verify_logic_internal(composer, tx, cd, name, build_circuit);

    if (!result.logic_verified) {
        return result;
    }

    Timer proof_timer;
    info(name, ": Creating proof...");

    if (!cd.mock) {
        if constexpr (std::is_same<Composer, plonk::UltraPlonkComposer>::value) {
            if (std::string(name) == "root rollup") {
                auto prover = composer.create_ultra_to_standard_prover();
                auto proof = prover.construct_proof();
                result.proof_data = proof.proof_data;
            } else {
                auto prover = composer.create_prover();
                auto proof = prover.construct_proof();
                result.proof_data = proof.proof_data;
            }
        } else {
            auto prover = composer.create_prover();
            auto proof = prover.construct_proof();
            result.proof_data = proof.proof_data;
        }
    } else {
        Composer mock_proof_composer = Composer(cd.proving_key, cd.verification_key, cd.num_gates);
        ::join_split_example::proofs::mock::mock_circuit(mock_proof_composer, composer.get_public_inputs());
        if constexpr (std::is_same<Composer, plonk::UltraPlonkComposer>::value) {
            if (std::string(name) == "root rollup") {
                auto prover = mock_proof_composer.create_ultra_to_standard_prover();
                auto proof = prover.construct_proof();
                result.proof_data = proof.proof_data;
            } else {
                auto prover = mock_proof_composer.create_prover();
                auto proof = prover.construct_proof();
                result.proof_data = proof.proof_data;
            }
        } else {
            auto prover = mock_proof_composer.create_prover();
            auto proof = prover.construct_proof();
            result.proof_data = proof.proof_data;
        }
    }

    info(name, ": Proof created in ", proof_timer.toString(), "s");
    info(name, ": Total time taken: ", timer.toString(), "s");
    if constexpr (std::is_same<Composer, plonk::UltraPlonkComposer>::value) {
        if (std::string(name) == "root rollup") {
            auto verifier = composer.create_ultra_to_standard_verifier();
            result.verified = verifier.verify_proof({ result.proof_data });
        } else {
            auto verifier = composer.create_verifier();
            result.verified = verifier.verify_proof({ result.proof_data });
        }
    } else {
        auto verifier = composer.create_verifier();
        result.verified = verifier.verify_proof({ result.proof_data });
    }

    if (!result.verified) {
        info(name, ": Proof validation failed.");
        return result;
    } else {
        info(name, ": Verified successfully.");
    }
    result.verification_key = composer.circuit_verification_key;
    return result;
}

} // namespace proofs
} // namespace join_split_example
