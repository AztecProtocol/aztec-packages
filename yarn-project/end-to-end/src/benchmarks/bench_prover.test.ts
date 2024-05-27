import { getSchnorrAccount, getSchnorrWallet } from '@aztec/accounts/schnorr';
import { type AztecNodeService } from '@aztec/aztec-node';
import { TxStatus } from '@aztec/aztec.js';
import { type AccountWallet } from '@aztec/aztec.js/wallet';
import { CompleteAddress, Fq, Fr } from '@aztec/circuits.js';
import { FPCContract, GasTokenContract, TestContract, TokenContract } from '@aztec/noir-contracts.js';
import { GasTokenAddress } from '@aztec/protocol-contracts/gas-token';
import { ProverPool } from '@aztec/prover-client/prover-pool';
import { type PXEService, createPXEService } from '@aztec/pxe';

import { jest } from '@jest/globals';

import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import { type EndToEndContext, setup } from '../fixtures/utils.js';

// TODO(@PhilWindle): Some part of this test are commented out until we can do more complicated public functions

jest.setTimeout(1_800_000);

const txTimeoutSec = 3600;

describe('benchmarks/proving', () => {
  let ctx: EndToEndContext;

  let schnorrWalletSalt: Fr;
  let schnorrWalletEncKey: Fr;
  let schnorrWalletSigningKey: Fq;
  let schnorrWalletAddress: CompleteAddress;

  let recipient: CompleteAddress;

  let initialGasContract: GasTokenContract;
  let initialTestContract: TestContract;
  let initialTokenContract: TokenContract;
  let initialFpContract: FPCContract;

  let provingPxes: PXEService[];

  let acvmCleanup: () => Promise<void>;
  let bbCleanup: () => Promise<void>;
  let proverPool: ProverPool;

  // setup the environment quickly using fake proofs
  beforeAll(async () => {
    ctx = await setup(
      1,
      {
        // do setup with fake proofs
        realProofs: false,
        proverAgents: 4,
        proverAgentPollInterval: 10,
        minTxsPerBlock: 1,
      },
      {},
      true, // enable gas
    );

    schnorrWalletSalt = Fr.random();
    schnorrWalletEncKey = Fr.random();
    schnorrWalletSigningKey = Fq.random();
    const initialSchnorrWallet = await getSchnorrAccount(
      ctx.pxe,
      schnorrWalletEncKey,
      schnorrWalletSigningKey,
      schnorrWalletSalt,
    )
      .deploy({
        skipClassRegistration: false,
        skipPublicDeployment: false,
      })
      .getWallet();
    schnorrWalletAddress = initialSchnorrWallet.getCompleteAddress();

    initialTestContract = await TestContract.deploy(initialSchnorrWallet).send().deployed();
    initialTokenContract = await TokenContract.deploy(
      initialSchnorrWallet,
      initialSchnorrWallet.getAddress(),
      'test',
      't',
      18,
    )
      .send()
      .deployed();
    initialGasContract = await GasTokenContract.at(GasTokenAddress, initialSchnorrWallet);
    initialFpContract = await FPCContract.deploy(
      initialSchnorrWallet,
      initialTokenContract.address,
      initialGasContract.address,
    )
      .send()
      .deployed();

    await Promise.all([
      initialGasContract.methods.mint_public(initialFpContract.address, 1e12).send().wait(),
      initialTokenContract.methods.mint_public(initialSchnorrWallet.getAddress(), 1e12).send().wait(),
      initialTokenContract.methods.privately_mint_private_note(1e12).send().wait(),
    ]);

    recipient = CompleteAddress.random();
  });

  // remove the fake prover and setup the real one
  beforeAll(async () => {
    const [acvmConfig, bbConfig] = await Promise.all([getACVMConfig(ctx.logger), getBBConfig(ctx.logger)]);
    if (!acvmConfig || !bbConfig) {
      throw new Error('Missing ACVM or BB config');
    }

    acvmCleanup = acvmConfig.cleanup;
    bbCleanup = bbConfig.cleanup;

    proverPool = ProverPool.nativePool(
      {
        ...acvmConfig,
        ...bbConfig,
      },
      2,
      10,
    );

    ctx.logger.info('Stopping fake provers');
    await ctx.aztecNode.setConfig({
      // stop the fake provers
      proverAgents: 0,
      realProofs: true,
      minTxsPerBlock: 2,
    });

    ctx.logger.info('Starting real provers');
    await proverPool.start((ctx.aztecNode as AztecNodeService).getProver().getProvingJobSource());

    ctx.logger.info('Starting PXEs configured with real proofs');
    provingPxes = [];
    for (let i = 0; i < 4; i++) {
      const pxe = await createPXEService(
        ctx.aztecNode,
        {
          proverEnabled: true,
          bbBinaryPath: bbConfig.bbBinaryPath,
          bbWorkingDirectory: bbConfig.bbWorkingDirectory,
          l2BlockPollingIntervalMS: 1000,
          l2StartingBlock: 1,
        },
        `proving-pxe-${i}`,
      );

      await getSchnorrAccount(pxe, schnorrWalletEncKey, schnorrWalletSigningKey, schnorrWalletSalt).register();
      await pxe.registerContract(initialTokenContract);
      await pxe.registerContract(initialTestContract);
      await pxe.registerContract(initialFpContract);
      await pxe.registerContract(initialGasContract);

      await pxe.registerRecipient(recipient);

      provingPxes.push(pxe);
    }
  });

  afterAll(async () => {
    for (const pxe of provingPxes) {
      await pxe.stop();
    }
    await proverPool.stop();
    await ctx.teardown();
    await acvmCleanup();
    await bbCleanup();
  });

  it('builds a full block', async () => {
    ctx.logger.info('+----------------------+');
    ctx.logger.info('|                      |');
    ctx.logger.info('|  STARTING BENCHMARK  |');
    ctx.logger.info('|                      |');
    ctx.logger.info('+----------------------+');

    const fnCalls = [
      //(await getTestContractOnPXE(1)).methods.emit_unencrypted(43),
      //(await getTestContractOnPXE(2)).methods.create_l2_to_l1_message_public(45, 46, EthAddress.random()),
      (await getTokenContract(0)).methods.transfer_public(schnorrWalletAddress.address, recipient.address, 1000, 0),
      (await getTokenContract(1)).methods.transfer(schnorrWalletAddress.address, recipient.address, 1000, 0),
    ];

    // const feeFnCall1 = {
    //   gasSettings: GasSettings.default(),
    //   paymentMethod: new PublicFeePaymentMethod(
    //     initialTokenContract.address,
    //     initialFpContract.address,
    //     await getWalletOnPxe(2),
    //   ),
    // };

    // const feeFnCall3 = {
    //   gasSettings: GasSettings.default(),
    //   paymentMethod: new PrivateFeePaymentMethod(
    //     initialTokenContract.address,
    //     initialFpContract.address,
    //     await getWalletOnPxe(2),
    //   ),
    // };

    ctx.logger.info('Proving first two transactions');
    await Promise.all([
      // fnCalls[0].prove({
      //   fee: feeFnCall1,
      // }),
      fnCalls[0].prove(),
      fnCalls[1].prove(),
    ]);

    // ctx.logger.info('Proving the next transactions');
    // await Promise.all([
    //   fnCalls[2].prove(),
    //   fnCalls[3].prove({
    //     fee: feeFnCall3,
    //   }),
    // ]);

    ctx.logger.info('Finished proving all transactions');

    ctx.logger.info('Sending transactions');
    const txs = [
      // fnCalls[0].send({
      //   fee: feeFnCall1,
      // }),
      fnCalls[0].send(),
      fnCalls[1].send(),
      // fnCalls[2].send(),
      // fnCalls[3].send({ fee: feeFnCall3 }),
    ];

    const receipts = await Promise.all(txs.map(tx => tx.wait({ timeout: txTimeoutSec })));
    expect(receipts.every(r => r.status === TxStatus.SUCCESS)).toBe(true);
  });

  function getWalletOnPxe(idx: number): Promise<AccountWallet> {
    return getSchnorrWallet(provingPxes[idx], schnorrWalletAddress.address, schnorrWalletSigningKey);
  }

  // async function getTestContractOnPXE(idx: number): Promise<TestContract> {
  //   const wallet = await getWalletOnPxe(idx);
  //   return TestContract.at(initialTestContract.address, wallet);
  // }

  async function getTokenContract(idx: number): Promise<TokenContract> {
    const wallet = await getWalletOnPxe(idx);
    return TokenContract.at(initialTokenContract.address, wallet);
  }
});
