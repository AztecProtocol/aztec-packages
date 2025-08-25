#include "prove_tube.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include <memory>

namespace bb {
/**
 * @brief Creates a Honk Proof for the Tube circuit responsible for recursively verifying a ClientIVC proof.
 *
 * @param output_path the working directory from which the proof and verification data are read
 * @param num_unused_public_inputs
 */
void prove_tube(const std::string& output_path, const std::string& vk_path)
{
    using namespace stdlib::recursion::honk;

    using Builder = UltraCircuitBuilder;
    using StdlibProof = ClientIVCRecursiveVerifier::StdlibProof;
    using HidingKernelIO = stdlib::recursion::honk::HidingKernelIO<Builder>;
    using RollupIO = stdlib::recursion::honk::RollupIO;

    std::string proof_path = output_path + "/proof";

    // Read the proof  and verification data from given files
    auto proof = ClientIVC::Proof::from_file_msgpack(proof_path);
    auto vk = from_buffer<ClientIVC::VerificationKey>(read_file(vk_path));

    Builder builder;
    ClientIVCRecursiveVerifier verifier{ &builder, vk.mega };

    StdlibProof stdlib_proof(builder, proof);
    ClientIVCRecursiveVerifier::Output client_ivc_rec_verifier_output = verifier.verify(stdlib_proof);

    // The public inputs in the proof are propagated to the base rollup by making them public inputs of this circuit.
    // Exclude the public inputs of the Hiding Kernel: the pairing points are handled separately, the ecc op tables are
    // not needed after this point
    auto num_inner_public_inputs = vk.mega->num_public_inputs - HidingKernelIO::PUBLIC_INPUTS_SIZE;
    for (size_t i = 0; i < num_inner_public_inputs; i++) {
        stdlib_proof.mega_proof[i].set_public();
    }

    // IO
    RollupIO inputs;
    inputs.pairing_inputs = client_ivc_rec_verifier_output.points_accumulator;
    inputs.ipa_claim = client_ivc_rec_verifier_output.opening_claim;
    inputs.set_public();

    // The tube only calls an IPA recursive verifier once, so we can just add this IPA proof
    builder.ipa_proof = client_ivc_rec_verifier_output.ipa_proof.get_value();
    BB_ASSERT_EQ(builder.ipa_proof.size(), IPA_PROOF_LENGTH, "IPA proof should be set.");

    using Prover = UltraProver_<UltraRollupFlavor>;
    using Verifier = UltraVerifier_<UltraRollupFlavor>;
    auto proving_key = std::make_shared<DeciderProvingKey_<UltraRollupFlavor>>(builder);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1201): Precompute tube vk and pass it in.
    info("WARNING: computing tube vk in prove_tube, but a precomputed vk should be passed in.");
    auto tube_verification_key = std::make_shared<UltraRollupFlavor::VerificationKey>(proving_key->get_precomputed());

    Prover tube_prover{ proving_key, tube_verification_key };
    auto tube_proof = tube_prover.construct_proof();
    std::string tubePublicInputsPath = output_path + "/public_inputs";
    std::string tubeProofPath = output_path + "/proof";
    PublicInputsAndProof<HonkProof> public_inputs_and_proof{
        PublicInputsVector(tube_proof.begin(),
                           tube_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs)),
        HonkProof(tube_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs), tube_proof.end())
    };
    write_file(tubePublicInputsPath, to_buffer(public_inputs_and_proof.public_inputs));
    write_file(tubeProofPath, to_buffer(public_inputs_and_proof.proof));

    std::string tubeVkPath = output_path + "/vk";
    write_file(tubeVkPath, to_buffer(tube_verification_key));

    info("Native verification of the tube_proof");
    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key(1 << CONST_ECCVM_LOG_N);
    Verifier tube_verifier(tube_verification_key, ipa_verification_key);

    // Break up the tube proof into the honk portion and the ipa portion
    const size_t HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS =
        UltraRollupFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() + RollupIO::PUBLIC_INPUTS_SIZE;
    // The extra calculation is for the IPA proof length.
    BB_ASSERT_EQ(tube_proof.size(),
                 HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS + num_inner_public_inputs,
                 "In prove_tube, tube proof length is incorrect.");
    // split out the ipa proof
    const std::ptrdiff_t honk_proof_with_pub_inputs_length = static_cast<std::ptrdiff_t>(
        HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS - IPA_PROOF_LENGTH + num_inner_public_inputs);
    auto ipa_proof = HonkProof(tube_proof.begin() + honk_proof_with_pub_inputs_length, tube_proof.end());
    auto tube_honk_proof = HonkProof(tube_proof.begin(), tube_proof.end() + honk_proof_with_pub_inputs_length);
    bool verified = tube_verifier.template verify_proof<bb::RollupIO>(tube_honk_proof, ipa_proof).result;
    info("Tube proof verification: ", verified);
}

} // namespace bb
