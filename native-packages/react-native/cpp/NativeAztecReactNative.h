#pragma once
/**
 * @file NativeAztecReactNative.h
 * @brief The package's TurboModule, `AztecReactNative`: a C++ module, written without codegen so it links the
 * same way under every React Native version the package supports (on Android through autolinking's C++ module
 * support, on iOS through AztecReactNative.mm).
 *
 * Its one method, install(dataDirectory), runs aztec::react_native::install on the JavaScript thread, with the
 * module's CallInvoker as the way back to it. An empty dataDirectory means the platform's default
 * (default_data_directory()).
 */

#include <ReactCommon/TurboModule.h>

#include <memory>
#include <string>
#include <string_view>

namespace facebook::react {

class NativeAztecReactNative : public TurboModule {
  public:
    static constexpr std::string_view kModuleName = "AztecReactNative";

    explicit NativeAztecReactNative(std::shared_ptr<CallInvoker> js_invoker);

  private:
    static jsi::Value install(jsi::Runtime& rt, TurboModule& module, const jsi::Value* args, size_t count);
};

} // namespace facebook::react

namespace aztec::react_native {

/**
 * The app's directory for Aztec's data when JavaScript names none: <files dir>/aztec on Android,
 * <Application Support>/aztec on iOS.
 */
std::string default_data_directory();

} // namespace aztec::react_native
