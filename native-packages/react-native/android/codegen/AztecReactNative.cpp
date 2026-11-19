#include "AztecReactNative.h"

namespace facebook::react {

std::shared_ptr<TurboModule> AztecReactNative_ModuleProvider(const std::string& /*moduleName*/,
                                                             const JavaTurboModule::InitParams& /*params*/)
{
    return nullptr;
}

} // namespace facebook::react
