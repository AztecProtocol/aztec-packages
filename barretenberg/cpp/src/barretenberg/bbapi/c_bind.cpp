#include "c_bind.hpp"
#include "barretenberg/bbapi/bbapi_avm.hpp"
#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_ecc.hpp"
#include "barretenberg/bbapi/bbapi_ecdsa.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_schnorr.hpp"
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <algorithm>
#include <array>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <span>
#include <string>
#ifndef NO_MULTITHREADING
#include <mutex>
#endif

namespace bb::bbapi {

namespace {

template <typename Response> std::vector<uint8_t> encode_named_response(const Response& response)
{
    msgpack::sbuffer response_buffer;
    msgpack::packer<msgpack::sbuffer> packer(response_buffer);
    packer.pack_array(2);
    packer.pack(Response::MSGPACK_SCHEMA_NAME);
    packer.pack(response);
    return { response_buffer.data(), response_buffer.data() + response_buffer.size() };
}

template <typename CommandType> MsgpackCommandResult execute_payload(msgpack::object const& payload)
{
    CommandType command;
    payload.convert(command);

    auto& request = get_global_request();
    request.error_message.clear();

#ifndef BB_NO_EXCEPTIONS
    try {
#endif
        auto response = std::move(command).execute(request);
        if (!request.error_message.empty()) {
            return { .response = encode_named_response(ErrorResponse{ .message = std::move(request.error_message) }) };
        }
        return { .response = encode_named_response(response) };
#ifndef BB_NO_EXCEPTIONS
    } catch (const std::exception& e) {
        return { .response = encode_named_response(ErrorResponse{ .message = e.what() }) };
    }
#endif
}

struct CommandDescriptor {
    std::string_view name;
    MsgpackCommandResult (*execute)(msgpack::object const&);
    bool shutdown = false;
};

template <typename CommandType> constexpr CommandDescriptor command_descriptor(bool shutdown = false)
{
    return { CommandType::MSGPACK_SCHEMA_NAME, execute_payload<CommandType>, shutdown };
}

constexpr auto COMMAND_DESCRIPTORS = std::to_array<CommandDescriptor>({
    command_descriptor<AvmProve>(),
    command_descriptor<AvmVerify>(),
    command_descriptor<AvmCheckCircuit>(),
    command_descriptor<CircuitProve>(),
    command_descriptor<CircuitComputeVk>(),
    command_descriptor<CircuitStats>(),
    command_descriptor<CircuitVerify>(),
    command_descriptor<ChonkComputeVk>(),
    command_descriptor<ChonkStart>(),
    command_descriptor<ChonkLoad>(),
    command_descriptor<ChonkAccumulate>(),
    command_descriptor<ChonkProve>(),
    command_descriptor<ChonkVerify>(),
    command_descriptor<ChonkVerifyFromFields>(),
    command_descriptor<ChonkBatchVerify>(),
    command_descriptor<VkAsFields>(),
    command_descriptor<MegaVkAsFields>(),
    command_descriptor<CircuitWriteSolidityVerifier>(),
    command_descriptor<ChonkCheckPrecomputedVk>(),
    command_descriptor<ChonkStats>(),
    command_descriptor<ChonkCompressProof>(),
    command_descriptor<ChonkDecompressProof>(),
    command_descriptor<Poseidon2Hash>(),
    command_descriptor<Poseidon2Permutation>(),
    command_descriptor<PedersenCommit>(),
    command_descriptor<PedersenHash>(),
    command_descriptor<PedersenHashBuffer>(),
    command_descriptor<Blake2s>(),
    command_descriptor<Blake2sToField>(),
    command_descriptor<AesEncrypt>(),
    command_descriptor<AesDecrypt>(),
    command_descriptor<GrumpkinMul>(),
    command_descriptor<GrumpkinAdd>(),
    command_descriptor<GrumpkinBatchMul>(),
    command_descriptor<GrumpkinGetRandomFr>(),
    command_descriptor<GrumpkinReduce512>(),
    command_descriptor<Secp256k1Mul>(),
    command_descriptor<Secp256k1GetRandomFr>(),
    command_descriptor<Secp256k1Reduce512>(),
    command_descriptor<Bn254FrSqrt>(),
    command_descriptor<Bn254FqSqrt>(),
    command_descriptor<Bn254G1Mul>(),
    command_descriptor<Bn254G2Mul>(),
    command_descriptor<Bn254G1IsOnCurve>(),
    command_descriptor<Bn254G1FromCompressed>(),
    command_descriptor<SchnorrComputePublicKey>(),
    command_descriptor<SchnorrConstructSignature>(),
    command_descriptor<SchnorrVerifySignature>(),
    command_descriptor<EcdsaSecp256k1ComputePublicKey>(),
    command_descriptor<EcdsaSecp256r1ComputePublicKey>(),
    command_descriptor<EcdsaSecp256k1ConstructSignature>(),
    command_descriptor<EcdsaSecp256r1ConstructSignature>(),
    command_descriptor<EcdsaSecp256k1RecoverPublicKey>(),
    command_descriptor<EcdsaSecp256r1RecoverPublicKey>(),
    command_descriptor<EcdsaSecp256k1VerifySignature>(),
    command_descriptor<EcdsaSecp256r1VerifySignature>(),
    command_descriptor<SrsInitSrs>(),
    command_descriptor<ChonkBatchVerifierStart>(),
    command_descriptor<ChonkBatchVerifierQueue>(),
    command_descriptor<ChonkBatchVerifierStop>(),
    command_descriptor<SrsInitGrumpkinSrs>(),
    command_descriptor<Shutdown>(true),
});

void write_output(std::span<const uint8_t> response, uint8_t** output_out, size_t* output_len_out)
{
    uint8_t* scratch_buf = *output_out;
    const size_t scratch_size = *output_len_out;
    if (scratch_buf != nullptr && response.size() <= scratch_size) {
        memcpy(scratch_buf, response.data(), response.size());
        *output_len_out = response.size();
        return;
    }

    uint8_t* output = static_cast<uint8_t*>(aligned_alloc(64, response.size()));
    memcpy(output, response.data(), response.size());
    *output_out = output;
    *output_len_out = response.size();
}

} // namespace

std::string_view msgpack_command_error_message(MsgpackCommandError error, bool cli_context)
{
    switch (error) {
    case MsgpackCommandError::None:
        return "";
    case MsgpackCommandError::ExpectedArgumentTuple:
        if (cli_context) {
            return "Expected an array of size 1 (tuple of arguments) for bbapi command deserialization";
        }
        return "Expected an array of size 1 (tuple of arguments)";
    case MsgpackCommandError::ExpectedCommandTuple:
        return "Expected Command to be an array of size 2 [command-name, payload]";
    case MsgpackCommandError::ExpectedCommandName:
        return "Expected first element of Command to be a string (type name)";
    }
    return "Unknown msgpack command error";
}

MsgpackCommandResult execute_msgpack_command_buffer(std::span<const uint8_t> request)
{
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(request.data()), request.size());
    auto obj = unpacked.get();

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
        return { .error = MsgpackCommandError::ExpectedArgumentTuple };
    }

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    auto& command_obj = obj.via.array.ptr[0];

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    if (command_obj.type != msgpack::type::ARRAY || command_obj.via.array.size != 2) {
        return { .error = MsgpackCommandError::ExpectedCommandTuple };
    }

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    auto& command_arr = command_obj.via.array;
    if (command_arr.ptr[0].type != msgpack::type::STR) {
        return { .error = MsgpackCommandError::ExpectedCommandName };
    }

    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
    const std::string_view command_name(command_arr.ptr[0].via.str.ptr, command_arr.ptr[0].via.str.size);
    auto descriptor = std::find_if(COMMAND_DESCRIPTORS.begin(), COMMAND_DESCRIPTORS.end(), [&](const auto& candidate) {
        return candidate.name == command_name;
    });
    if (descriptor == COMMAND_DESCRIPTORS.end()) {
        throw_or_abort("Unknown type name in NamedUnion deserialization: " + std::string(command_name));
    }

    auto result = descriptor->execute(command_arr.ptr[1]);
    result.shutdown = descriptor->shutdown;
    return result;
}

std::vector<uint8_t> encode_msgpack_error_response(std::string_view message)
{
    return encode_named_response(ErrorResponse{ .message = std::string(message) });
}

} // namespace bb::bbapi

WASM_EXPORT void bbapi(const uint8_t* input_in, size_t input_len_in, uint8_t** output_out, size_t* output_len_out)
{
    auto result = bb::bbapi::execute_msgpack_command_buffer(std::span<const uint8_t>(input_in, input_len_in));
    if (!result.ok()) {
        throw_or_abort(std::string(bb::bbapi::msgpack_command_error_message(result.error)));
    }
    bb::bbapi::write_output(result.response, output_out, output_len_out);
}
