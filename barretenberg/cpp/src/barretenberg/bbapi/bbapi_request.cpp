#include "bbapi_request.hpp"

namespace bb::bbapi {

namespace {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
BBApiRequest global_request;
} // namespace

BBApiRequest& get_global_request()
{
    return global_request;
}

} // namespace bb::bbapi
