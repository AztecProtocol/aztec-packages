use dep::aztec::hash::pedersen_hash;
use std::ops::{Add, Sub};

// Utility used to easily get a "id" for a private user that sits in the same
// "space" as the public users.
// It help us to have a single mapping for collateral that have both public and private users.
pub fn compute_identifier(secret: Field, on_behalf_of: Field, this: Field) -> Field {
    // EITHER secret OR on_behalf_of MUST be set. But not both
    assert(!((secret == 0) as bool & (on_behalf_of == 0) as bool));
    if (secret != 0) {
        pedersen_hash([this, secret], 0)
    } else {
        on_behalf_of
    }
}

pub fn covered_by_collateral(
    price: u128,
    loan_to_value: u128,
    collateral: u128,
    increase: u128,
    decrease: u128,
) -> u128 {
    let price_precision = 1000000000 as u128;
    let ltv_precision = 10000 as u128;

    let collateral = (collateral + increase) - decrease;

    let collateral_value = (collateral * price) / price_precision;
    let debt_covered = (collateral_value * loan_to_value) / ltv_precision;

    debt_covered
}

pub struct DebtReturn {
    debt_value: u128,
    static_debt: u128,
}

fn div_up(a: u128, b: u128) -> u128 {
    let div = a / b;
    if div * b < a {
        div + (1 as u128)
    } else {
        div
    }
}

pub fn debt_updates(
    interest_accumulator: u128,
    static_debt: u128,
    increase: u128,
    decrease: u128,
) -> DebtReturn {
    assert(interest_accumulator > (0 as u128));
    let accumulator_precision = 1000000000 as u128;

    let current_debt_value = (static_debt * interest_accumulator) / accumulator_precision;
    let new_debt_value = current_debt_value.add(increase).sub(decrease);

    // static_debt_increase = amount / accumulator
    // rounding up new debt.
    let static_debt_increase = div_up(increase * accumulator_precision, interest_accumulator);
    // rounding down repayment.
    let static_debt_decrease = (decrease * accumulator_precision) / interest_accumulator;

    // We need to allow repaying of the entire debt as well etc. This is very prone to failing
    // if you try to repay exact due to time diff between sim and execution.
    let new_static_debt = static_debt.add(static_debt_increase).sub(static_debt_decrease);

    DebtReturn { debt_value: new_debt_value, static_debt: new_static_debt }
}

pub fn debt_value(static_debt: u128, interest_accumulator: u128) -> u128 {
    let accumulator_precision = 1000000000 as u128;
    div_up(static_debt * interest_accumulator, accumulator_precision)
}
