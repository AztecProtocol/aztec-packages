#include "barretenberg/bbapi/bbapi_avm.hpp"
#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

namespace bb::bbapi {
namespace {
template <typename T> void pack_command_schema_entry(MsgpackSchemaPacker& packer)
{
    packer.pack_array(2);
    packer.pack(T::MSGPACK_SCHEMA_NAME);
    packer.pack_schema(*std::make_unique<T>());
}
} // namespace

void pack_msgpack_command_schema_first(MsgpackSchemaPacker& packer)
{
    pack_command_schema_entry<AvmProve>(packer);
    pack_command_schema_entry<AvmVerify>(packer);
    pack_command_schema_entry<AvmCheckCircuit>(packer);
    pack_command_schema_entry<CircuitProve>(packer);
    pack_command_schema_entry<CircuitComputeVk>(packer);
    pack_command_schema_entry<CircuitStats>(packer);
    pack_command_schema_entry<CircuitVerify>(packer);
    pack_command_schema_entry<ChonkComputeVk>(packer);
    pack_command_schema_entry<ChonkStart>(packer);
    pack_command_schema_entry<ChonkLoad>(packer);
    pack_command_schema_entry<ChonkAccumulate>(packer);
    pack_command_schema_entry<ChonkProve>(packer);
    pack_command_schema_entry<ChonkVerify>(packer);
    pack_command_schema_entry<ChonkVerifyFromFields>(packer);
    pack_command_schema_entry<ChonkBatchVerify>(packer);
    pack_command_schema_entry<VkAsFields>(packer);
    pack_command_schema_entry<MegaVkAsFields>(packer);
    pack_command_schema_entry<CircuitWriteSolidityVerifier>(packer);
    pack_command_schema_entry<ChonkCheckPrecomputedVk>(packer);
    pack_command_schema_entry<ChonkStats>(packer);
    pack_command_schema_entry<ChonkCompressProof>(packer);
    pack_command_schema_entry<ChonkDecompressProof>(packer);
}
} // namespace bb::bbapi
