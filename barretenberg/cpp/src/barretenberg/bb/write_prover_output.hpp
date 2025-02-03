#pragma once
#include "barretenberg/bb/api_flag_types.hpp"
#include "barretenberg/common/log.hpp"
#include <filesystem>

namespace bb {
template <typename ProverOutput>
void write(const ProverOutput& prover_output,
           const OutputDataType& output_data_type,
           const OutputContentType& output_content,
           const std::filesystem::path& output_dir)
{
    enum class ObjectToWrite : size_t { PROOF, VK };
    const bool output_to_stdout = output_dir == "-";

    const auto write_bytes = [&](const ObjectToWrite& obj) {
        switch (obj) {
        case ObjectToWrite::PROOF: {
            info("case ObjectToWrite::PROOF: ");
            const auto buf = to_buffer</*include_size*/ true>(prover_output.proof);
            if (output_to_stdout) {
                write_bytes_to_stdout(buf);
            } else {
                write_file(output_dir / "proof", buf);
            }
            break;
        }
        case ObjectToWrite::VK: {
            info("case ObjectToWrite::VK: ");
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
            info("case ObjectToWrite::PROOF: ");
            const std::string proof_json = to_json(prover_output.proof);
            if (output_to_stdout) {
                write_string_to_stdout(proof_json);
            } else {
                info("writing proof as fields to ", output_dir / "proof_fields.json");
                write_file(output_dir / "proof_fields.json", { proof_json.begin(), proof_json.end() });
            }
            break;
        }
        case ObjectToWrite::VK: {
            info("case ObjectToWrite::VK: ");
            const std::string vk_json = to_json(prover_output.key.to_field_elements());
            if (output_to_stdout) {
                write_string_to_stdout(vk_json);
            } else {
                info("writing vk as fields to ", output_dir / "vk_fields.json");
                write_file(output_dir / "vk_fields.json", { vk_json.begin(), vk_json.end() });
            }
            break;
        }
        }
    };

    switch (output_content) {
    case OutputContentType::PROOF: {
        switch (output_data_type) {
        case OutputDataType::BYTES: {
            info("case OutputDataType::BYTES: ");
            write_bytes(ObjectToWrite::PROOF);
            break;
        }
        case OutputDataType::FIELDS: {
            info("case OutputDataType::FIELDS: ");
            write_fields(ObjectToWrite::PROOF);
            break;
        }
        case OutputDataType::BYTES_AND_FIELDS: {
            info("case OutputDataType::BYTES_AND_FIELDS: ");
            write_bytes(ObjectToWrite::PROOF);
            write_fields(ObjectToWrite::PROOF);
            break;
        }
        default:
            ASSERT("Invalid OutputDataType for PROOF");
        }
        break;
    }
    case OutputContentType::VK: {
        switch (output_data_type) {
        case OutputDataType::BYTES: {
            info("case OutputDataType::BYTES: ");
            write_bytes(ObjectToWrite::VK);
            break;
        }
        case OutputDataType::FIELDS: {
            info("case OutputDataType::FIELDS: ");
            write_fields(ObjectToWrite::VK);
            break;
        }
        case OutputDataType::BYTES_AND_FIELDS: {
            info("case OutputDataType::BYTES_AND_FIELDS: ");
            write_bytes(ObjectToWrite::VK);
            write_fields(ObjectToWrite::VK);
            break;
        }
        default:
            ASSERT("Invalid OutputDataType for VK");
        }
        break;
    }
    case OutputContentType::PROOF_AND_VK: {
        switch (output_data_type) {
        case OutputDataType::BYTES: {
            info("case OutputDataType::BYTES: ");
            write_bytes(ObjectToWrite::PROOF);
            write_bytes(ObjectToWrite::VK);
            break;
        }
        case OutputDataType::FIELDS: {
            info("case OutputDataType::FIELDS: ");
            write_fields(ObjectToWrite::PROOF);
            write_fields(ObjectToWrite::VK);
            break;
        }
        case OutputDataType::BYTES_AND_FIELDS: {
            info("case OutputDataType::BYTES_AND_FIELDS: ");
            write_bytes(ObjectToWrite::PROOF);
            write_fields(ObjectToWrite::PROOF);
            write_bytes(ObjectToWrite::VK);
            write_fields(ObjectToWrite::VK);
            break;
        }
        default:
            ASSERT("Invalid OutputDataType for PROOF_AND_VK");
        }
        break;
    }
    default:
        ASSERT("Invalid OutputContentType");
    }
}
} // namespace bb