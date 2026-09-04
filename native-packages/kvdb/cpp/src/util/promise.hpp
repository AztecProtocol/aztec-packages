
#pragma once

#include "messaging/dispatcher.hpp"
#include "napi.h"

namespace azteclabs::kvdb {
Napi::Promise promise_reject(const Napi::Env& env, const Napi::Value& err);
}
