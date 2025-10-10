include(ExternalProject)

set(BENCHMARK_PREFIX "${CMAKE_BINARY_DIR}/_deps/benchmark")
set(BENCHMARK_SOURCE "${BENCHMARK_PREFIX}/src/benchmark")

# Create directory structure for ExternalProject
file(MAKE_DIRECTORY ${BENCHMARK_SOURCE}/include)

set(BENCHMARK_CMAKE_ARGS
    -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
    -DCMAKE_C_COMPILER=${CMAKE_C_COMPILER}
    -DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER}
    -DBENCHMARK_ENABLE_TESTING=OFF
    -DBENCHMARK_ENABLE_INSTALL=OFF
)

ExternalProject_Add(
    benchmark_project
    PREFIX ${BENCHMARK_PREFIX}
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${BENCHMARK_SOURCE} && cd ${BENCHMARK_SOURCE} && git init . && (git remote add origin https://github.com/AztecProtocol/google-benchmark || true) && git fetch --depth 1 origin 7638387d2727853d970fc9420dcf95cf3e9bd112 && git checkout FETCH_HEAD"
    SOURCE_DIR ${BENCHMARK_SOURCE}
    CMAKE_ARGS ${BENCHMARK_CMAKE_ARGS}
    BUILD_BYPRODUCTS ${BENCHMARK_PREFIX}/src/benchmark-build/src/libbenchmark.a
    INSTALL_COMMAND ""
    UPDATE_COMMAND ""
)

add_library(benchmark STATIC IMPORTED GLOBAL)
add_dependencies(benchmark benchmark_project)
set_target_properties(benchmark PROPERTIES
    IMPORTED_LOCATION ${BENCHMARK_PREFIX}/src/benchmark-build/src/libbenchmark.a
    INTERFACE_INCLUDE_DIRECTORIES "${BENCHMARK_SOURCE}/include"
)

# Create namespaced alias
add_library(benchmark::benchmark ALIAS benchmark)
