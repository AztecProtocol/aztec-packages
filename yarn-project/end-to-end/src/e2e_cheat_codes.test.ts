import { EthAddress } from '@aztec/aztec.js/addresses';
import { EthCheatCodes } from '@aztec/aztec/testing';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import type { Anvil } from '@aztec/ethereum/test';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { DateProvider } from '@aztec/foundation/timer';
import { getErrorCause } from '@aztec/foundation/types';

import { RpcRequestError, parseEther } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { MNEMONIC } from './fixtures/fixtures.js';
import { getLogger, startAnvil } from './fixtures/utils.js';

// Tests the EthCheatCodes API directly against a standalone anvil instance (no Aztec node).
// Does NOT use setup(); starts anvil directly via startAnvil(). Single-file, no L2 stack.
describe('e2e_cheat_codes', () => {
  // Tests L1 anvil cheat-code primitives: mine, timestamp manipulation, storage load/store,
  // bytecode patching, and account impersonation. Each test gets a fresh anvil.
  describe('L1 cheatcodes', () => {
    let ethCheatCodes: EthCheatCodes;

    let l1Client: ExtendedViemWalletClient;

    let anvil: Anvil;

    beforeEach(async () => {
      const res = await startAnvil();
      anvil = res.anvil;
      ethCheatCodes = new EthCheatCodes([res.rpcUrl], new DateProvider());
      const account = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
      l1Client = createExtendedL1Client([res.rpcUrl], account, foundry);
    });

    afterEach(async () => await anvil?.stop().catch(err => getLogger().error(err)));

    // Tests that ethCheatCodes.mine() and mine(n) advance the L1 block number by 1 and n respectively.
    describe('mine', () => {
      // Calls mine() and asserts block number advances by exactly 1.
      it(`mine block`, async () => {
        const blockNumber = await ethCheatCodes.blockNumber();
        await ethCheatCodes.mine();
        expect(await ethCheatCodes.blockNumber()).toBe(blockNumber + 1);
      });

      // Calls mine(n) for n in [10, 42, 99] and asserts block number advances by n.
      it.each([10, 42, 99])(`mine %i blocks`, async increment => {
        const blockNumber = await ethCheatCodes.blockNumber();
        await ethCheatCodes.mine(increment);
        expect(await ethCheatCodes.blockNumber()).toBe(blockNumber + increment);
      });
    });

    // Sets next block timestamp forward by increment, mines, and asserts the new timestamp matches.
    it.each([100, 42, 99])(`setNextBlockTimestamp by %i`, async increment => {
      const blockNumber = await ethCheatCodes.blockNumber();
      const timestamp = await ethCheatCodes.lastBlockTimestamp();
      await ethCheatCodes.setNextBlockTimestamp(timestamp + increment);

      expect(await ethCheatCodes.lastBlockTimestamp()).toBe(timestamp);

      await ethCheatCodes.mine();

      expect(await ethCheatCodes.blockNumber()).toBe(blockNumber + 1);
      expect(await ethCheatCodes.lastBlockTimestamp()).toBe(timestamp + increment);
    });

    // Attempts to set a timestamp in the past and expects a "Timestamp error" rejection.
    it('setNextBlockTimestamp to a past timestamp throws', async () => {
      const timestamp = await ethCheatCodes.lastBlockTimestamp();
      const pastTimestamp = timestamp - 1000;
      await expect(async () => await ethCheatCodes.setNextBlockTimestamp(pastTimestamp)).rejects.toThrow(
        'Timestamp error',
      );
    });

    // Loads storage slot 0 from the zero address and confirms it is 0.
    it('load a value at a particular storage slot', async () => {
      // check that storage slot 0 is empty as expected
      const res = await ethCheatCodes.load(EthAddress.ZERO, 0n);
      expect(res).toBe(0n);
    });

    // Stores a value at a given slot and at its keccak256 map-derived slot, then loads and verifies.
    it.each(['1', 'bc40fbf4394cd00f78fae9763b0c2c71b21ea442c42fdadc5b720537240ebac1'])(
      'store a value at a given slot and its keccak value of the slot (if it were in a map) ',
      async storageSlotInHex => {
        const storageSlot = BigInt('0x' + storageSlotInHex);
        const valueToSet = 5n;
        const contractAddress = EthAddress.fromString('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
        await ethCheatCodes.store(contractAddress, storageSlot, valueToSet);
        expect(await ethCheatCodes.load(contractAddress, storageSlot)).toBe(valueToSet);
        // also test with the keccak value of the slot - can be used to compute storage slots of maps
        await ethCheatCodes.store(contractAddress, ethCheatCodes.keccak256(0n, storageSlot), valueToSet);
        expect(await ethCheatCodes.load(contractAddress, ethCheatCodes.keccak256(0n, storageSlot))).toBe(valueToSet);
      },
    );

    // Patches an account's bytecode with etch() and reads it back to confirm.
    it('set bytecode correctly', async () => {
      const contractAddress = EthAddress.fromString('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      await ethCheatCodes.etch(contractAddress, '0x1234');
      expect(await ethCheatCodes.getBytecode(contractAddress)).toBe('0x1234');
    });

    // Funds a random address, impersonates it to send ETH, stops impersonation, then confirms
    // sending from the address again fails with "No Signer available".
    it('impersonate', async () => {
      // we will transfer 1 eth to a random address. Then impersonate the address to be able to send funds
      // without impersonation we wouldn't be able to send funds.
      const myAddress = (await l1Client.getAddresses())[0];
      const randomAddress = EthAddress.random().toString();
      const tx1Hash = await l1Client.sendTransaction({
        account: myAddress,
        to: randomAddress,
        value: parseEther('1'),
      });
      await l1Client.waitForTransactionReceipt({ hash: tx1Hash });
      const beforeBalance = await l1Client.getBalance({ address: randomAddress });

      // impersonate random address
      await ethCheatCodes.startImpersonating(EthAddress.fromString(randomAddress));
      // send funds from random address
      const amountToSend = parseEther('0.1');
      const tx2Hash = await l1Client.sendTransaction({
        account: randomAddress,
        to: myAddress,
        value: amountToSend,
      });
      const txReceipt = await l1Client.waitForTransactionReceipt({ hash: tx2Hash });
      const feePaid = txReceipt.gasUsed * txReceipt.effectiveGasPrice;
      expect(await l1Client.getBalance({ address: randomAddress })).toBe(beforeBalance - amountToSend - feePaid);

      // stop impersonating
      await ethCheatCodes.stopImpersonating(EthAddress.fromString(randomAddress));

      // making calls from random address should not be successful
      try {
        await l1Client.sendTransaction({
          account: randomAddress,
          to: myAddress,
          value: 0n,
        });
        // done with a try-catch because viem errors are noisy and we need to check just a small portion of the error.
        fail('should not be able to send funds from random address');
      } catch (e: unknown) {
        expect(getErrorCause(e, RpcRequestError)?.details).toContain('No Signer available');
      }
    });
  });
});
