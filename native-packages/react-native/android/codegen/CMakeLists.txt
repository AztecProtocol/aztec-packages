# What autolinking expects of a library's codegen output (react_codegen_<libraryName>, with <libraryName>.h
# declaring <libraryName>_ModuleProvider), for a package whose only module is a C++ one: it provides no Java
# modules. Written by hand so the package needs no codegen step in the app.
cmake_minimum_required(VERSION 3.13)
add_library(react_codegen_AztecReactNative STATIC ${CMAKE_CURRENT_LIST_DIR}/AztecReactNative.cpp)
target_include_directories(react_codegen_AztecReactNative PUBLIC ${CMAKE_CURRENT_LIST_DIR})
target_compile_features(react_codegen_AztecReactNative PUBLIC cxx_std_20)
target_link_libraries(react_codegen_AztecReactNative jsi reactnative fbjni)
