set(CMAKE_SYSTEM_NAME Emscripten)
set(CMAKE_SYSTEM_VERSION 1)
set(CMAKE_SYSTEM_PROCESSOR wasm32)
set(CMAKE_CROSSCOMPILING TRUE)

# Add emscripten cmake modules to module path so CMake can find Platform/Emscripten.cmake
list(APPEND CMAKE_MODULE_PATH "$ENV{EMSCRIPTEN_ROOT}/cmake/Modules")
