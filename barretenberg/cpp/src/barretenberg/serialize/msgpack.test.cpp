#include "barretenberg/serialize/msgpack_camel_case.hpp"

// Mostly to be sure the function is constexpr.
static_assert(::msgpack_detail::camel_case("gas_used") == "gasUsed");
