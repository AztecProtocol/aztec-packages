import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { Fr, type Logger, sleep } from '@aztec/aztec.js';
import { Fq } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import type { Hex } from 'viem';

import { FeesTest } from './fees_test.js';

jest.setTimeout(300_000);

// Regression for https://github.com/AztecProtocol/aztec-packages/issues/12366
// Similar to e2e_fees/account_init but with no automine
describe('e2e_fees bridging_race', () => {
  const ETHEREUM_SLOT_DURATION = 4;
  const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * 2;

  const t = new FeesTest('bridging_race', 1, {
    ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
    aztecSlotDuration: AZTEC_SLOT_DURATION,
    minTxsPerBlock: 0,
  });

  beforeAll(async () => {
    await t.applyInitialAccountsSnapshot();
    await t.applyPublicDeployAccountsSnapshot();
    await t.applySetupFeeJuiceSnapshot();

    ({ wallet, logger } = await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  let logger: Logger;
  let bobsAddress: AztecAddress;
  let wallet: TestWallet;

  beforeEach(async () => {
    const bobsSecretKey = Fr.random();
    const bobsPrivateSigningKey = Fq.random();
    const bobsSalt = Fr.random();
    const bobsAccountManager = await wallet.createAccount({
      secret: bobsSecretKey,
      salt: bobsSalt,
      contract: new SchnorrAccountContract(bobsPrivateSigningKey),
    });
    bobsAddress = bobsAccountManager.address;
  });

  it('Alice bridges funds to Bob', async () => {
    // Tweak the token manager so the bridging happens immediately before the end of the current L2 slot
    // This caused the message to be "not in state" when tried to be used
    const l1TokenManager = t.feeJuiceBridgeTestHarness.l1TokenManager;
    const origApprove = l1TokenManager.approve.bind(l1TokenManager);
    l1TokenManager.approve = async (amount: bigint, address: Hex, addressName = '') => {
      await origApprove(amount, address, addressName);
      const sleepTime = (Number(t.chainMonitor.l2BlockTimestamp) + AZTEC_SLOT_DURATION) * 1000 - Date.now() - 500;
      logger.info(`Sleeping for ${sleepTime}ms until near end of L2 slot before sending L1 fee juice to L2 inbox`);
      await sleep(sleepTime);
    };

    // Waiting for the archiver to sync the message _before_ waiting for the mandatory 2 L2 blocks to pass fixed it
    // This was added everywhere we wait for two blocks, which is spread across three different places in the codebase
    // Yes, we need to REFACTOR it at some point
    const claim = await t.feeJuiceBridgeTestHarness.prepareTokensOnL1(bobsAddress);
    const { claimSecret: secret, messageLeafIndex: index } = claim;
    await t.feeJuiceContract.methods
      .claim(bobsAddress, claim.claimAmount, secret, index)
      .send({ from: bobsAddress })
      .wait();
    const [balance] = await t.getGasBalanceFn(bobsAddress);
    expect(balance).toEqual(claim.claimAmount);
  });
});
