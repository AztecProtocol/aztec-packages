include(GoogleTest)
include(ExternalProject)

set(GTEST_PREFIX "${CMAKE_BINARY_DIR}/_deps/gtest")
set(GTEST_SOURCE "${GTEST_PREFIX}/src/gtest")

# Create directory structure for ExternalProject
file(MAKE_DIRECTORY ${GTEST_SOURCE}/googletest/include)
file(MAKE_DIRECTORY ${GTEST_SOURCE}/googlemock/include)

set(BUILD_GMOCK ON CACHE INTERNAL BOOL "Build with gMock enabled")
set(INSTALL_GTEST OFF CACHE BOOL "gTest installation disabled")

# Configure CMake args for gtest
set(GTEST_CMAKE_ARGS
    -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE}
    -DCMAKE_C_COMPILER=${CMAKE_C_COMPILER}
    -DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER}
    -DBUILD_GMOCK=ON
    -DINSTALL_GTEST=OFF
    -DCMAKE_CXX_FLAGS=-w
)

if(WASM)
    list(APPEND GTEST_CMAKE_ARGS
        -DCMAKE_CXX_FLAGS=-w\ -DGTEST_HAS_EXCEPTIONS=0\ -DGTEST_HAS_STREAM_REDIRECTION=0
    )
endif()

ExternalProject_Add(
    gtest_project
    PREFIX ${GTEST_PREFIX}
    DOWNLOAD_COMMAND
        sh -c "mkdir -p ${GTEST_SOURCE} && cd ${GTEST_SOURCE} && git init . && (git remote add origin https://github.com/google/googletest.git || true) && git fetch --depth 1 origin v1.13.0 && git checkout FETCH_HEAD"
    SOURCE_DIR ${GTEST_SOURCE}
    CMAKE_ARGS ${GTEST_CMAKE_ARGS}
    BUILD_BYPRODUCTS
        ${GTEST_PREFIX}/src/gtest-build/lib/libgtest.a
        ${GTEST_PREFIX}/src/gtest-build/lib/libgtest_main.a
        ${GTEST_PREFIX}/src/gtest-build/lib/libgmock.a
        ${GTEST_PREFIX}/src/gtest-build/lib/libgmock_main.a
    INSTALL_COMMAND ""
    UPDATE_COMMAND ""
)

# Create imported targets
add_library(gtest STATIC IMPORTED GLOBAL)
add_library(gtest_main STATIC IMPORTED GLOBAL)
add_library(gmock STATIC IMPORTED GLOBAL)
add_library(gmock_main STATIC IMPORTED GLOBAL)

add_dependencies(gtest gtest_project)
add_dependencies(gtest_main gtest_project)
add_dependencies(gmock gtest_project)
add_dependencies(gmock_main gtest_project)

set_target_properties(gtest PROPERTIES
    IMPORTED_LOCATION ${GTEST_PREFIX}/src/gtest-build/lib/libgtest.a
    INTERFACE_INCLUDE_DIRECTORIES "${GTEST_SOURCE}/googletest/include"
)

set_target_properties(gtest_main PROPERTIES
    IMPORTED_LOCATION ${GTEST_PREFIX}/src/gtest-build/lib/libgtest_main.a
    INTERFACE_INCLUDE_DIRECTORIES "${GTEST_SOURCE}/googletest/include"
)

set_target_properties(gmock PROPERTIES
    IMPORTED_LOCATION ${GTEST_PREFIX}/src/gtest-build/lib/libgmock.a
    INTERFACE_INCLUDE_DIRECTORIES "${GTEST_SOURCE}/googlemock/include"
)

set_target_properties(gmock_main PROPERTIES
    IMPORTED_LOCATION ${GTEST_PREFIX}/src/gtest-build/lib/libgmock_main.a
    INTERFACE_INCLUDE_DIRECTORIES "${GTEST_SOURCE}/googlemock/include"
)

# GTest::gtest and GTest::gtest_main aliases
add_library(GTest::gtest ALIAS gtest)
add_library(GTest::gtest_main ALIAS gtest_main)
add_library(GTest::gmock ALIAS gmock)
add_library(GTest::gmock_main ALIAS gmock_main)

enable_testing()
