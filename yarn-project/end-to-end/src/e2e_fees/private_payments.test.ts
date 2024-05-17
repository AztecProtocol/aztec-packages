import {
  type AztecAddress,
  BatchCall,
  Fr,
  PrivateFeePaymentMethod,
  type TxReceipt,
  type Wallet,
  computeSecretHash,
} from '@aztec/aztec.js';
import { type GasSettings } from '@aztec/circuits.js';
import { type TokenContract as BananaCoin, FPCContract, type GasTokenContract } from '@aztec/noir-contracts.js';

import { expectMapping } from '../fixtures/utils.js';
import { FeesTest } from './fees_test.js';

describe('e2e_fees private_payment', () => {
  let aliceWallet: Wallet;
  let aliceAddress: AztecAddress;
  let bobAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let gasTokenContract: GasTokenContract;
  let bananaCoin: BananaCoin;
  let bananaFPC: FPCContract;
  let gasSettings: GasSettings;

  const t = new FeesTest('private_payment');

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyFundAliceWithBananas();
    ({ aliceWallet, aliceAddress, bobAddress, sequencerAddress, gasTokenContract, bananaCoin, bananaFPC, gasSettings } =
      await t.setup());
  });

  afterAll(async () => {
    await t.teardown();
  });

  let InitialSequencerL1Gas: bigint;

  let InitialAlicePublicBananas: bigint;
  let InitialAlicePrivateBananas: bigint;
  let InitialAliceGas: bigint;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let InitialBobPublicBananas: bigint;
  let InitialBobPrivateBananas: bigint;

  let InitialFPCPublicBananas: bigint;
  let InitialFPCPrivateBananas: bigint;
  let InitialFPCGas: bigint;

  let InitialSequencerGas: bigint;

  let maxFee: bigint;
  let refundSecret: Fr;

  beforeEach(async () => {
    maxFee = BigInt(20e9);
    refundSecret = Fr.random();

    expect(gasSettings.getFeeLimit().toBigInt()).toEqual(maxFee);

    InitialSequencerL1Gas = await t.getCoinbaseBalance();

    [
      [InitialAlicePrivateBananas, InitialBobPrivateBananas, InitialFPCPrivateBananas],
      [InitialAlicePublicBananas, InitialBobPublicBananas, InitialFPCPublicBananas],
      [InitialAliceGas, InitialFPCGas, InitialSequencerGas],
    ] = await Promise.all([
      t.bananaPrivateBalances(aliceAddress, bobAddress, bananaFPC.address),
      t.bananaPublicBalances(aliceAddress, bobAddress, bananaFPC.address),
      t.gasBalances(aliceAddress, bananaFPC.address, sequencerAddress),
    ]);
  });

  const getFeeAndRefund = (tx: Pick<TxReceipt, 'transactionFee'>) => [tx.transactionFee!, maxFee - tx.transactionFee!];

  it('pays fees for tx that dont run public app logic', async () => {
    /**
     * PRIVATE SETUP (1 nullifier for tx)
     * check authwit (1 nullifier)
     * reduce alice BC.private by MaxFee (1 nullifier)
     * enqueue public call to increase FPC BC.public by MaxFee
     * enqueue public call for fpc.pay_fee_with_shielded_rebate
     *
     * PRIVATE APP LOGIC
     * reduce Alice's BC.private by transferAmount (1 note)
     * create note for Bob of transferAmount (1 note)
     * encrypted logs of 944 bytes
     * unencrypted logs of 20 bytes
     *
     * PUBLIC SETUP
     * increase FPC BC.public by MaxFee
     *
     * PUBLIC APP LOGIC
     * N/A
     *
     * PUBLIC TEARDOWN
     * call gas.pay_fee
     *   decrease FPC AZT by FeeAmount
     *   increase sequencer AZT by FeeAmount
     * call banana.shield
     *   decrease FPC BC.public by RefundAmount
     *   create transparent note with RefundAmount
     *
     * this is expected to squash notes and nullifiers
     */
    const transferAmount = 5n;
    const interaction = bananaCoin.methods.transfer(aliceAddress, bobAddress, transferAmount, 0n);
    const localTx = await interaction.prove({
      fee: {
        gasSettings,
        paymentMethod: new PrivateFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet, refundSecret),
      },
    });
    expect(localTx.data.feePayer).toEqual(bananaFPC.address);

    const tx = await interaction.send().wait();

    await expect(t.getCoinbaseBalance()).resolves.toEqual(InitialSequencerL1Gas + 1n);

    /**
     * at present the user is paying DA gas for:
     * 3 nullifiers = 3 * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE = 3 * 32 * 16 = 1536 DA gas
     * 2 note hashes =  2 * DA_BYTES_PER_FIELD * DA_GAS_PER_BYTE = 2 * 32 * 16 = 1024 DA gas
     * 964 bytes of logs = 964 * DA_GAS_PER_BYTE = 964 * 16 = 15424 DA gas
     * tx overhead of 512 DA gas
     * for a total of 18496 DA gas.
     *
     * The default teardown gas allocation at present is
     * 100_000_000 for both DA and L2 gas.
     *
     * That produces a grand total of 200018496n.
     *
     * This will change because:
     * 1. Gas use during public execution is not currently incorporated
     * 2. We are presently squashing notes/nullifiers across non/revertible during private exeuction,
     *    but we shouldn't.
     */
    expect(tx.transactionFee).toEqual(200018496n);
    const [feeAmount, refundAmount] = getFeeAndRefund(tx);

    await expectMapping(
      t.bananaPrivateBalances,
      [aliceAddress, bobAddress, bananaFPC.address, sequencerAddress],
      [InitialAlicePrivateBananas - maxFee - transferAmount, transferAmount, InitialFPCPrivateBananas, 0n],
    );
    await expectMapping(
      t.bananaPublicBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [InitialAlicePublicBananas, InitialFPCPublicBananas + maxFee - refundAmount, 0n],
    );
    await expectMapping(
      t.gasBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [InitialAliceGas, InitialFPCGas - feeAmount, InitialSequencerGas],
    );

    await expect(
      // this rejects if note can't be added
      t.addPendingShieldNoteToPXE(t.aliceWallet, refundAmount, computeSecretHash(refundSecret), tx.txHash),
    ).resolves.toBeUndefined();
  });

  it('pays fees for tx that creates notes in private', async () => {
    /**
     * PRIVATE SETUP
     * check authwit
     * reduce alice BC.private by MaxFee
     * enqueue public call to increase FPC BC.public by MaxFee
     * enqueue public call for fpc.pay_fee_with_shielded_rebate
     *
     * PRIVATE APP LOGIC
     * increase alice BC.private by newlyMintedBananas
     *
     * PUBLIC SETUP
     * increase FPC BC.public by MaxFee
     *
     * PUBLIC APP LOGIC
     * BC increase total supply
     *
     * PUBLIC TEARDOWN
     * call gas.pay_fee
     *   decrease FPC AZT by FeeAmount
     *   increase sequencer AZT by FeeAmount
     * call banana.shield
     *   decrease FPC BC.public by RefundAmount
     *   create transparent note with RefundAmount
     */
    const newlyMintedBananas = 10n;
    const tx = await bananaCoin.methods
      .privately_mint_private_note(newlyMintedBananas)
      .send({
        fee: {
          gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet, refundSecret),
        },
      })
      .wait();

    const [feeAmount, refundAmount] = getFeeAndRefund(tx);

    await expectMapping(
      t.bananaPrivateBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [InitialAlicePrivateBananas - maxFee + newlyMintedBananas, InitialFPCPrivateBananas, 0n],
    );
    await expectMapping(
      t.bananaPublicBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [InitialAlicePublicBananas, InitialFPCPublicBananas + maxFee - refundAmount, 0n],
    );
    await expectMapping(
      t.gasBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [InitialAliceGas, InitialFPCGas - feeAmount, InitialSequencerGas],
    );

    await expect(
      // this rejects if note can't be added
      t.addPendingShieldNoteToPXE(t.aliceWallet, refundAmount, computeSecretHash(refundSecret), tx.txHash),
    ).resolves.toBeUndefined();
  });

  it('pays fees for tx that creates notes in public', async () => {
    /**
     * PRIVATE SETUP
     * check authwit
     * reduce alice BC.private by MaxFee
     * enqueue public call to increase FPC BC.public by MaxFee
     * enqueue public call for fpc.pay_fee_with_shielded_rebate
     *
     * PRIVATE APP LOGIC
     * N/A
     *
     * PUBLIC SETUP
     * increase FPC BC.public by MaxFee
     *
     * PUBLIC APP LOGIC
     * BC decrease Alice public balance by shieldedBananas
     * BC create transparent note of shieldedBananas
     *
     * PUBLIC TEARDOWN
     * call gas.pay_fee
     *   decrease FPC AZT by FeeAmount
     *   increase sequencer AZT by FeeAmount
     * call banana.shield
     *   decrease FPC BC.public by RefundAmount
     *   create transparent note with RefundAmount
     */
    const shieldedBananas = 1n;
    const shieldSecret = Fr.random();
    const shieldSecretHash = computeSecretHash(shieldSecret);
    const tx = await bananaCoin.methods
      .shield(aliceAddress, shieldedBananas, shieldSecretHash, 0n)
      .send({
        fee: {
          gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet, refundSecret),
        },
      })
      .wait();

    const [feeAmount, refundAmount] = getFeeAndRefund(tx);

    await expectMapping(
      t.bananaPrivateBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [InitialAlicePrivateBananas - maxFee, InitialFPCPrivateBananas, 0n],
    );
    await expectMapping(
      t.bananaPublicBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [InitialAlicePublicBananas - shieldedBananas, InitialFPCPublicBananas + maxFee - refundAmount, 0n],
    );
    await expectMapping(
      t.gasBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [InitialAliceGas, InitialFPCGas - feeAmount, InitialSequencerGas],
    );

    await expect(
      t.addPendingShieldNoteToPXE(t.aliceWallet, shieldedBananas, shieldSecretHash, tx.txHash),
    ).resolves.toBeUndefined();

    await expect(
      t.addPendingShieldNoteToPXE(t.aliceWallet, refundAmount, computeSecretHash(refundSecret), tx.txHash),
    ).resolves.toBeUndefined();
  });

  it('pays fees for tx that creates notes in both private and public', async () => {
    const privateTransfer = 1n;
    const shieldedBananas = 1n;
    const shieldSecret = Fr.random();
    const shieldSecretHash = computeSecretHash(shieldSecret);

    /**
     * PRIVATE SETUP
     * check authwit
     * reduce alice BC.private by MaxFee
     * enqueue public call to increase FPC BC.public by MaxFee
     * enqueue public call for fpc.pay_fee_with_shielded_rebate
     *
     * PRIVATE APP LOGIC
     * reduce Alice's private balance by privateTransfer
     * create note for Bob with privateTransfer amount of private BC
     *
     * PUBLIC SETUP
     * increase FPC BC.public by MaxFee
     *
     * PUBLIC APP LOGIC
     * BC decrease Alice public balance by shieldedBananas
     * BC create transparent note of shieldedBananas
     *
     * PUBLIC TEARDOWN
     * call gas.pay_fee
     *   decrease FPC AZT by FeeAmount
     *   increase sequencer AZT by FeeAmount
     * call banana.shield
     *   decrease FPC BC.public by RefundAmount
     *   create transparent note with RefundAmount
     */
    const tx = await new BatchCall(aliceWallet, [
      bananaCoin.methods.transfer(aliceAddress, bobAddress, privateTransfer, 0n).request(),
      bananaCoin.methods.shield(aliceAddress, shieldedBananas, shieldSecretHash, 0n).request(),
    ])
      .send({
        fee: {
          gasSettings,
          paymentMethod: new PrivateFeePaymentMethod(bananaCoin.address, bananaFPC.address, aliceWallet, refundSecret),
        },
      })
      .wait();

    const [feeAmount, refundAmount] = getFeeAndRefund(tx);

    await expectMapping(
      t.bananaPrivateBalances,
      [aliceAddress, bobAddress, bananaFPC.address, sequencerAddress],
      [
        InitialAlicePrivateBananas - maxFee - privateTransfer,
        InitialBobPrivateBananas + privateTransfer,
        InitialFPCPrivateBananas,
        0n,
      ],
    );
    await expectMapping(
      t.bananaPublicBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [InitialAlicePublicBananas - shieldedBananas, InitialFPCPublicBananas + maxFee - refundAmount, 0n],
    );
    await expectMapping(
      t.gasBalances,
      [aliceAddress, bananaFPC.address, sequencerAddress],
      [InitialAliceGas, InitialFPCGas - feeAmount, InitialSequencerGas],
    );

    await expect(
      t.addPendingShieldNoteToPXE(t.aliceWallet, shieldedBananas, shieldSecretHash, tx.txHash),
    ).resolves.toBeUndefined();

    await expect(
      t.addPendingShieldNoteToPXE(t.aliceWallet, refundAmount, computeSecretHash(refundSecret), tx.txHash),
    ).resolves.toBeUndefined();
  });

  it('rejects txs that dont have enough balance to cover gas costs', async () => {
    // deploy a copy of bananaFPC but don't fund it!
    const bankruptFPC = await FPCContract.deploy(aliceWallet, bananaCoin.address, gasTokenContract.address)
      .send()
      .deployed();

    await expectMapping(t.gasBalances, [bankruptFPC.address], [0n]);

    await expect(
      bananaCoin.methods
        .privately_mint_private_note(10)
        .send({
          // we need to skip public simulation otherwise the PXE refuses to accept the TX
          skipPublicSimulation: true,
          fee: {
            gasSettings,
            paymentMethod: new PrivateFeePaymentMethod(
              bananaCoin.address,
              bankruptFPC.address,
              aliceWallet,
              refundSecret,
            ),
          },
        })
        .wait(),
    ).rejects.toThrow('Tx dropped by P2P node.');
  });
});
