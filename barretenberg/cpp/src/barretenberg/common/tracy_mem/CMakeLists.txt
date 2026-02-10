add_library(tracy_mem OBJECT overload_operator_new.cpp)

if(ENABLE_STACKTRACES)
    target_link_libraries(tracy_mem PUBLIC Backward::Interface)
endif()
