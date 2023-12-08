
#define DECLARE_VIEWS(index)                                                                                           \
    using Accumulator = typename std::tuple_element<index, ContainerOverSubrelations>::type;                           \
    using View = typename Accumulator::View;                                                                           \
    [[maybe_unused]] auto toy_first = View(new_term.toy_first);                                                        \
    [[maybe_unused]] auto toy_set_1_column_1 = View(new_term.toy_set_1_column_1);                                      \
    [[maybe_unused]] auto toy_set_1_column_2 = View(new_term.toy_set_1_column_2);                                      \
    [[maybe_unused]] auto toy_set_2_column_1 = View(new_term.toy_set_2_column_1);                                      \
    [[maybe_unused]] auto toy_set_2_column_2 = View(new_term.toy_set_2_column_2);                                      \
    [[maybe_unused]] auto toy_x = View(new_term.toy_x);                                                                \
    [[maybe_unused]] auto two_column_perm = View(new_term.two_column_perm);                                            \
    [[maybe_unused]] auto toy_x_shift = View(new_term.toy_x_shift);
