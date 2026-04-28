# CMake toolchain for building barretenberg with Emscripten.
#
# Targets the Node.js runtime: Emscripten emits a `<binary>.js` glue plus a
# sibling `<binary>.wasm`. Tests are launched via `barretenberg/cpp/scripts/wasm-run`,
# which forwards to Node with the necessary flags.
#
# Required environment:
#   EMSDK -- root of an active emsdk install. The pinned version lives in
#            `.emsdk-version` at the repo root; CI installs that exact tag and
#            sources `emsdk_env.sh` before configuring.
#
# Cache options:
#   WASM_EXCEPTIONS -- "wasm" (default) or "none". Legacy JS exceptions are
#                      explicitly unsupported.

if(NOT DEFINED ENV{EMSDK} OR "$ENV{EMSDK}" STREQUAL "")
    message(FATAL_ERROR
        "EMSDK environment variable is not set. Source emsdk_env.sh from your "
        "emsdk install (pinned version: see .emsdk-version at the repo root).")
endif()

set(EMSDK_ROOT "$ENV{EMSDK}")
set(EMSCRIPTEN_ROOT "${EMSDK_ROOT}/upstream/emscripten")

if(NOT EXISTS "${EMSCRIPTEN_ROOT}/emcc")
    # Some emsdk layouts expose emcc at $EMSDK/emcc.
    if(EXISTS "${EMSDK_ROOT}/emcc")
        set(EMSCRIPTEN_ROOT "${EMSDK_ROOT}")
    else()
        message(FATAL_ERROR
            "Could not find emcc under '${EMSCRIPTEN_ROOT}' or '${EMSDK_ROOT}'. "
            "Make sure emsdk is activated (`./emsdk activate <version>` and "
            "`source ./emsdk_env.sh`).")
    endif()
endif()

set(CMAKE_SYSTEM_NAME Emscripten)
set(CMAKE_SYSTEM_VERSION 1)
set(CMAKE_SYSTEM_PROCESSOR wasm32)

set(CMAKE_C_COMPILER   "${EMSCRIPTEN_ROOT}/emcc")
set(CMAKE_CXX_COMPILER "${EMSCRIPTEN_ROOT}/em++")
set(CMAKE_AR           "${EMSCRIPTEN_ROOT}/emar"     CACHE FILEPATH "")
set(CMAKE_RANLIB       "${EMSCRIPTEN_ROOT}/emranlib" CACHE FILEPATH "")

set(CMAKE_C_COMPILER_WORKS   ON)
set(CMAKE_CXX_COMPILER_WORKS ON)

# Identify the target as wasm so existing `if(WASM)` logic stays correct.
set(WASM ON)
add_compile_definitions(BB_WASM=1)

# Emscripten emits `<name>.js` (the loader) plus a sibling `<name>.wasm`. We
# resolve the .js via wasm-run; downstream tooling expects executables to land
# under bin/ with a .js suffix.
set(CMAKE_EXECUTABLE_SUFFIX ".js")

# Exception model. wasm-exceptions is the only supported release path; legacy
# JS exceptions (`-sDISABLE_EXCEPTION_CATCHING=0` / `-fexceptions` JS) are
# rejected because they rely on an Asyncify-style shim that conflicts with
# pthreads + memory.grow.
set(WASM_EXCEPTIONS "wasm" CACHE STRING
    "Wasm exception model: 'wasm' (default) or 'none'")
set_property(CACHE WASM_EXCEPTIONS PROPERTY STRINGS wasm none)

if(WASM_EXCEPTIONS STREQUAL "wasm")
    add_compile_options(-fwasm-exceptions)
    add_link_options(-fwasm-exceptions)
elseif(WASM_EXCEPTIONS STREQUAL "none")
    add_compile_options(-fno-exceptions)
    add_link_options(-fno-exceptions)
    add_compile_definitions(BB_NO_EXCEPTIONS)
else()
    message(FATAL_ERROR
        "WASM_EXCEPTIONS must be 'wasm' or 'none' (got '${WASM_EXCEPTIONS}'). "
        "Legacy JS exceptions are not supported under Emscripten + pthreads.")
endif()

# Canonical compile flags for the Emscripten target.
add_compile_options(-pthread -msimd128 -O3 -flto)
add_link_options(-pthread -msimd128 -O3 -flto)

# Canonical link-only Emscripten settings (per migration spec).
#  - PROXY_TO_PTHREAD migrates main() onto a pthread so the JS main thread
#    never blocks on synchronous wasm calls. This is the *core* property the
#    migration buys us; without it any export call from the main JS thread
#    deadlocks when a wasm helper waits on a worker.
#  - ALLOW_BLOCKING_ON_MAIN_THREAD=0 surfaces the bug class above as a hard
#    error if PROXY_TO_PTHREAD is ever disabled or bypassed.
#  - MALLOC=mimalloc gives us scalable thread-aware allocation for the
#    pthread pool. dlmalloc serializes all allocations on a single lock.
#  - INITIAL_MEMORY=512MB / MAXIMUM_MEMORY=4GB / STACK_SIZE=8MB pin the
#    canonical wasm32 memory shape; the previous bespoke 32 MiB initial /
#    1 MiB stack values made the threaded benchmark unrunnable at scale.
#  - PTHREAD_POOL_SIZE=16 is the link-time default. The bb.js loader can
#    override it at runtime via Module.pthreadPoolSize.
#  - PTHREAD_POOL_SIZE_STRICT=1 warns when the pool is exhausted and
#    spawns the extra worker on demand. The pool-exhaustion regression
#    test (wasm_threads_tests/pool_exhaustion.test.cpp) deliberately
#    spawns PTHREAD_POOL_SIZE+4 = 20 std::threads and asserts every one
#    completes; under STRICT=2 the 17th `pthread_create` would be
#    rejected with EAGAIN and the test would always fail. STRICT=1 is
#    the elastic-growth-with-warning behaviour the test exercises.
#  - ENVIRONMENT=web,worker,node — the artifact runs in all three.
#  - EXIT_RUNTIME=1 ensures the Node process exits when main returns,
#    required for the "clean shutdown within 5s" property.
add_link_options(
    "SHELL:-sPTHREAD_POOL_SIZE=16"
    "SHELL:-sPTHREAD_POOL_SIZE_STRICT=1"
    "SHELL:-sPROXY_TO_PTHREAD"
    "SHELL:-sALLOW_BLOCKING_ON_MAIN_THREAD=0"
    "SHELL:-sMALLOC=mimalloc"
    "SHELL:-sALLOW_MEMORY_GROWTH=1"
    "SHELL:-sINITIAL_MEMORY=512MB"
    "SHELL:-sMAXIMUM_MEMORY=4GB"
    "SHELL:-sSTACK_SIZE=8MB"
    "SHELL:-sMODULARIZE=1"
    "SHELL:-sEXPORT_ES6=1"
    "SHELL:-sEXPORT_NAME=createBarretenbergModule"
    "SHELL:-sENVIRONMENT=web,worker,node"
    "SHELL:-sEXIT_RUNTIME=1"
    "SHELL:-sNODEJS_CATCH_EXIT=0"
    "SHELL:-sNODEJS_CATCH_REJECTION=0"
    "SHELL:-sABORTING_MALLOC=0"
)

# Debug / assertion variants. CMAKE_BUILD_TYPE is set by the preset.
# ASSERTIONS=2 + SAFE_HEAP=1 are debug-only because they materially slow the
# runtime down; the spec puts them out of the release link line.
set(CMAKE_C_FLAGS_DEBUG_INIT   "-O1 -g")
set(CMAKE_CXX_FLAGS_DEBUG_INIT "-O1 -g")
set(CMAKE_EXE_LINKER_FLAGS_DEBUG_INIT
    "-O1 -g -sASSERTIONS=2 -sSAFE_HEAP=1 -sSTACK_OVERFLOW_CHECK=2")

# CMake "find" routing -- Emscripten ships its own sysroot under
# $EMSDK/upstream/emscripten/cache/sysroot.
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
