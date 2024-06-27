#include "barretenberg/common/log.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <napi.h>

class WorldStateAddon : public Napi::Addon<WorldStateAddon> {
  public:
    // NOLINTNEXTLINE
    WorldStateAddon(Napi::Env env, Napi::Object exports)
    {
        (void)env;
        DefineAddon(exports, { InstanceMethod("hello", &WorldStateAddon::Hello, napi_enumerable) });
    }

  private:
    Napi::Value Hello(const Napi::CallbackInfo& info)
    {
        auto x = bb::fr(3);
        return Napi::String::New(info.Env(), format(x));
    }
};

NODE_API_ADDON(WorldStateAddon)
