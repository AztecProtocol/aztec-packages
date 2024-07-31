include(FetchContent)

# This library is intrinsically controlled by TRACY_ENABLE which we just forward as a top-level CMake setting.
option(TRACY_PROFILING "Enable Tracy Profiling" ON)
option(TRACY_ON_DEMAND "Enable Tracy On Demand" OFF)

FetchContent_Declare(tracy
    GIT_REPOSITORY https://github.com/wolfpld/tracy
    GIT_TAG ffb98a972401c246b2348fb5341252e2ba855d00
    SYSTEM          # optional, the tracy include directory will be treated as system directory
)
FetchContent_MakeAvailable(tracy)
