#include "prove_tube.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/init_srs.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"

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
    using GrumpkinVk = bb::VerifierCommitmentKey<curve::Grumpkin>;
    using AggregationObject = stdlib::recursion::aggregation_state<Builder>;

    std::string proof_path = output_path + "/proof";

    // Note: this could be decreased once we optimise the size of the ClientIVC recursive verifier
    init_bn254_crs(1 << 25);
    init_grumpkin_crs(1 << 18);

    // Read the proof  and verification data from given files
    auto proof = ClientIVC::Proof::from_file_msgpack(proof_path);
    auto vk = from_buffer<ClientIVC::VerificationKey>(read_file(vk_path));

    // We don't serialise and deserialise the Grumkin SRS so initialise with circuit_size + 1 to be able to recursively
    // verify IPA. The + 1 is to satisfy IPA verification key requirements.
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1025)
    vk.eccvm->pcs_verification_key = std::make_shared<GrumpkinVk>(vk.eccvm->circuit_size + 1);

    auto builder = std::make_shared<Builder>();

    // Preserve the public inputs that should be passed to the base rollup by making them public inputs to the tube
    // circuit
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1048): INSECURE - make this tube proof actually use
    // these public inputs by turning proof into witnesses and calling set_public on each witness
    auto num_inner_public_inputs = static_cast<uint32_t>(static_cast<uint256_t>(vk.mega->num_public_inputs));
    num_inner_public_inputs -= bb::PAIRING_POINT_ACCUMULATOR_SIZE; // don't add the agg object

    for (size_t i = 0; i < num_inner_public_inputs; i++) {
        builder->add_public_variable(proof.mega_proof[i]);
    }
    ClientIVCRecursiveVerifier verifier{ builder, vk };

    ClientIVCRecursiveVerifier::Output client_ivc_rec_verifier_output = verifier.verify(proof);

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1069): Add aggregation to goblin recursive verifiers.
    // This is currently just setting the aggregation object to the default one.
    AggregationObject::add_default_pairing_points_to_public_inputs(*builder);

    // The tube only calls an IPA recursive verifier once, so we can just add this IPA claim and proof
    builder->add_ipa_claim(client_ivc_rec_verifier_output.opening_claim.get_witness_indices());
    builder->ipa_proof = convert_stdlib_proof_to_native(client_ivc_rec_verifier_output.ipa_transcript->proof_data);
    ASSERT(builder->ipa_proof.size() && "IPA proof should not be empty");

    using Prover = UltraProver_<UltraRollupFlavor>;
    using Verifier = UltraVerifier_<UltraRollupFlavor>;
    Prover tube_prover{ *builder };
    auto tube_proof = tube_prover.construct_proof();
    std::string tubePublicInputsPath = output_path + "/public_inputs";
    std::string tubeProofPath = output_path + "/proof";
    PublicInputsAndProof public_inputs_and_proof{
        PublicInputsVector(tube_proof.begin(),
                           tube_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs)),
        HonkProof(tube_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs), tube_proof.end())
    };
    write_file(tubePublicInputsPath, to_buffer(public_inputs_and_proof.public_inputs));
    write_file(tubeProofPath, to_buffer(public_inputs_and_proof.proof));

    std::string tubePublicInputsAsFieldsPath = output_path + "/public_inputs_fields.json";
    std::string tubeProofAsFieldsPath = output_path + "/proof_fields.json";
    const auto to_json = [](const std::vector<bb::fr>& data) {
        if (data.empty()) {
            return std::string("[]");
        }
        return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
    };
    auto public_inputs_data = to_json(public_inputs_and_proof.public_inputs);
    auto proof_data = to_json(public_inputs_and_proof.proof);
    write_file(tubePublicInputsAsFieldsPath, { public_inputs_data.begin(), public_inputs_data.end() });
    write_file(tubeProofAsFieldsPath, { proof_data.begin(), proof_data.end() });

    std::string tubeVkPath = output_path + "/vk";
    auto tube_verification_key =
        std::make_shared<typename UltraRollupFlavor::VerificationKey>(tube_prover.proving_key->proving_key);
    write_file(tubeVkPath, to_buffer(tube_verification_key));

    std::string tubeAsFieldsVkPath = output_path + "/vk_fields.json";
    auto field_els = tube_verification_key->to_field_elements();
    info("verificaton key length in fields:", field_els.size());
    auto data = to_json(field_els);
    write_file(tubeAsFieldsVkPath, { data.begin(), data.end() });

    info("Native verification of the tube_proof");
    auto ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
    Verifier tube_verifier(tube_verification_key, ipa_verification_key);

    // Break up the tube proof into the honk portion and the ipa portion
    const size_t HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS =
        UltraRollupFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS + PAIRING_POINT_ACCUMULATOR_SIZE + IPA_CLAIM_SIZE;
    // The extra calculation is for the IPA proof length.
    ASSERT(tube_proof.size() == HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS + num_inner_public_inputs);
    // split out the ipa proof
    const std::ptrdiff_t honk_proof_with_pub_inputs_length = static_cast<std::ptrdiff_t>(
        HONK_PROOF_LENGTH_WITHOUT_INNER_PUB_INPUTS - IPA_PROOF_LENGTH + num_inner_public_inputs);
    auto ipa_proof = HonkProof(tube_proof.begin() + honk_proof_with_pub_inputs_length, tube_proof.end());
    auto tube_honk_proof = HonkProof(tube_proof.begin(), tube_proof.end() + honk_proof_with_pub_inputs_length);
    bool verified = tube_verifier.verify_proof(tube_honk_proof, ipa_proof);
    info("Tube proof verification: ", verified);
}

} // namespace bb
