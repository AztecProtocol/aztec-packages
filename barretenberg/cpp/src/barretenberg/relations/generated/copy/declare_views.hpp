
#define Copy_DECLARE_VIEWS(index)                                                                                      \
    using Accumulator = typename std::tuple_element<index, ContainerOverSubrelations>::type;                           \
    using View = typename Accumulator::View;                                                                           \
    [[maybe_unused]] auto copy_d = View(new_term.copy_d);                                                              \
    [[maybe_unused]] auto copy_sigma_x = View(new_term.copy_sigma_x);                                                  \
    [[maybe_unused]] auto copy_sigma_y = View(new_term.copy_sigma_y);                                                  \
    [[maybe_unused]] auto copy_sigma_z = View(new_term.copy_sigma_z);                                                  \
    [[maybe_unused]] auto copy_x = View(new_term.copy_x);                                                              \
    [[maybe_unused]] auto copy_y = View(new_term.copy_y);                                                              \
    [[maybe_unused]] auto copy_z = View(new_term.copy_z);                                                              \
    [[maybe_unused]] auto copy_main = View(new_term.copy_main);                                                        \
    [[maybe_unused]] auto copy_main_shift = View(new_term.copy_main_shift);                                            \
    [[maybe_unused]] auto id_0 = View(new_term.id_0);                                                                  \
    [[maybe_unused]] auto id_1 = View(new_term.id_1);                                                                  \
    [[maybe_unused]] auto copy_d_shift = View(new_term.copy_d_shift);
