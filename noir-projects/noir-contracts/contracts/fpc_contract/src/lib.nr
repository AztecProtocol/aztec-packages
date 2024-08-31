use dep::aztec::context::PublicContext;

pub fn compute_rebate(context: PublicContext, initial_amount: u64) -> u64 {
    let actual_fee = context.transaction_fee();
    assert(initial_amount >= actual_fee, "Initial amount paid to the paymaster does not cover actual fee");
    initial_amount - actual_fee
}
