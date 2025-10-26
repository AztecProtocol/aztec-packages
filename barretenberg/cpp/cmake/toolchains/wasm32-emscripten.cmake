set(CMAKE_SYSTEM_NAME Emscripten)
set(CMAKE_SYSTEM_VERSION 1)
set(CMAKE_SYSTEM_PROCESSOR wasm32)
set(CMAKE_CROSSCOMPILING TRUE)

# Set EMSCRIPTEN_SYSTEM_PROCESSOR to wasm32 so Platform/Emscripten.cmake doesn't override to x86
set(EMSCRIPTEN_SYSTEM_PROCESSOR wasm32)

# Add emscripten cmake modules to module path so CMake can find Platform/Emscripten.cmake
list(APPEND CMAKE_MODULE_PATH "$ENV{EMSCRIPTEN_ROOT}/cmake/Modules")
