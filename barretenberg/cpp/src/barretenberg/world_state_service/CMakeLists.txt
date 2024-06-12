add_executable(world_state_service main.cpp)

target_link_libraries(
  world_state_service
  PRIVATE
  world_state
)
