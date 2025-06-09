#ifndef DISABLE_AZTEC_VM
#include "barretenberg/api/api_avm.hpp"

#include <filesystem>

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb {
namespace {

void print_avm_stats()
{
#ifdef AVM_TRACK_STATS
    info("------- STATS -------");
    const auto& stats = ::bb::avm2::Stats::get();
    const int levels = std::getenv("AVM_STATS_DEPTH") != nullptr ? std::stoi(std::getenv("AVM_STATS_DEPTH")) : 2;
    info(stats.to_string(levels));
#endif
}

} // namespace

void avm_prove(const std::filesystem::path& inputs_path, const std::filesystem::path& output_path)
{
    avm2::AvmAPI avm;
    auto inputs = avm2::AvmAPI::ProvingInputs::from(read_file(inputs_path));
    auto [proof, vk] = avm.prove(inputs);

    // NOTE: As opposed to Avm1 and other proof systems, the public inputs are NOT part of the proof.
    write_file(output_path / "proof", to_buffer(proof));
    write_file(output_path / "vk", vk);

    print_avm_stats();

    // NOTE: Temporarily we also verify after proving.
    // The reasoning is that proving will always pass unless it crashes.
    // We want to return an exit code != 0 if the proof is invalid so that the prover client saves the inputs.
    info("verifying...");
    bool res = avm.verify(proof, inputs.publicInputs, vk);
    info("verification: ", res ? "success" : "failure");
    if (!res) {
        throw std::runtime_error("Generated proof is invalid!1!!1");
    }
}

void avm_check_circuit(const std::filesystem::path& inputs_path)
{
    avm2::AvmAPI avm;
    auto inputs = avm2::AvmAPI::ProvingInputs::from(read_file(inputs_path));

    bool res = avm.check_circuit(inputs);
    info("circuit check: ", res ? "success" : "failure");

    print_avm_stats();
}

// NOTE: The proof should NOT include the public inputs.
bool avm_verify(const std::filesystem::path& proof_path,
                const std::filesystem::path& public_inputs_path,
                const std::filesystem::path& vk_path)
{
    const auto proof = many_from_buffer<fr>(read_file(proof_path));
    std::vector<uint8_t> vk_bytes = read_file(vk_path);
    auto public_inputs = avm2::PublicInputs::from(read_file(public_inputs_path));

    avm2::AvmAPI avm;
    bool res = avm.verify(proof, public_inputs, vk_bytes);
    info("verification: ", res ? "success" : "failure");

    print_avm_stats();
    return res;
}

} // namespace bb
#endif
