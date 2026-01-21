# iOS ARM64 toolchain for cross-compilation
set(CMAKE_SYSTEM_NAME iOS)
set(CMAKE_SYSTEM_PROCESSOR aarch64)

# iOS deployment target
set(CMAKE_OSX_DEPLOYMENT_TARGET "15.0" CACHE STRING "Minimum iOS version")
set(CMAKE_OSX_ARCHITECTURES "arm64" CACHE STRING "Target architecture")

# Use the iOS SDK
set(CMAKE_OSX_SYSROOT iphoneos)

# Disable bitcode (deprecated in Xcode 14+)
set(CMAKE_XCODE_ATTRIBUTE_ENABLE_BITCODE "NO")

# Mobile build flags - disable AVM and unnecessary features
set(MOBILE ON CACHE BOOL "Mobile build")
set(AVM OFF CACHE BOOL "Disable AVM for mobile")
set(TRACY_ENABLE OFF CACHE BOOL "Disable Tracy for mobile")
