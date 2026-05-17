#include "bbapi_execute.hpp"

namespace bb::bbapi {
void pack_msgpack_response_schema(MsgpackSchemaPacker& packer)
{
    _msgpack_schema_pack(packer, CommandResponse{});
}
} // namespace bb::bbapi
