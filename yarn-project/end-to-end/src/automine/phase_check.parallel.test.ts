import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { SponsoredFPCNoEndSetupContract } from '@aztec/noir-test-contracts.js/SponsoredFPCNoEndSetup';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { ExecutionPayload } from '@aztec/stdlib/tx';
import { defaultInitialAccountFeeJuice } from '@aztec/world-state/testing';

import type { TestWallet } from '../test-wallet/test_wallet.js';
import { AutomineTestContext } from './automine_test_context.js';

/**
 * Declares a contract as the tx fee payer without contributing any call to the fee payload, unlike
 * SponsoredFeePaymentMethod which prepends the sponsor call (and thus makes the election run before any app call).
 * This lets a test place the electing call anywhere in the app payload, e.g. after the setup phase has ended.
 */
class DeferredSponsoredFeePaymentMethod extends SponsoredFeePaymentMethod {
  override async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload([], [], [], [], await this.getFeePayer());
  }
}

// Private functions should receive automatically a phase check that avoids any nested call changing the phase.
// Functions that opt out of this phase check can be marked with #[allow_phase_change].
//
// Uses a single node with AutomineSequencer. The setup pre-funds a custom SponsoredFPC via genesisPublicData
// so that fee payment can be crafted without ending the setup phase, which is needed to trigger the phase-change error.
describe('automine/phase_check', () => {
  let wallet: TestWallet;
  let defaultAccountAddress: AztecAddress;
  let teardown: () => Promise<void>;

  let contract: TestContract;
  let sponsoredFPC: SponsoredFPCNoEndSetupContract;

  beforeAll(async () => {
    // All the dance here with the sponsored FPC is to be able to craft a tx that doesn't end setup when paying fees.
    const sponsorInstance = await getContractInstanceFromInstantiationParams(SponsoredFPCNoEndSetupContract.artifact, {
      salt: new Fr(SPONSORED_FPC_SALT),
    });
    const genesisBalanceEntry = await setupBalanceOfSponsor(sponsorInstance.address);

    ({
      teardown,
      wallet,
      accounts: [defaultAccountAddress],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 1, genesisPublicData: [genesisBalanceEntry] })).context);

    ({ contract } = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }));
    sponsoredFPC = await SponsoredFPCNoEndSetupContract.deploy(wallet, {
      salt: new Fr(SPONSORED_FPC_SALT),
      universalDeploy: true,
    }).register();

    // If the below fails, the registration parameters are different than the instance generation parameters that we used for funding the address.
    expect(sponsorInstance.address).toEqual(sponsoredFPC.address);
  });

  afterAll(() => teardown());

  async function setupBalanceOfSponsor(sponsorAddress: AztecAddress) {
    const balanceLeafSlot = await computeFeePayerBalanceLeafSlot(sponsorAddress);
    return new PublicDataTreeLeaf(balanceLeafSlot, defaultInitialAccountFeeJuice);
  }

  // Simulates a tx that calls a function which internally invokes a nested call that ends the setup phase,
  // triggering the automatic phase-check guard; asserts the simulation throws with the expected message.
  it('should fail when a nested call changes the phase', async () => {
    await expect(
      contract.methods.call_function_that_ends_setup().simulate({
        from: defaultAccountAddress,
        fee: {
          paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address),
        },
      }),
    ).rejects.toThrow('Phase change detected on function with phase check.');
  });

  // Same scenario but the function is annotated with #[allow_phase_change]; asserts the simulation
  // succeeds without throwing.
  it('should not fail when a nested call changes the phase if the allow_phase_change attribute is used', async () => {
    await contract.methods.call_function_that_ends_setup_without_phase_check().simulate({
      from: defaultAccountAddress,
      fee: {
        paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address),
      },
    });
  });

  it('should fail when the fee payer is elected after the setup phase has ended', async () => {
    await expect(
      new BatchCall(wallet, [
        contract.methods.call_function_that_ends_setup_without_phase_check(),
        sponsoredFPC.methods.sponsor_unconditionally(),
      ]).simulate({
        from: defaultAccountAddress,
        fee: {
          paymentMethod: new DeferredSponsoredFeePaymentMethod(sponsoredFPC.address),
        },
      }),
    ).rejects.toThrow('fee payer must be elected during the setup phase');
  });
});
