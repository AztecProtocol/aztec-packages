import {
  AccountWallet,
  AztecAddress,
  BatchCall,
  CompleteAddress,
  DebugLogger,
  EthAddress,
  ExtendedNote,
  Fr,
  GrumpkinPrivateKey,
  GrumpkinScalar,
  Note,
  PXE,
  PublicKey,
  TxStatus,
  computeMessageSecretHash,
  generatePublicKey,
  getContractInstanceFromDeployParams,
} from '@aztec/aztec.js';
import { computePartialAddress } from '@aztec/circuits.js';
import { EscrowContract, EscrowContractArtifact } from '@aztec/noir-contracts/Escrow';
import { TokenContract } from '@aztec/noir-contracts/Token';

import { setup } from './fixtures/utils.js';

describe('e2e_escrow_contract', () => {
  const pendingShieldsStorageSlot = new Fr(5);
  let pxe: PXE;
  let wallet: AccountWallet;
  let recipientWallet: AccountWallet;
  let accounts: CompleteAddress[];
  let logger: DebugLogger;
  let teardown: () => Promise<void>;

  let token: TokenContract;
  let escrowContract: EscrowContract;
  let owner: AztecAddress;
  let recipient: AztecAddress;

  let escrowPrivateKey: GrumpkinPrivateKey;
  let escrowPublicKey: PublicKey;

  beforeEach(async () => {
    // Setup environment
    ({
      teardown,
      pxe,
      accounts,
      wallets: [wallet, recipientWallet],
      logger,
    } = await setup(2));
    owner = accounts[0].address;
    recipient = accounts[1].address;

    // Generate private key for escrow contract, register key in pxe service, and deploy
    // Note that we need to register it first if we want to emit an encrypted note for it in the constructor
    escrowPrivateKey = GrumpkinScalar.random();
    escrowPublicKey = generatePublicKey(escrowPrivateKey);
    const salt = Fr.random();
    const deployInfo = getContractInstanceFromDeployParams(
      EscrowContractArtifact,
      [owner],
      salt,
      escrowPublicKey,
      EthAddress.ZERO,
    );
    await pxe.registerAccount(escrowPrivateKey, computePartialAddress(deployInfo));

    escrowContract = await EscrowContract.deployWithPublicKey(escrowPublicKey, wallet, owner)
      .send({ contractAddressSalt: salt })
      .deployed();
    logger(`Escrow contract deployed at ${escrowContract.address}`);

    // Deploy Token contract and mint funds for the escrow contract
    token = await TokenContract.deploy(wallet, owner, 'TokenName', 'TokenSymbol', 18).send().deployed();

    const mintAmount = 100n;
    const secret = Fr.random();
    const secretHash = computeMessageSecretHash(secret);

    const receipt = await token.methods.mint_private(mintAmount, secretHash).send().wait();
    expect(receipt.status).toEqual(TxStatus.MINED);

    const note = new Note([new Fr(mintAmount), secretHash]);
    const extendedNote = new ExtendedNote(note, owner, token.address, pendingShieldsStorageSlot, receipt.txHash);
    await pxe.addNote(extendedNote);

    expect(
      (await token.methods.redeem_shield(escrowContract.address, mintAmount, secret).send().wait()).status,
    ).toEqual(TxStatus.MINED);

    logger(`Token contract deployed at ${token.address}`);
  }, 100_000);

  afterEach(() => teardown(), 30_000);

  const expectBalance = async (who: AztecAddress, expectedBalance: bigint) => {
    const balance = await token.methods.balance_of_private(who).view({ from: who });
    logger(`Account ${who} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  it('withdraws funds from the escrow contract', async () => {
    await expectBalance(owner, 0n);
    await expectBalance(recipient, 0n);
    await expectBalance(escrowContract.address, 100n);

    logger(`Withdrawing funds from token contract to ${recipient}`);
    await escrowContract.methods.withdraw(token.address, 30, recipient).send().wait();

    await expectBalance(owner, 0n);
    await expectBalance(recipient, 30n);
    await expectBalance(escrowContract.address, 70n);
  }, 60_000);

  it('refuses to withdraw funds as a non-owner', async () => {
    await expect(
      escrowContract.withWallet(recipientWallet).methods.withdraw(token.address, 30, recipient).simulate(),
    ).rejects.toThrowError();
  }, 60_000);

  it('moves funds using multiple keys on the same tx (#1010)', async () => {
    logger(`Minting funds in token contract to ${owner}`);
    const mintAmount = 50n;
    const secret = Fr.random();
    const secretHash = computeMessageSecretHash(secret);

    const receipt = await token.methods.mint_private(mintAmount, secretHash).send().wait();
    expect(receipt.status).toEqual(TxStatus.MINED);

    const note = new Note([new Fr(mintAmount), secretHash]);
    const extendedNote = new ExtendedNote(note, owner, token.address, pendingShieldsStorageSlot, receipt.txHash);
    await pxe.addNote(extendedNote);

    expect((await token.methods.redeem_shield(owner, mintAmount, secret).send().wait()).status).toEqual(TxStatus.MINED);

    await expectBalance(owner, 50n);

    const actions = [
      token.methods.transfer(owner, recipient, 10, 0).request(),
      escrowContract.methods.withdraw(token.address, 20, recipient).request(),
    ];

    await new BatchCall(wallet, actions).send().wait();
    await expectBalance(recipient, 30n);
  }, 120_000);
});
