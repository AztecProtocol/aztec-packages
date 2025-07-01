import { type AztecAddress, EthAddress, Fr, type Wallet } from '@aztec/aztec.js';
import { AnvilTestWatcher, CheatCodes } from '@aztec/aztec.js/testing';
import { EthCheatCodes, type ExtendedViemWalletClient, createExtendedL1Client } from '@aztec/ethereum';
import { RollupContract } from '@aztec/ethereum/contracts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import type { Anvil } from '@viem/anvil';
import { parseEther } from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { MNEMONIC } from './fixtures/fixtures.js';
import { mintTokensToPrivate } from './fixtures/token_utils.js';
import { getLogger, setup, startAnvil } from './fixtures/utils.js';

describe('e2e_cheat_codes', () => {
  describe('L1 cheatcodes', () => {
    let ethCheatCodes: EthCheatCodes;

    let l1Client: ExtendedViemWalletClient;

    let anvil: Anvil;

    beforeEach(async () => {
      const res = await startAnvil();
      anvil = res.anvil;
      ethCheatCodes = new EthCheatCodes([res.rpcUrl]);
      const account = mnemonicToAccount(MNEMONIC, { addressIndex: 0 });
      l1Client = createExtendedL1Client([res.rpcUrl], account, foundry);
    });

    afterEach(async () => await anvil?.stop().catch(err => getLogger().error(err)));

    describe('mine', () => {
      it(`mine block`, async () => {
        const blockNumber = await ethCheatCodes.blockNumber();
        await ethCheatCodes.mine();
        expect(await ethCheatCodes.blockNumber()).toBe(blockNumber + 1);
      });

      it.each([10, 42, 99])(`mine %i blocks`, async increment => {
        const blockNumber = await ethCheatCodes.blockNumber();
        await ethCheatCodes.mine(increment);
        expect(await ethCheatCodes.blockNumber()).toBe(blockNumber + increment);
      });
    });

    it.each([100, 42, 99])(`setNextBlockTimestamp by %i`, async increment => {
      const blockNumber = await ethCheatCodes.blockNumber();
      const timestamp = await ethCheatCodes.timestamp();
      await ethCheatCodes.setNextBlockTimestamp(timestamp + increment);

      expect(await ethCheatCodes.timestamp()).toBe(timestamp);

      await ethCheatCodes.mine();

      expect(await ethCheatCodes.blockNumber()).toBe(blockNumber + 1);
      expect(await ethCheatCodes.timestamp()).toBe(timestamp + increment);
    });

    it('setNextBlockTimestamp to a past timestamp throws', async () => {
      const timestamp = await ethCheatCodes.timestamp();
      const pastTimestamp = timestamp - 1000;
      await expect(async () => await ethCheatCodes.setNextBlockTimestamp(pastTimestamp)).rejects.toThrow(
        'Timestamp error',
      );
    });

    it('load a value at a particular storage slot', async () => {
      // check that storage slot 0 is empty as expected
      const res = await ethCheatCodes.load(EthAddress.ZERO, 0n);
      expect(res).toBe(0n);
    });

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

    it('set bytecode correctly', async () => {
      const contractAddress = EthAddress.fromString('0x70997970C51812dc3A010C7d01b50e0d17dc79C8');
      await ethCheatCodes.etch(contractAddress, '0x1234');
      expect(await ethCheatCodes.getBytecode(contractAddress)).toBe('0x1234');
    });

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
      } catch (e: any) {
        expect(e.message).toContain('tx from field is set');
      }
    });
  });

  describe('L2 cheatcodes', () => {
    let wallet: Wallet;
    let admin: AztecAddress;
    let cc: CheatCodes;
    let teardown: () => Promise<void>;

    let token: TokenContract;
    let rollup: RollupContract;
    let watcher: AnvilTestWatcher | undefined;

    beforeAll(async () => {
      let deployL1ContractsValues;
      ({ teardown, wallet, cheatCodes: cc, deployL1ContractsValues, watcher } = await setup());
      if (watcher) {
        watcher.setIsMarkingAsProven(false);
      }

      admin = wallet.getAddress();
      rollup = RollupContract.getFromL1ContractsValues(deployL1ContractsValues);
      token = await TokenContract.deploy(wallet, admin, 'TokenName', 'TokenSymbol', 18).send().deployed();
    });

    afterAll(() => teardown());

    it('load public', async () => {
      expect(admin.toField().equals(await cc.aztec.loadPublic(token.address, 1n))).toBeTrue();
    });

    it('load public returns 0 for non existent value', async () => {
      const storageSlot = Fr.random();
      expect(Fr.ZERO.equals(await cc.aztec.loadPublic(token.address, storageSlot))).toBeTrue();
    });

    it('load private works as expected for no notes', async () => {
      const notes = await cc.aztec.loadPrivate(admin, token.address, 5n);
      const values = notes.map(note => note.items[0]);
      const balance = values.reduce((sum, current) => sum + current.toBigInt(), 0n);
      expect(balance).toEqual(0n);
    });

    it('load private', async () => {
      // mint a token note and check it exists in balances.
      // docs:start:load_private_cheatcode
      const mintAmount = 100n;

      await mintTokensToPrivate(token, wallet, admin, mintAmount);
      await token.methods.sync_private_state().simulate();

      const balancesAdminSlot = await cc.aztec.computeSlotInMap(TokenContract.storage.balances.slot, admin);

      // check if note was added to pending shield:
      const notes = await cc.aztec.loadPrivate(admin, token.address, balancesAdminSlot);

      // @note If you get pain for dinner, this guys is the reason.
      // Assuming that it is still testing the token contract, you need to look at the balances,
      // and then the type of note, currently a `UintNote` which stores fields: [owner, randomness, amount]
      const values = notes.map(note => note.items[2]);
      const balance = values.reduce((sum, current) => sum + current.toBigInt(), 0n);
      expect(balance).toEqual(mintAmount);
      // docs:end:load_private_cheatcode
    });

    it('markAsProven', async () => {
      const { pendingBlockNumber, provenBlockNumber } = await rollup.getTips();
      expect(pendingBlockNumber).toBeGreaterThan(provenBlockNumber);

      await cc.rollup.markAsProven();

      const { pendingBlockNumber: pendingBlockNumber2, provenBlockNumber: provenBlockNumber2 } = await rollup.getTips();
      expect(pendingBlockNumber2).toBe(provenBlockNumber2);

      // If this test fails, it is likely because the storage updated and is not updated in the cheatcodes.
    });
  });
});
