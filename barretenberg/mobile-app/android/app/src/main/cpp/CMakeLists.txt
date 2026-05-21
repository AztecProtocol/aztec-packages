cmake_minimum_required(VERSION 3.22.1)

project(bbmobilebench LANGUAGES CXX)

add_library(
    bbmobilebench
    SHARED
    mobile_bench_jni.cpp
    ../../../../../shared/src/bb_mobile.cpp
)

target_include_directories(
    bbmobilebench
    PRIVATE
    ../../../../../shared/include
)

target_compile_features(bbmobilebench PRIVATE cxx_std_20)
