# The package's C++ TurboModule for Android, added to the app's native build by React Native's autolinking
# (react-native.config.js: a pure C++ dependency, so the package has no Gradle module).
#
# bb ships as a shared library per ABI (prebuilt/android/<abi>/libaztec_bb.so, with its own C++ runtime linked in
# and only its FFI exported), the ACVM (@aztec-labs/acvm's crate) as a Rust static library. Both exist for arm64-v8a
# and x86_64 only; on another ABI the module builds without them, and bb.js and Noir fail when used. kv-sqlite, the
# PXE's store, is compiled here from source (cpp/kv_sqlite_unit.cpp), for every ABI.
#
# target_link_libraries takes its plain signature throughout: the app's CMake links each autolinked target that way.
cmake_minimum_required(VERSION 3.13)
project(aztec_react_native CXX C)

set(PKG ${CMAKE_CURRENT_LIST_DIR}/..)
set(PREBUILT ${PKG}/prebuilt/android/${ANDROID_ABI})

add_library(aztec_react_native STATIC
  ${PKG}/cpp/NativeAztecReactNative.cpp
  ${PKG}/cpp/aztec_react_native.cpp
  ${PKG}/cpp/kv_sqlite_unit.cpp
  ${PKG}/third_party/ipc-runtime-jsi/ipc_runtime_jsi.cpp
  ${PKG}/cpp/sqlite3mc_unit.c
)
target_compile_features(aztec_react_native PUBLIC cxx_std_20)
target_include_directories(aztec_react_native
  PUBLIC ${PKG}/cpp ${PKG}/third_party/ipc-runtime-jsi
  PRIVATE ${PKG}/third_party/sqlite3mc ${PKG}/third_party/kv-sqlite ${PKG}/third_party/msgpack-c/include
)
set_source_files_properties(${PKG}/cpp/sqlite3mc_unit.c PROPERTIES COMPILE_OPTIONS "-w")
target_link_libraries(aztec_react_native jsi reactnative fbjni)

if(EXISTS ${PREBUILT}/libaztec_bb.so AND EXISTS ${PREBUILT}/libaztec_acvm.a)
  add_library(aztec_bb SHARED IMPORTED)
  set_target_properties(aztec_bb PROPERTIES IMPORTED_LOCATION ${PREBUILT}/libaztec_bb.so)
  add_library(aztec_acvm STATIC IMPORTED)
  set_target_properties(aztec_acvm PROPERTIES IMPORTED_LOCATION ${PREBUILT}/libaztec_acvm.a)
  target_compile_definitions(aztec_react_native PRIVATE AZTEC_REACT_NATIVE_LINKED_LIBRARIES=1)
  target_link_libraries(aztec_react_native aztec_bb aztec_acvm log dl m)
else()
  message(WARNING "@aztec-foundation/react-native: no bb or ACVM for ${ANDROID_ABI} (arm64-v8a and x86_64 only)")
endif()
