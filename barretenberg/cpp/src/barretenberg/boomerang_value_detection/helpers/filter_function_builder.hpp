#pragma once

#include <algorithm>
#include <cstdint>
#include <functional>
#include <iterator>
#include <optional>
#include <vector>

namespace cdg {
template <typename CircuitBuilder, typename FF> class FilterFunctionBuilder {
  public:
    FilterFunctionBuilder(CircuitBuilder& builder);

    FilterFunctionBuilder& set_w_l(uint32_t w_l);
    FilterFunctionBuilder& set_w_r(uint32_t w_r);
    FilterFunctionBuilder& set_w_o(uint32_t w_o);
    FilterFunctionBuilder& set_w_4(uint32_t w_4);
    FilterFunctionBuilder& set_q_m(FF q_m);
    FilterFunctionBuilder& set_q_1(FF q_1);
    FilterFunctionBuilder& set_q_2(FF q_2);
    FilterFunctionBuilder& set_q_3(FF q_3);
    FilterFunctionBuilder& set_q_c(FF q_c);
    FilterFunctionBuilder& set_q_4(FF q_4);
    FilterFunctionBuilder& set_q_arith(FF q_arith);

    std::function<bool(size_t, size_t)> build() const;
    std::vector<std::pair<size_t, size_t>> filter_gates(std::vector<std::pair<size_t, size_t>>& gates) const;

  private:
    CircuitBuilder& builder;
    std::optional<uint32_t> w_l = std::nullopt;
    std::optional<uint32_t> w_r = std::nullopt;
    std::optional<uint32_t> w_o = std::nullopt;
    std::optional<uint32_t> w_4 = std::nullopt;
    std::optional<FF> q_m = std::nullopt;
    std::optional<FF> q_1 = std::nullopt;
    std::optional<FF> q_2 = std::nullopt;
    std::optional<FF> q_3 = std::nullopt;
    std::optional<FF> q_c = std::nullopt;
    std::optional<FF> q_4 = std::nullopt;
    std::optional<FF> q_arith = std::nullopt;
};

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>::FilterFunctionBuilder(CircuitBuilder& builder)
    : builder(builder)
{}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_w_l(uint32_t w_l)
{
    this->w_l = w_l;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_w_r(uint32_t w_r)
{
    this->w_r = w_r;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_w_o(uint32_t w_o)
{
    this->w_o = w_o;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_w_4(uint32_t w_4)
{
    this->w_4 = w_4;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_q_m(FF q_m)
{
    this->q_m = q_m;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_q_1(FF q_1)
{
    this->q_1 = q_1;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_q_2(FF q_2)
{
    this->q_2 = q_2;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_q_3(FF q_3)
{
    this->q_3 = q_3;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_q_c(FF q_c)
{
    this->q_c = q_c;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_q_4(FF q_4)
{
    this->q_4 = q_4;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline FilterFunctionBuilder<CircuitBuilder, FF>& FilterFunctionBuilder<CircuitBuilder, FF>::set_q_arith(FF q_arith)
{
    this->q_arith = q_arith;
    return *this;
}

template <typename CircuitBuilder, typename FF>
inline std::function<bool(size_t, size_t)> FilterFunctionBuilder<CircuitBuilder, FF>::build() const
{
    return [this](size_t block_idx, size_t gate_idx) {
        auto& block = this->builder.blocks.get()[block_idx];
        bool condition = true;
        if (w_l.has_value()) {
            condition &= block.w_l()[gate_idx] == this->w_l.value();
        }
        if (w_r.has_value()) {
            condition &= block.w_r()[gate_idx] == this->w_r.value();
        }
        if (w_o.has_value()) {
            condition &= block.w_o()[gate_idx] == this->w_o.value();
        }
        if (w_4.has_value()) {
            condition &= block.w_4()[gate_idx] == this->w_4.value();
        }
        if (q_m.has_value()) {
            condition &= block.q_m()[gate_idx] == this->q_m.value();
        }
        if (q_1.has_value()) {
            condition &= block.q_1()[gate_idx] == this->q_1.value();
        }
        if (q_2.has_value()) {
            condition &= block.q_2()[gate_idx] == this->q_2.value();
        }
        if (q_3.has_value()) {
            condition &= block.q_3()[gate_idx] == this->q_3.value();
        }
        if (q_c.has_value()) {
            condition &= block.q_c()[gate_idx] == this->q_c.value();
        }
        if (q_4.has_value()) {
            condition &= block.q_4()[gate_idx] == this->q_4.value();
        }
        if (q_arith.has_value()) {
            condition &= block.q_arith()[gate_idx] == this->q_arith.value();
        }
        return condition;
    };
}

template <typename CircuitBuilder, typename FF>
inline std::vector<std::pair<size_t, size_t>> FilterFunctionBuilder<CircuitBuilder, FF>::filter_gates(
    std::vector<std::pair<size_t, size_t>>& gates) const
{
    auto res_function = build();
    std::vector<std::pair<size_t, size_t>> filtered_gates;
    std::copy_if(gates.begin(), gates.end(), std::back_inserter(filtered_gates), [&res_function](const auto& gate) {
        return res_function(gate.first, gate.second);
    });
    return filtered_gates;
}
} // namespace cdg
