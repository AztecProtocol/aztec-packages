#pragma once
#include "barretenberg/common/container.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include <filesystem>

namespace bb {

template <typename VK> struct ProofAndKey {
    HonkProof proof;
    std::shared_ptr<VK> key;
};

template <typename ProverOutput>
void write(const ProverOutput& prover_output,
           const std::string& output_format,
           const std::string& output_content,
           const std::filesystem::path& output_dir)
{
    enum class ObjectToWrite : size_t { PROOF, VK };
    const bool output_to_stdout = output_dir == "-";

    const auto to_json = [](const std::vector<bb::fr>& data) {
        return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
    };

    const auto write_bytes = [&](const ObjectToWrite& obj) {
        switch (obj) {
        case ObjectToWrite::PROOF: {
            const auto buf = to_buffer</*include_size*/ true>(prover_output.proof);
            if (output_to_stdout) {
                write_bytes_to_stdout(buf);
            } else {
                write_file(output_dir / "proof", buf);
            }
            break;
        }
        case ObjectToWrite::VK: {
            const auto buf = to_buffer(prover_output.key);
            if (output_to_stdout) {
                write_bytes_to_stdout(buf);
            } else {
                write_file(output_dir / "vk", buf);
            }
            break;
        }
        }
    };

    const auto write_fields = [&](const ObjectToWrite& obj) {
        switch (obj) {
        case ObjectToWrite::PROOF: {
            const std::string proof_json = to_json(prover_output.proof);
            if (output_to_stdout) {
                std::cout << proof_json;
            } else {
                write_file(output_dir / "proof_fields.json", { proof_json.begin(), proof_json.end() });
            }
            break;
        }
        case ObjectToWrite::VK: {
            const std::string vk_json = to_json(prover_output.key->to_field_elements());
            if (output_to_stdout) {
                std::cout << vk_json;
            } else {
                write_file(output_dir / "vk_fields.json", { vk_json.begin(), vk_json.end() });
            }
            break;
        }
        }
    };

    if (output_content == "proof") {
        if (output_format == "bytes") {
            write_bytes(ObjectToWrite::PROOF);
        } else if (output_format == "fields") {
            write_fields(ObjectToWrite::PROOF);
        } else if (output_format == "bytes_and_fields") {
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
            write_bytes(ObjectToWrite::PROOF);
            write_bytes(ObjectToWrite::VK);
        } else if (output_format == "fields") {
            write_fields(ObjectToWrite::PROOF);
            write_fields(ObjectToWrite::VK);
        } else if (output_format == "bytes_and_fields") {
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
