
#include "napi.h"

namespace bb::nodejs {

Napi::Promise promise_reject(const Napi::Env& env, const Napi::Value& err)
{
    auto def = Napi::Promise::Deferred::New(env);
    def.Reject(err);
    return def.Promise();
}
} // namespace bb::nodejs
