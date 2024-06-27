#include "world_state.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

using namespace Napi;

WorldStateAddon::WorldStateAddon(const CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
        return;
    }

    if (!info[0].IsString()) {
        TypeError::New(env, "You need to name yourself").ThrowAsJavaScriptException();
        return;
    }

    this->_greeterName = info[0].As<String>().Utf8Value();
}

Value WorldStateAddon::Greet(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsString()) {
        TypeError::New(env, "You need to introduce yourself to greet").ThrowAsJavaScriptException();
        return env.Null();
    }

    auto name = info[0].As<Napi::String>();
    printf("Hello %s\n", name.Utf8Value().c_str());
    printf("I am %s\n", this->_greeterName.c_str());

    return String::New(env, this->_greeterName);
}

Function WorldStateAddon::GetClass(Napi::Env env)
{
    return DefineClass(env,
                       "WorldState",
                       {
                           WorldStateAddon::InstanceMethod("greet", &WorldStateAddon::Greet),
                       });
}

Object Init(Env env, Object exports)
{
    String name = String::New(env, "WorldState");
    exports.Set(name, WorldStateAddon::GetClass(env));
    return exports;
}

NODE_API_MODULE(addon, Init)
