use crate::interest_math::compute_multiplier;
use dep::aztec::hash::pedersen_hash;

// Utility used to easily get a "id" for a private user that sits in the same
// "space" as the public users.
// It help us to have a single mapping for collateral that have both public and private users.
pub fn compute_identifier(secret: Field, on_behalf_of: Field, self: Field) -> Field {
    // EITHER secret OR on_behalf_of MUST be set. But not both
    assert(!((secret == 0) as bool & (on_behalf_of == 0) as bool));
    if (secret != 0) {
        pedersen_hash([self, secret], 0)
    } else {
        on_behalf_of
    }
}

pub fn covered_by_collateral(
    price: U128,
    loan_to_value: U128,
    collateral: U128,
    increase: U128,
    decrease: U128
) -> U128 {
    let price_precision = U128::from_integer(1000000000);
    let ltv_precision = U128::from_integer(10000);

    let collateral = (collateral + increase) - decrease;

    let collateral_value = (collateral* price) / price_precision;
    let debt_covered = (collateral_value * loan_to_value) / ltv_precision;

    debt_covered
}

struct DebtReturn {
    debt_value: U128,
    static_debt: U128,
}

pub fn debt_updates(
    interest_accumulator: U128,
    static_debt: U128,
    increase: U128,
    decrease: U128
) -> DebtReturn {
    assert(interest_accumulator > U128::from_integer(0));
    let accumulator_precision = U128::from_integer(1000000000);

    let current_debt_value = (static_debt * interest_accumulator) / accumulator_precision;
    let new_debt_value = current_debt_value.add(increase).sub(decrease);

    // static_debt_increase = amount / accumulator
    // rounding up new debt.
    let static_debt_increase = increase.mul_div_up(accumulator_precision, interest_accumulator);
    // rounding down repayment.
    let static_debt_decrease = decrease.mul_div(accumulator_precision, interest_accumulator);

    // We need to allow repaying of the entire debt as well etc. This is very prone to failing
    // if you try to repay exact due to time diff between sim and execution.
    let new_static_debt = static_debt.add(static_debt_increase).sub(static_debt_decrease);

    DebtReturn { debt_value: new_debt_value.value, static_debt: new_static_debt.value }
}

pub fn debt_value(static_debt: u120, interest_accumulator: u120) -> u120 {
    let static_debt = SafeU120 { value: static_debt };
    let accumulator_precision = SafeU120 { value: 1000000000 };
    let interest_accumulator = SafeU120 { value: interest_accumulator };
    static_debt.mul_div_up(interest_accumulator, accumulator_precision).value
}
