# Android x86_64 toolchain for cross-compilation (emulator support)
# Requires ANDROID_NDK_HOME environment variable to be set

set(CMAKE_SYSTEM_NAME Android)
set(CMAKE_SYSTEM_PROCESSOR x86_64)

# Android API level (28 = Android 9.0)
set(CMAKE_ANDROID_API 28 CACHE STRING "Android API level")
set(ANDROID_PLATFORM android-28 CACHE STRING "Android platform")
set(ANDROID_ABI x86_64 CACHE STRING "Android ABI")

# Use the NDK toolchain if available
if(DEFINED ENV{ANDROID_NDK_HOME})
    set(CMAKE_ANDROID_NDK $ENV{ANDROID_NDK_HOME})
endif()

# Mobile build flags - disable AVM and unnecessary features
set(MOBILE ON CACHE BOOL "Mobile build")
set(AVM OFF CACHE BOOL "Disable AVM for mobile")
set(TRACY_ENABLE OFF CACHE BOOL "Disable Tracy for mobile")
