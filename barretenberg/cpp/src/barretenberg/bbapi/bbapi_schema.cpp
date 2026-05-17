#include "bbapi_schema.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

namespace bb::bbapi {

void pack_msgpack_command_schema(MsgpackSchemaPacker& packer);
void pack_msgpack_response_schema(MsgpackSchemaPacker& packer);

std::string get_msgpack_schema_as_json()
{
    msgpack::sbuffer output;
    MsgpackSchemaPacker packer{ output };
    packer.pack_map(3);
    packer.pack("__typename");
    packer.pack("Api");
    packer.pack("commands");
    pack_msgpack_command_schema(packer);
    packer.pack("responses");
    pack_msgpack_response_schema(packer);

    msgpack::object_handle oh = msgpack::unpack(output.data(), output.size());
    std::stringstream pretty_output;
    pretty_output << oh.get() << std::endl;
    return pretty_output.str();
}
} // namespace bb::bbapi
