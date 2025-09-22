// docs:start:imports
import { getDeployedTestAccounts } from '@aztec/accounts/testing';
import {
  AztecAddress,
  type AztecNode,
  Fr,
  type PXE,
  TxStatus,
  createAztecNodeClient,
  createPXEClient,
  waitForPXE,
} from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec/testing';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
// docs:end:imports
// docs:start:import_contract
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { TestWallet } from '@aztec/test-wallet';

// docs:end:import_contract
import { U128_UNDERFLOW_ERROR } from '../fixtures/fixtures.js';
import { mintTokensToPrivate } from '../fixtures/token_utils.js';

const {
  AZTEC_NODE_URL = 'http://localhost:8080',
  PXE_URL = 'http://localhost:8080',
  ETHEREUM_HOSTS = 'http://localhost:8545',
} = process.env;

describe('guides/dapp/testing', () => {
  describe('on local sandbox', () => {
    beforeAll(async () => {
      // docs:start:create_pxe_client
      const pxe = createPXEClient(PXE_URL);
      await waitForPXE(pxe);
      // docs:end:create_pxe_client
    });

    describe('token contract with initial accounts', () => {
      let pxe: PXE;
      let aztecNode: AztecNode;
      let wallet: TestWallet;
      let ownerAddress: AztecAddress;
      let recipientAddress: AztecAddress;
      let token: TokenContract;

      beforeEach(async () => {
        // docs:start:use-existing-wallets
        pxe = createPXEClient(PXE_URL);
        aztecNode = createAztecNodeClient(AZTEC_NODE_URL);
        const [owner, recipient] = await getDeployedTestAccounts(pxe);
        wallet = new TestWallet(pxe, aztecNode);
        await wallet.createSchnorrAccount(owner.secret, owner.salt);
        await wallet.createSchnorrAccount(recipient.secret, recipient.salt);
        ownerAddress = owner.address;
        recipientAddress = recipient.address;
        token = await TokenContract.deploy(wallet, ownerAddress, 'TokenName', 'TokenSymbol', 18)
          .send({ from: ownerAddress })
          .deployed();
        // docs:end:use-existing-wallets
      });

      it('increases recipient funds on mint', async () => {
        expect(await token.methods.balance_of_private(recipientAddress).simulate({ from: recipientAddress })).toEqual(
          0n,
        );
        const mintAmount = 20n;

        await mintTokensToPrivate(token, ownerAddress, recipientAddress, mintAmount);

        expect(await token.methods.balance_of_private(recipientAddress).simulate({ from: recipientAddress })).toEqual(
          20n,
        );
      });
    });

    describe('assertions', () => {
      let pxe: PXE;
      let aztecNode: AztecNode;
      let wallet: TestWallet;
      let ownerAddress: AztecAddress;
      let recipientAddress: AztecAddress;
      let testContract: TestContract;
      let token: TokenContract;
      let cheats: CheatCodes;
      let ownerSlot: Fr;

      beforeAll(async () => {
        pxe = createPXEClient(PXE_URL);
        aztecNode = createAztecNodeClient(AZTEC_NODE_URL);
        const [owner, recipient] = await getDeployedTestAccounts(pxe);
        wallet = new TestWallet(pxe, aztecNode);
        await wallet.createSchnorrAccount(owner.secret, owner.salt);
        await wallet.createSchnorrAccount(recipient.secret, recipient.salt);
        ownerAddress = owner.address;
        recipientAddress = recipient.address;
        testContract = await TestContract.deploy(wallet).send({ from: ownerAddress }).deployed();
        token = await TokenContract.deploy(wallet, ownerAddress, 'TokenName', 'TokenSymbol', 18)
          .send({ from: ownerAddress })
          .deployed();

        const mintAmount = 100n;

        await mintTokensToPrivate(token, ownerAddress, ownerAddress, mintAmount);

        // docs:start:calc-slot
        cheats = await CheatCodes.create(ETHEREUM_HOSTS.split(','), pxe, aztecNode);
        // The balances mapping is indexed by user address
        ownerSlot = await cheats.aztec.computeSlotInMap(TokenContract.storage.balances.slot, ownerAddress);
        // docs:end:calc-slot
      });

      it('checks private storage', async () => {
        // docs:start:private-storage
        await token.methods.sync_private_state().simulate({ from: ownerAddress });
        const notes = await pxe.getNotes({
          recipient: ownerAddress,
          contractAddress: token.address,
          storageSlot: ownerSlot,
          scopes: [ownerAddress],
        });
        // TODO(#12694): Do not rely on the ordering of members in a struct / check notes manually
        const values = notes.map(note => note.note.items[2]);
        const balance = values.reduce((sum, current) => sum + current.toBigInt(), 0n);
        expect(balance).toEqual(100n);
        // docs:end:private-storage
      });

      it('checks public storage', async () => {
        // docs:start:public-storage
        await token.methods.mint_to_public(ownerAddress, 100n).send({ from: ownerAddress }).wait();
        const ownerPublicBalanceSlot = await cheats.aztec.computeSlotInMap(
          TokenContract.storage.public_balances.slot,
          ownerAddress,
        );
        const balance = await aztecNode.getPublicStorageAt('latest', token.address, ownerPublicBalanceSlot);
        expect(balance.value).toEqual(100n);
        // docs:end:public-storage
      });

      it('checks public logs, [Kinda broken with current implementation]', async () => {
        // docs:start:public-logs
        const value = Fr.fromHexString('ef'); // Only 1 bytes will make its way in there :( so no larger stuff
        const tx = await testContract.methods.emit_public(value).send({ from: ownerAddress }).wait();
        const filter = {
          fromBlock: tx.blockNumber!,
          limit: 1, // 1 log expected
        };
        const logs = (await aztecNode.getPublicLogs(filter)).logs;
        expect(logs[0].log.getEmittedFields()).toEqual([value]);
        // docs:end:public-logs
      });

      it('asserts a local transaction simulation fails by calling simulate', async () => {
        // docs:start:local-tx-fails
        const call = token.methods.transfer(recipientAddress, 200n);
        await expect(call.simulate({ from: ownerAddress })).rejects.toThrow(/Balance too low/);
        // docs:end:local-tx-fails
      });

      it('asserts a transaction is dropped', async () => {
        // docs:start:tx-dropped
        const call1 = token.methods.transfer(recipientAddress, 80n);
        const call2 = token.methods.transfer(recipientAddress, 50n);

        const provenCall1 = await call1.prove({ from: ownerAddress });
        const provenCall2 = await call2.prove({ from: ownerAddress });

        await provenCall1.send().wait();
        await expect(provenCall2.send().wait()).rejects.toThrow(/dropped|nullifier/i);
        // docs:end:tx-dropped
      });

      it('asserts a simulation for a public function call fails', async () => {
        // docs:start:local-pub-fails
        const call = token.methods.transfer_in_public(ownerAddress, recipientAddress, 1000n, 0);
        await expect(call.simulate({ from: ownerAddress })).rejects.toThrow(U128_UNDERFLOW_ERROR);
        // docs:end:local-pub-fails
      });

      it('asserts a transaction with a failing public call is included (with no state changes)', async () => {
        // docs:start:pub-reverted
        const call = token.methods.transfer_in_public(ownerAddress, recipientAddress, 1000n, 0);
        const receipt = await call.send({ from: ownerAddress }).wait({ dontThrowOnRevert: true });
        expect(receipt.status).toEqual(TxStatus.APP_LOGIC_REVERTED);
        const ownerPublicBalanceSlot = await cheats.aztec.computeSlotInMap(
          TokenContract.storage.public_balances.slot,
          ownerAddress,
        );
        const balance = await aztecNode.getPublicStorageAt('latest', token.address, ownerPublicBalanceSlot);
        expect(balance.value).toEqual(100n);
        // docs:end:pub-reverted
      });
    });
  });
});
