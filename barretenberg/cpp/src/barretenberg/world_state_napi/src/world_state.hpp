#include <napi.h>

class WorldStateAddon : public Napi::ObjectWrap<WorldStateAddon> {
  public:
    WorldStateAddon(const Napi::CallbackInfo&);
    Napi::Value Greet(const Napi::CallbackInfo&);
    static Napi::Function GetClass(Napi::Env);

  private:
    std::string _greeterName;
};
