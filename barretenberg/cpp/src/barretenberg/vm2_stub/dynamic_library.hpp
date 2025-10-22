/**
 * @file dynamic_library.hpp
 * @brief POSIX dynamic library loader (Linux + macOS)
 *
 * RAII wrapper around dlopen/dlsym/dlclose for runtime loading of shared libraries.
 * Windows is not supported (project is Linux/macOS only).
 */
#pragma once

#include <dlfcn.h>
#include <optional>
#include <string>

namespace bb {

/**
 * @brief RAII wrapper for dynamically loaded shared libraries
 *
 * Provides safe loading of .so (Linux) or .dylib (macOS) libraries at runtime.
 * Automatically closes the library handle on destruction.
 */
class DynamicLibrary {
  public:
    /**
     * @brief Load a shared library by name or path
     *
     * @param name Library name (e.g., "libvm2.so") or full path
     * @return DynamicLibrary if successful, std::nullopt if load failed
     *
     * Uses RTLD_LAZY (resolve symbols on first use) and RTLD_LOCAL (don't pollute global namespace).
     * Check error with dlerror() if load fails.
     */
    static std::optional<DynamicLibrary> load(const std::string& name)
    {
        dlerror(); // Clear any existing error
        void* handle = dlopen(name.c_str(), RTLD_LAZY | RTLD_LOCAL);
        if (!handle) {
            // Error available via dlerror()
            return std::nullopt;
        }
        return DynamicLibrary(handle);
    }

    /**
     * @brief Get last dlopen/dlsym error message
     *
     * @return Error string, or nullptr if no error
     */
    static const char* last_error() { return dlerror(); }

    /**
     * @brief Get a symbol (function or variable) from the loaded library
     *
     * @tparam FuncPtr Function pointer type (e.g., void(*)(int))
     * @param name Symbol name as it appears in the library
     * @return Function pointer if found, std::nullopt if not found
     *
     * Example:
     *   auto fn = lib.get_symbol<void(*)(int)>("my_function");
     *   if (fn) { (*fn)(42); }
     */
    template <typename FuncPtr> std::optional<FuncPtr> get_symbol(const char* name) const
    {
        dlerror(); // Clear any existing error
        void* sym = dlsym(handle_, name);
        const char* error = dlerror();
        if (error != nullptr) {
            return std::nullopt;
        }
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast)
        return reinterpret_cast<FuncPtr>(sym);
    }

    // Move-only type
    DynamicLibrary(DynamicLibrary&& other) noexcept
        : handle_(other.handle_)
    {
        other.handle_ = nullptr;
    }

    DynamicLibrary& operator=(DynamicLibrary&& other) noexcept
    {
        if (this != &other) {
            if (handle_) {
                dlclose(handle_);
            }
            handle_ = other.handle_;
            other.handle_ = nullptr;
        }
        return *this;
    }

    // No copying
    DynamicLibrary(const DynamicLibrary&) = delete;
    DynamicLibrary& operator=(const DynamicLibrary&) = delete;

    ~DynamicLibrary()
    {
        if (handle_) {
            dlclose(handle_);
        }
    }

  private:
    explicit DynamicLibrary(void* handle)
        : handle_(handle)
    {}

    void* handle_;
};

} // namespace bb
