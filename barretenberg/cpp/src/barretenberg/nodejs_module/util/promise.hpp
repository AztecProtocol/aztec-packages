
#pragma once

#include "barretenberg/messaging/dispatcher.hpp"
#include "napi.h"

namespace bb::nodejs {
Napi::Promise promise_reject(const Napi::Env& env, const Napi::Value& err);
}
