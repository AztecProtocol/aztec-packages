#include "vm2_contracts/amm_fixture.hpp"

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/noir_abi.hpp"
#include "vm2_contracts/token_fixture.hpp"

namespace bb::avm2::contracts {

namespace {

using testing::DeployedContract;
using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

constexpr uint64_t INITIAL_TOKEN_BALANCE = 1'000'000'000;

// poseidon2HashWithSeparator([commitment, completer], DomainSeparator.PARTIAL_NOTE_VALIDITY_COMMITMENT).
FF partial_note_validity_commitment(const FF& commitment, const AztecAddress& completer)
{
    return Poseidon2::hash({ FF(623934423ULL), commitment, completer });
}

// The AMM config struct {token0, token1, liquidity_token}.
AbiValue amm_config(const DeployedContract& token0, const DeployedContract& token1, const DeployedContract& lt)
{
    return AbiValue::array({ AbiValue(token0.address), AbiValue(token1.address), AbiValue(lt.address) });
}

} // namespace

void amm_test(AppTester& tester,
              const ContractArtifact& token,
              const ContractArtifact& amm_artifact,
              const ExpectFn& expect)
{
    const AztecAddress admin = 42;
    const AztecAddress sender = 111;

    const DeployedContract token0 = set_up_token(tester, token, admin, expect, /*seed=*/0);
    const DeployedContract token1 = set_up_token(tester, token, admin, expect, /*seed=*/1);
    const DeployedContract liquidity_token = set_up_token(tester, token, admin, expect, /*seed=*/2);

    const std::vector<AbiValue> amm_constructor_args = { AbiValue(token0.address),
                                                         AbiValue(token1.address),
                                                         AbiValue(liquidity_token.address) };
    const DeployedContract amm = tester.deploy_with_constructor(amm_artifact, amm_constructor_args, admin, /*seed=*/3);
    expect(is_ok(
        tester.execute_tx_with_label("AMM/constructor",
                                     admin,
                                     { make_call(amm.address, amm_artifact, "constructor", amm_constructor_args) },
                                     /*commit=*/true)));

    expect(is_ok(tester.execute_tx_with_label(
        "AMM/set_minter",
        admin,
        { make_call(liquidity_token.address, token, "set_minter", { AbiValue(amm.address), AbiValue::boolean(true) }) },
        /*commit=*/true)));

    const uint64_t amount0_max = (INITIAL_TOKEN_BALANCE * 6) / 10;
    const uint64_t amount0_min = (INITIAL_TOKEN_BALANCE * 4) / 10;
    const uint64_t amount1_max = (INITIAL_TOKEN_BALANCE * 5) / 10;
    const uint64_t amount1_min = (INITIAL_TOKEN_BALANCE * 4) / 10;

    // --- add liquidity ---
    tester.inner().insert_nullifier(token0.address, partial_note_validity_commitment(FF(42), amm.address));
    tester.inner().insert_nullifier(token1.address, partial_note_validity_commitment(FF(66), amm.address));
    tester.inner().insert_nullifier(liquidity_token.address, partial_note_validity_commitment(FF(99), amm.address));
    expect(is_ok(tester.execute_tx_with_label("AMM/add_liquidity",
                                              sender,
                                              {
                                                  make_call(token0.address,
                                                            token,
                                                            "_increase_public_balance",
                                                            { AbiValue(amm.address), AbiValue::integer(amount0_max) },
                                                            /*msg_sender=*/token0.address),
                                                  make_call(token1.address,
                                                            token,
                                                            "_increase_public_balance",
                                                            { AbiValue(amm.address), AbiValue::integer(amount1_max) },
                                                            /*msg_sender=*/token1.address),
                                                  make_call(amm.address,
                                                            amm_artifact,
                                                            "_add_liquidity",
                                                            { amm_config(token0, token1, liquidity_token),
                                                              AbiValue(FF(42)),
                                                              AbiValue(FF(66)),
                                                              AbiValue(FF(99)),
                                                              AbiValue::integer(amount0_max),
                                                              AbiValue::integer(amount1_max),
                                                              AbiValue::integer(amount0_min),
                                                              AbiValue::integer(amount1_min) },
                                                            /*msg_sender=*/amm.address),
                                              },
                                              /*commit=*/true)));

    // --- swap exact tokens for tokens ---
    const uint64_t amount_in = amount0_min / 10;
    const uint64_t amount_out_min = amount1_min / 100;
    tester.inner().insert_nullifier(token1.address, partial_note_validity_commitment(FF(166), amm.address));
    expect(is_ok(tester.execute_tx_with_label("AMM/swap_exact_tokens_for_tokens",
                                              sender,
                                              {
                                                  make_call(token0.address,
                                                            token,
                                                            "_increase_public_balance",
                                                            { AbiValue(amm.address), AbiValue::integer(amount_in) },
                                                            /*msg_sender=*/token0.address),
                                                  make_call(amm.address,
                                                            amm_artifact,
                                                            "_swap_exact_tokens_for_tokens",
                                                            { AbiValue(token0.address),
                                                              AbiValue(token1.address),
                                                              AbiValue::integer(amount_in),
                                                              AbiValue::integer(amount_out_min),
                                                              AbiValue(FF(166)) },
                                                            /*msg_sender=*/amm.address),
                                              },
                                              /*commit=*/true)));

    // --- remove liquidity ---
    const uint64_t liquidity = 100;
    tester.inner().insert_nullifier(token0.address, partial_note_validity_commitment(FF(111), amm.address));
    tester.inner().insert_nullifier(token1.address, partial_note_validity_commitment(FF(222), amm.address));
    expect(is_ok(tester.execute_tx_with_label("AMM/remove_liquidity",
                                              sender,
                                              {
                                                  make_call(liquidity_token.address,
                                                            token,
                                                            "_increase_public_balance",
                                                            { AbiValue(amm.address), AbiValue::integer(liquidity) },
                                                            /*msg_sender=*/liquidity_token.address),
                                                  make_call(amm.address,
                                                            amm_artifact,
                                                            "_remove_liquidity",
                                                            { amm_config(token0, token1, liquidity_token),
                                                              AbiValue::integer(liquidity),
                                                              AbiValue(FF(111)),
                                                              AbiValue(FF(222)),
                                                              AbiValue::integer(/*amount0_min=*/1),
                                                              AbiValue::integer(/*amount1_min=*/1) },
                                                            /*msg_sender=*/amm.address),
                                              },
                                              /*commit=*/true)));
}

} // namespace bb::avm2::contracts
