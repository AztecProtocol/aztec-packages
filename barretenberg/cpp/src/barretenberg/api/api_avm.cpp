#ifndef DISABLE_AZTEC_VM
#include "barretenberg/api/api_avm.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/init_srs.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/vm/avm/generated/flavor.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/execution.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm/stats.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include <filesystem>

namespace bb {
void print_avm_stats()
{
#ifdef AVM_TRACK_STATS
    info("------- STATS -------");
    const auto& stats = avm_trace::Stats::get();
    const int levels = std::getenv("AVM_STATS_DEPTH") != nullptr ? std::stoi(std::getenv("AVM_STATS_DEPTH")) : 2;
    info(stats.to_string(levels));
#endif
}

/**
 * @brief Performs "check circuit" on the AVM circuit for the given public inputs and hints.
 *
 * @param public_inputs_path Path to the file containing the serialised avm public inputs
 * @param hints_path Path to the file containing the serialised avm circuit hints
 */
void avm_check_circuit(const std::filesystem::path& public_inputs_path, const std::filesystem::path& hints_path)
{

    const auto avm_public_inputs = AvmPublicInputs::from(read_file(public_inputs_path));
    const auto avm_hints = bb::avm_trace::ExecutionHints::from(read_file(hints_path));
    avm_hints.print_sizes();

    vinfo("initializing crs with size: ", avm_trace::Execution::SRS_SIZE);
    init_bn254_crs(avm_trace::Execution::SRS_SIZE);

    avm_trace::Execution::check_circuit(avm_public_inputs, avm_hints);

    print_avm_stats();
}

/**
 * @brief Writes an avm proof and corresponding (incomplete) verification key to files.
 *
 * Communication:
 * - Filesystem: The proof and vk are written to the paths output_path/proof and output_path/{vk, vk_fields.json}
 *
 * @param public_inputs_path Path to the file containing the serialised avm public inputs
 * @param hints_path Path to the file containing the serialised avm circuit hints
 * @param output_path Path (directory) to write the output proof and verification keys
 */
void avm_prove(const std::filesystem::path& public_inputs_path,
               const std::filesystem::path& hints_path,
               const std::filesystem::path& output_path)
{

    const auto avm_public_inputs = AvmPublicInputs::from(read_file(public_inputs_path));
    const auto avm_hints = bb::avm_trace::ExecutionHints::from(read_file(hints_path));
    avm_hints.print_sizes();

    vinfo("initializing crs with size: ", avm_trace::Execution::SRS_SIZE);
    init_bn254_crs(avm_trace::Execution::SRS_SIZE);

    // Prove execution and return vk
    auto const [verification_key, proof] =
        AVM_TRACK_TIME_V("prove/all", avm_trace::Execution::prove(avm_public_inputs, avm_hints));

    std::vector<fr> vk_as_fields = verification_key.to_field_elements();

    vinfo("vk fields size: ", vk_as_fields.size());
    vinfo("circuit size: ", static_cast<uint64_t>(vk_as_fields[0]));
    vinfo("num of pub inputs: ", static_cast<uint64_t>(vk_as_fields[1]));

    const auto to_json = [](const std::vector<bb::fr>& data) {
        return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
    };
    std::string vk_json = to_json(vk_as_fields);
    const auto proof_path = output_path / "proof";
    const auto vk_path = output_path / "vk";
    const auto vk_fields_path = output_path / "vk_fields.json";

    write_file(proof_path, to_buffer(proof));
    vinfo("proof written to: ", proof_path);
    write_file(vk_path, to_buffer(vk_as_fields));
    vinfo("vk written to: ", vk_path);
    write_file(vk_fields_path, { vk_json.begin(), vk_json.end() });
    vinfo("vk as fields written to: ", vk_fields_path);

    print_avm_stats();
}

void avm2_prove(const std::filesystem::path& inputs_path, const std::filesystem::path& output_path)
{
    avm2::AvmAPI avm;
    auto inputs = avm2::AvmAPI::ProvingInputs::from(read_file(inputs_path));

    // This is bigger than CIRCUIT_SUBGROUP_SIZE because of BB inefficiencies.
    init_bn254_crs(avm2::CIRCUIT_SUBGROUP_SIZE * 2);
    auto [proof, vk] = avm.prove(inputs);

    // NOTE: As opposed to Avm1 and other proof systems, the public inputs are NOT part of the proof.
    write_file(output_path / "proof", to_buffer(proof));
    write_file(output_path / "vk", vk);

    print_avm_stats();
}

void avm2_check_circuit(const std::filesystem::path& inputs_path)
{
    avm2::AvmAPI avm;
    auto inputs = avm2::AvmAPI::ProvingInputs::from(read_file(inputs_path));

    bool res = avm.check_circuit(inputs);
    info("circuit check: ", res ? "success" : "failure");

    print_avm_stats();
}

/**
 * @brief Verifies an avm proof and writes the result to stdout
 *
 * Communication:
 * - proc_exit: A boolean value is returned indicating whether the proof is valid.
 *   an exit code of 0 will be returned for success and 1 for failure.
 *
 * @param proof_path Path to the file containing the serialized proof
 * @param vk_path Path to the file containing the serialized verification key
 * @return true If the proof is valid
 * @return false If the proof is invalid
 */
bool avm_verify(const std::filesystem::path& proof_path, const std::filesystem::path& vk_path)
{
    using Commitment = bb::avm::AvmFlavorSettings::Commitment;
    std::vector<fr> const proof = many_from_buffer<fr>(read_file(proof_path));
    std::vector<uint8_t> vk_bytes = read_file(vk_path);
    std::vector<fr> vk_as_fields = many_from_buffer<fr>(vk_bytes);

    vinfo("initializing crs with size: ", 1);
    init_bn254_crs(1);

    auto circuit_size = uint64_t(vk_as_fields[0]);
    auto num_public_inputs = uint64_t(vk_as_fields[1]);
    std::span vk_span(vk_as_fields);

    vinfo("vk fields size: ", vk_as_fields.size());
    vinfo("circuit size: ", circuit_size, " (next or eq power: 2^", numeric::round_up_power_2(circuit_size), ")");
    vinfo("num of pub inputs: ", num_public_inputs);

    if (vk_as_fields.size() != AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS) {
        info("The supplied avm vk has incorrect size. Number of fields: ",
             vk_as_fields.size(),
             " but expected: ",
             AVM_VERIFICATION_KEY_LENGTH_IN_FIELDS);
        return false;
    }

    std::array<Commitment, bb::avm::AvmFlavor::NUM_PRECOMPUTED_ENTITIES> precomputed_cmts;
    for (size_t i = 0; i < bb::avm::AvmFlavor::NUM_PRECOMPUTED_ENTITIES; i++) {
        // Start at offset 2 and adds 4 (NUM_FRS_COM) fr elements per commitment. Therefore, index = 4 * i + 2.
        precomputed_cmts[i] = field_conversion::convert_from_bn254_frs<Commitment>(
            vk_span.subspan(bb::avm::AvmFlavor::NUM_FRS_COM * i + 2, bb::avm::AvmFlavor::NUM_FRS_COM));
    }

    auto vk = bb::avm::AvmFlavor::VerificationKey(circuit_size, num_public_inputs, precomputed_cmts);

    const bool verified = AVM_TRACK_TIME_V("verify/all", avm_trace::Execution::verify(vk, proof));
    vinfo("verified: ", verified);

    print_avm_stats();
    return verified;
}

// NOTE: The proof should NOT include the public inputs.
bool avm2_verify(const std::filesystem::path& proof_path,
                 const std::filesystem::path& public_inputs_path,
                 const std::filesystem::path& vk_path)
{
    const auto proof = many_from_buffer<fr>(read_file(proof_path));
    std::vector<uint8_t> vk_bytes = read_file(vk_path);
    auto public_inputs = avm2::PublicInputs::from(read_file(public_inputs_path));

    init_bn254_crs(1);
    avm2::AvmAPI avm;
    bool res = avm.verify(proof, public_inputs, vk_bytes);
    info("verification: ", res ? "success" : "failure");

    print_avm_stats();
    return res;
}
} // namespace bb
#endif
