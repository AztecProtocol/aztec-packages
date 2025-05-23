#pragma once
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/log.hpp"
#include "barretenberg/common/container.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include <filesystem>

namespace bb {

template <typename VK> struct PubInputsProofAndKey {
    PublicInputsVector public_inputs;
    HonkProof proof;
    std::shared_ptr<VK> key;
};

template <typename ProverOutput>
void write(const ProverOutput& prover_output,
           const std::string& output_format,
           const std::string& output_content,
           const std::filesystem::path& output_dir)
{
    enum class ObjectToWrite : size_t { PUBLIC_INPUTS, PROOF, VK };
    const bool output_to_stdout = output_dir == "-";

    const auto to_json = [](const std::vector<bb::fr>& data) {
        if (data.empty()) {
            return std::string("[]");
        }
        return format("[", join(transform::map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
    };

    const auto write_bytes = [&](const ObjectToWrite& obj) {
        switch (obj) {
        case ObjectToWrite::PUBLIC_INPUTS: {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1312): Try to avoid include_size=true, which is
            // used for deserialization.
            const auto buf = to_buffer(prover_output.public_inputs);
            if (output_to_stdout) {
                write_bytes_to_stdout(buf);
            } else {
                write_file(output_dir / "public_inputs", buf);
                info("Public inputs saved to ", output_dir / "public_inputs");
            }
            break;
        }
        case ObjectToWrite::PROOF: {
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1312): Try to avoid include_size=true, which is
            // used for deserialization.
            const auto buf = to_buffer(prover_output.proof);
            if (output_to_stdout) {
                write_bytes_to_stdout(buf);
            } else {
                write_file(output_dir / "proof", buf);
                info("Proof saved to ", output_dir / "proof");
            }
            break;
        }
        case ObjectToWrite::VK: {
            const auto buf = to_buffer(prover_output.key);
            if (output_to_stdout) {
                write_bytes_to_stdout(buf);
            } else {
                write_file(output_dir / "vk", buf);
                info("VK saved to ", output_dir / "vk");
            }
            break;
        }
        }
    };

    const auto write_fields = [&](const ObjectToWrite& obj) {
        switch (obj) {
        case ObjectToWrite::PUBLIC_INPUTS: {
            const std::string public_inputs_json = to_json(prover_output.public_inputs);
            if (output_to_stdout) {
                std::cout << public_inputs_json;
            } else {
                write_file(output_dir / "public_inputs_fields.json",
                           { public_inputs_json.begin(), public_inputs_json.end() });
                info("Public inputs fields saved to ", output_dir / "public_inputs_fields.json");
            }
            break;
        }
        case ObjectToWrite::PROOF: {
            const std::string proof_json = to_json(prover_output.proof);
            if (output_to_stdout) {
                std::cout << proof_json;
            } else {
                write_file(output_dir / "proof_fields.json", { proof_json.begin(), proof_json.end() });
                info("Proof fields saved to ", output_dir / "proof_fields.json");
            }
            break;
        }
        case ObjectToWrite::VK: {
            const std::string vk_json = to_json(prover_output.key->to_field_elements());
            if (output_to_stdout) {
                std::cout << vk_json;
            } else {
                write_file(output_dir / "vk_fields.json", { vk_json.begin(), vk_json.end() });
                info("VK fields saved to ", output_dir / "vk_fields.json");
            }
            break;
        }
        }
    };

    if (output_content == "proof") {
        if (output_format == "bytes") {
            write_bytes(ObjectToWrite::PUBLIC_INPUTS);
            write_bytes(ObjectToWrite::PROOF);
        } else if (output_format == "fields") {
            write_fields(ObjectToWrite::PUBLIC_INPUTS);
            write_fields(ObjectToWrite::PROOF);
        } else if (output_format == "bytes_and_fields") {
            write_bytes(ObjectToWrite::PUBLIC_INPUTS);
            write_fields(ObjectToWrite::PUBLIC_INPUTS);
            write_bytes(ObjectToWrite::PROOF);
            write_fields(ObjectToWrite::PROOF);
        } else {
            throw_or_abort("Invalid output_format for output_content proof");
        }
    } else if (output_content == "vk") {
        if (output_format == "bytes") {
            write_bytes(ObjectToWrite::VK);
        } else if (output_format == "fields") {
            write_fields(ObjectToWrite::VK);
        } else if (output_format == "bytes_and_fields") {
            write_bytes(ObjectToWrite::VK);
            write_fields(ObjectToWrite::VK);
        } else {
            throw_or_abort("Invalid output_format for output_content vk");
        }
    } else if (output_content == "proof_and_vk") {
        if (output_format == "bytes") {
            write_bytes(ObjectToWrite::PUBLIC_INPUTS);
            write_bytes(ObjectToWrite::PROOF);
            write_bytes(ObjectToWrite::VK);
        } else if (output_format == "fields") {
            write_fields(ObjectToWrite::PUBLIC_INPUTS);
            write_fields(ObjectToWrite::PROOF);
            write_fields(ObjectToWrite::VK);
        } else if (output_format == "bytes_and_fields") {
            write_bytes(ObjectToWrite::PUBLIC_INPUTS);
            write_fields(ObjectToWrite::PUBLIC_INPUTS);
            write_bytes(ObjectToWrite::PROOF);
            write_fields(ObjectToWrite::PROOF);
            write_bytes(ObjectToWrite::VK);
            write_fields(ObjectToWrite::VK);
        } else {
            throw_or_abort("Invalid output_format for output_content proof_and_vk");
        }
    } else {
        throw_or_abort("Invalid std::string");
    }
}
} // namespace bb
