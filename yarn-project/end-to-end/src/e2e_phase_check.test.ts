import { AztecAddress } from '@aztec/aztec.js/addresses';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { SponsoredFPCNoEndSetupContract } from '@aztec/noir-test-contracts.js/SponsoredFPCNoEndSetup';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import type { TestWallet } from '@aztec/test-wallet/server';
import { defaultInitialAccountFeeJuice } from '@aztec/world-state/testing';

import { setup } from './fixtures/utils.js';

// Private functions should receive automatically a phase check that avoids any nested call changing the phase.
// Functions that opt out of this phase check can be marked with #[nophasecheck].
describe('Phase check', () => {
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
    } = await setup(1, { genesisPublicData: [genesisBalanceEntry] }));

    contract = await TestContract.deploy(wallet).send({ from: defaultAccountAddress }).deployed();
    sponsoredFPC = await SponsoredFPCNoEndSetupContract.deploy(wallet).register({
      contractAddressSalt: new Fr(SPONSORED_FPC_SALT),
    });

    // If the below fails, the registration parameters are different than the instance generation parameters that we used for funding the address.
    expect(sponsorInstance.address).toEqual(sponsoredFPC.address);
  });

  afterAll(() => teardown());

  async function setupBalanceOfSponsor(sponsorAddress: AztecAddress) {
    const balanceLeafSlot = await computeFeePayerBalanceLeafSlot(sponsorAddress);
    return new PublicDataTreeLeaf(balanceLeafSlot, defaultInitialAccountFeeJuice);
  }

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

  it('should not fail when a nested call changes the phase if #[nophasecheck] is used', async () => {
    await contract.methods.call_function_that_ends_setup_without_phase_check().simulate({
      from: defaultAccountAddress,
      fee: {
        paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPC.address),
      },
    });
  });
});
