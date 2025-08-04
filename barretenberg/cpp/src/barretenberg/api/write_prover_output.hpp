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
    fr vk_hash;
};

template <typename ProverOutput>
void write(const ProverOutput& prover_output,
           const std::string& output_format,
           const std::string& output_content,
           const std::filesystem::path& output_dir)
{
    enum class ObjectToWrite : size_t { PUBLIC_INPUTS, PROOF, VK, VK_HASH };
    const bool output_to_stdout = output_dir == "-";

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
        case ObjectToWrite::VK_HASH: {
            const auto buf = to_buffer(prover_output.vk_hash);
            if (output_to_stdout) {
                write_bytes_to_stdout(buf);
            } else {
                write_file(output_dir / "vk_hash", buf);
                info("VK Hash saved to ", output_dir / "vk_hash");
            }
            break;
        }
        }
    };

    if (output_content == "proof") {
        if (output_format == "bytes") {
            write_bytes(ObjectToWrite::PUBLIC_INPUTS);
            write_bytes(ObjectToWrite::PROOF);
        } else {
            throw_or_abort("Invalid output_format for output_content proof");
        }
    } else if (output_content == "vk") {
        if (output_format == "bytes") {
            write_bytes(ObjectToWrite::VK);
            write_bytes(ObjectToWrite::VK_HASH);
        } else {
            throw_or_abort("Invalid output_format for output_content vk");
        }
    } else if (output_content == "proof_and_vk") {
        if (output_format == "bytes") {
            write_bytes(ObjectToWrite::PUBLIC_INPUTS);
            write_bytes(ObjectToWrite::PROOF);
            write_bytes(ObjectToWrite::VK);
            write_bytes(ObjectToWrite::VK_HASH);
        } else {
            throw_or_abort("Invalid output_format for output_content proof_and_vk");
        }
    } else {
        throw_or_abort("Invalid std::string");
    }
}
} // namespace bb
