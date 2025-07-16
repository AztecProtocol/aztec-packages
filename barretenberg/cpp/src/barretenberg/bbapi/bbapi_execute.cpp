#include "bbapi_execute.hpp"

namespace bb::bbapi {
namespace { // anonymous
struct Api {
    Command commands;
    bb::bbapi::CommandResponse responses;
    MSGPACK_FIELDS(commands, responses);
};
} // namespace
std::string get_msgpack_schema_as_json()
{
    return msgpack_schema_to_string(Api{});
}
} // namespace bb::bbapi
