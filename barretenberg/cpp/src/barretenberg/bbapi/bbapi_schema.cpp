#include "bbapi_execute.hpp"

namespace bb::bbapi {
namespace {
struct Api {
    Command commands;
    CommandResponse responses;
    SERIALIZATION_FIELDS(commands, responses);
};
} // namespace

std::string get_msgpack_schema_as_json()
{
    return msgpack_schema_to_string(Api{});
}
} // namespace bb::bbapi
