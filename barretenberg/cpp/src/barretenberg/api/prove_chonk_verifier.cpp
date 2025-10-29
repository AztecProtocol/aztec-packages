#include "prove_chonk_verifier.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/chonk_verifier/chonk_recursive_verifier.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include <memory>

namespace bb {
/**
 * @brief Creates a Honk Proof for the ChonkVerifier circuit responsible for recursively verifying a Chonk proof.
 *
 * @param output_path the working directory from which the proof and verification data are read
 * @param num_unused_public_inputs
 */
void prove_chonk_verifier(const std::string& output_path, const std::string& vk_path)
{
    using namespace stdlib::recursion::honk;

    using Builder = UltraCircuitBuilder;
    using StdlibProof = ChonkRecursiveVerifier::StdlibProof;
    using HidingKernelIO = stdlib::recursion::honk::HidingKernelIO<Builder>;
    using RollupIO = stdlib::recursion::honk::RollupIO;

    std::string proof_path = output_path + "/proof";

    // Read the proof  and verification data from given files
    auto proof = Chonk::Proof::from_file_msgpack(proof_path);
    auto vk = from_buffer<Chonk::VerificationKey>(read_file(vk_path));

    Builder builder;
    ChonkRecursiveVerifier verifier{ &builder, vk.mega };

    StdlibProof stdlib_proof(builder, proof);
    ChonkRecursiveVerifier::Output chonk_rec_verifier_output = verifier.verify(stdlib_proof);

    // The public inputs in the proof are propagated to the base rollup by making them public inputs of this circuit.
    // Exclude the public inputs of the Hiding Kernel: the pairing points are handled separately, the ecc op tables are
    // not needed after this point
    auto num_inner_public_inputs = vk.mega->num_public_inputs - HidingKernelIO::PUBLIC_INPUTS_SIZE;
    for (size_t i = 0; i < num_inner_public_inputs; i++) {
        stdlib_proof.mega_proof[i].set_public();
    }

    // IO
    RollupIO inputs;
    inputs.pairing_inputs = chonk_rec_verifier_output.points_accumulator;
    inputs.ipa_claim = chonk_rec_verifier_output.opening_claim;
    inputs.set_public();

    // The tube only calls an IPA recursive verifier once, so we can just add this IPA proof
    builder.ipa_proof = chonk_rec_verifier_output.ipa_proof.get_value();
    BB_ASSERT_EQ(builder.ipa_proof.size(), IPA_PROOF_LENGTH, "IPA proof should be set.");

    using Prover = UltraProver_<UltraRollupFlavor>;
    using Verifier = UltraVerifier_<UltraRollupFlavor>;
    auto proving_key = std::make_shared<DeciderProvingKey_<UltraRollupFlavor>>(builder);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1201): Precompute tube vk and pass it in.
    info("WARNING: computing tube vk in prove_chonk_verifier, but a precomputed vk should be passed in.");
    auto chonk_verifier_verification_key =
        std::make_shared<UltraRollupFlavor::VerificationKey>(proving_key->get_precomputed());

    Prover chonk_verifier_prover{ proving_key, chonk_verifier_verification_key };
    auto chonk_verifier_proof = chonk_verifier_prover.construct_proof();
    std::string chonkVerifierPublicInputsPath = output_path + "/public_inputs";
    std::string chonkVerifierProofPath = output_path + "/proof";
    PublicInputsAndProof<HonkProof> public_inputs_and_proof{
        PublicInputsVector(chonk_verifier_proof.begin(),
                           chonk_verifier_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs)),
        HonkProof(chonk_verifier_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs),
                  chonk_verifier_proof.end())
    };
    write_file(chonkVerifierPublicInputsPath, to_buffer(public_inputs_and_proof.public_inputs));
    write_file(chonkVerifierProofPath, to_buffer(public_inputs_and_proof.proof));

    std::string chonkVerifierVkPath = output_path + "/vk";
    write_file(chonkVerifierVkPath, to_buffer(chonk_verifier_verification_key));

    info("Native verification of the chonk_verifier_proof");
    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
    Verifier chonk_verifier_verifier(chonk_verifier_verification_key, ipa_verification_key);

    // Break up the tube proof into the honk portion and the ipa portion
    const size_t HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS =
        UltraRollupFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() + RollupIO::PUBLIC_INPUTS_SIZE;
    // The extra calculation is for the IPA proof length.
    BB_ASSERT_EQ(chonk_verifier_proof.size(),
                 HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS + num_inner_public_inputs,
                 "In prove_chonk_verifier, tube proof length is incorrect.");
    // split out the ipa proof
    const std::ptrdiff_t honk_proof_with_pub_inputs_length = static_cast<std::ptrdiff_t>(
        HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS - IPA_PROOF_LENGTH + num_inner_public_inputs);
    auto ipa_proof =
        HonkProof(chonk_verifier_proof.begin() + honk_proof_with_pub_inputs_length, chonk_verifier_proof.end());
    auto tube_honk_proof =
        HonkProof(chonk_verifier_proof.begin(), chonk_verifier_proof.end() + honk_proof_with_pub_inputs_length);
    bool verified = chonk_verifier_verifier.template verify_proof<bb::RollupIO>(tube_honk_proof, ipa_proof).result;
    info("ChonkVerifier proof verification: ", verified);
}

} // namespace bb
