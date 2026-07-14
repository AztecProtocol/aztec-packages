#include "vm2_contracts/token_fixture.hpp"

#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/noir_abi.hpp"

namespace bb::avm2::contracts {

namespace {

using testing::DeployedContract;
using testing::TestEnqueuedCall;

// Static balance_of_public read; asserts the returned balance unless return-value assertions are
// skipped (the benchmark disables call-metadata collection, so no return value is available).
void check_balance(AppTester& tester,
                   const ContractArtifact& token,
                   const AztecAddress& token_address,
                   const AztecAddress& sender,
                   const AztecAddress& account,
                   uint64_t expected_balance,
                   const ExpectFn& expect,
                   bool skip_return_value_assertions)
{
    const TxSimulationResult result = tester.simulate_tx_with_label(
        "Token/balance_of_public",
        sender,
        { TestEnqueuedCall{ .contract_address = token_address,
                            .calldata = token.make_calldata("balance_of_public", { AbiValue(account) }),
                            .is_static_call = true } });
    expect(is_ok(result));
    if (!skip_return_value_assertions) {
        expect(result.call_stack_metadata.size() == 1);
        expect(result.call_stack_metadata.at(0).output.size() == 1);
        expect(result.call_stack_metadata.at(0).output.at(0) == FF(expected_balance));
    }
}

} // namespace

DeployedContract set_up_token(
    AppTester& tester, const ContractArtifact& token, const AztecAddress& admin, const ExpectFn& expect, uint64_t seed)
{
    const std::vector<AbiValue> constructor_args = {
        AbiValue(admin), AbiValue::string("Token"), AbiValue::string("TOK"), AbiValue::integer(18)
    };
    const DeployedContract token_contract = tester.deploy_with_constructor(token, constructor_args, admin, seed);
    expect(is_ok(
        tester.execute_tx_with_label("Token/constructor",
                                     admin,
                                     { make_call(token_contract.address, token, "constructor", constructor_args) },
                                     /*commit=*/true)));
    return token_contract;
}

void token_test(AppTester& tester,
                const ContractArtifact& token,
                const ExpectFn& expect,
                bool skip_return_value_assertions)
{
    const AztecAddress admin = 42;
    const AztecAddress sender = 111;
    const AztecAddress receiver = 222;

    const DeployedContract token_contract = set_up_token(tester, token, admin, expect);

    const uint64_t mint_amount = 100;
    expect(is_ok(tester.execute_tx_with_label(
        "Token/mint_to_public",
        admin,
        { make_call(
            token_contract.address, token, "mint_to_public", { AbiValue(sender), AbiValue::integer(mint_amount) }) },
        /*commit=*/true)));
    check_balance(
        tester, token, token_contract.address, sender, sender, mint_amount, expect, skip_return_value_assertions);

    const uint64_t transfer_amount = 50;
    const FF authwit_nonce = 0;
    expect(is_ok(tester.execute_tx_with_label(
        "Token/transfer_in_public",
        sender,
        { make_call(
            token_contract.address,
            token,
            "transfer_in_public",
            { AbiValue(sender), AbiValue(receiver), AbiValue::integer(transfer_amount), AbiValue(authwit_nonce) }) },
        /*commit=*/true)));
    check_balance(tester,
                  token,
                  token_contract.address,
                  sender,
                  sender,
                  mint_amount - transfer_amount,
                  expect,
                  skip_return_value_assertions);
    check_balance(
        tester, token, token_contract.address, sender, receiver, transfer_amount, expect, skip_return_value_assertions);

    expect(is_ok(tester.execute_tx_with_label(
        "Token/burn_public",
        receiver,
        { make_call(token_contract.address,
                    token,
                    "burn_public",
                    { AbiValue(receiver), AbiValue::integer(transfer_amount), AbiValue(authwit_nonce) }) },
        /*commit=*/true)));
    check_balance(tester, token, token_contract.address, sender, receiver, 0, expect, skip_return_value_assertions);
}

} // namespace bb::avm2::contracts
