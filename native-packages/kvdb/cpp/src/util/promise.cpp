
#include "napi.h"

namespace azteclabs::kvdb {

Napi::Promise promise_reject(const Napi::Env& env, const Napi::Value& err)
{
    auto def = Napi::Promise::Deferred::New(env);
    def.Reject(err);
    return def.Promise();
}
} // namespace azteclabs::kvdb
