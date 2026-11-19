#include "NativeAztecReactNative.h"

#include "aztec_react_native.hpp"

#include <stdexcept>

#if defined(__ANDROID__)
#include <fstream>
#include <unistd.h>
#endif

namespace facebook::react {

jsi::Value NativeAztecReactNative::install(jsi::Runtime& rt, TurboModule& module, const jsi::Value* args, size_t count)
{
    std::string data_dir;
    if (count > 0 && args[0].isString()) {
        data_dir = args[0].getString(rt).utf8(rt);
    }
    if (data_dir.empty()) {
        data_dir = aztec::react_native::default_data_directory();
    }
    std::weak_ptr<CallInvoker> invoker = static_cast<NativeAztecReactNative&>(module).jsInvoker_;
    aztec::react_native::install(
        rt,
        [invoker](std::function<void(jsi::Runtime&)> task) {
            if (auto js = invoker.lock()) {
                js->invokeAsync([task = std::move(task)](jsi::Runtime& runtime) { task(runtime); });
            }
        },
        data_dir);
    return jsi::Value(true);
}

NativeAztecReactNative::NativeAztecReactNative(std::shared_ptr<CallInvoker> js_invoker)
    : TurboModule(std::string(kModuleName), std::move(js_invoker))
{
    methodMap_["install"] = MethodMetadata{ 1, install };
}

} // namespace facebook::react

#if defined(__ANDROID__)
namespace aztec::react_native {

// An app's main process is named after its package, and its files directory is /data/user/<user>/<package>/files
// (Context.getFilesDir()), the user being the app's uid / 100000.
std::string default_data_directory()
{
    std::ifstream cmdline("/proc/self/cmdline");
    std::string process;
    std::getline(cmdline, process, '\0');
    auto colon = process.find(':');
    if (colon != std::string::npos) {
        process.resize(colon);
    }
    if (process.empty()) {
        throw std::runtime_error("AztecReactNative: cannot tell the app's package; pass install() a directory");
    }
    return "/data/user/" + std::to_string(getuid() / 100000) + "/" + process + "/files/aztec";
}

} // namespace aztec::react_native
#endif
