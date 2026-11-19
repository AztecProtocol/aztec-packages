#pragma once

#include <ReactCommon/JavaTurboModule.h>
#include <ReactCommon/TurboModule.h>

#include <memory>
#include <string>

namespace facebook::react {

/** The package's Java TurboModules: none (its module is NativeAztecReactNative, in C++). */
std::shared_ptr<TurboModule> AztecReactNative_ModuleProvider(const std::string& moduleName,
                                                             const JavaTurboModule::InitParams& params);

} // namespace facebook::react
