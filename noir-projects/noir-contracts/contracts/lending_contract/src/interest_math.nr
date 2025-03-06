use std::ops::{Add, Div, Mul, Sub};

// Binomial approximation of exponential
// using lower than desired precisions for everything due to u128 limit
// (1+x)^n = 1+n*x+[n/2*(n-1)]*x^2+[n/6*(n-1)*(n-2)*x^3]...
// we are losing around almost 8 digits of precision from yearly -> daily interest
// dividing with 31536000 (seconds per year).
// rate must be measured with higher precision than 10^9.
// we use e18, and rates >= 4% yearly. Otherwise need more precision
pub fn compute_multiplier(rate_per_second: u128, dt: u64) -> u128 {
    let base = 1000000000 as u128; // 1e9
    let WAD = 1000000000000000000 as u128; // 1e18
    let diff = WAD.div(base);
    let mut res = base;
    if dt != 0 {
        let exp_minus_one = (dt - 1) as u128;
        let exp_minus_two = (if (dt > 2) { dt - 2 } else { 0 }) as u128;
        let dt = dt as u128;

        // if rate_per_second < sqrt(WAD), then base_power_two and base_power_three = 0
        let rate = rate_per_second;
        let base_power_two = (rate * rate) / WAD;
        let base_power_three = (base_power_two * rate) / WAD;

        let temp = dt.mul(exp_minus_one);
        let second_term = temp.mul(base_power_two).div(2 as u128);
        let third_term = temp.mul(exp_minus_two).mul(base_power_three).div(6 as u128);

        // throwing away precision to keep us under u128 :sob:
        let offset = dt.mul(rate).add(second_term).add(third_term).div(diff);

        res = base.add(offset);
    }
    res
}
