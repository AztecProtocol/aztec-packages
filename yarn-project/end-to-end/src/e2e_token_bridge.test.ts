import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { AuthWitnessEntrypointWallet, computeMessageSecretHash } from '@aztec/aztec.js';
import {
  AztecAddress,
  CircuitsWasm,
  CompleteAddress,
  EthAddress,
  Fr,
  FunctionSelector,
  GeneratorIndex,
} from '@aztec/circuits.js';
import { pedersenPlookupCompressWithHashIndex } from '@aztec/circuits.js/barretenberg';
import { DeployL1Contracts } from '@aztec/ethereum';
import { DebugLogger } from '@aztec/foundation/log';
import { SchnorrAuthWitnessAccountContract, TokenBridgeContract, TokenContract } from '@aztec/noir-contracts/types';
import { AztecRPC, TxStatus } from '@aztec/types';

import {
  createAuthWitnessAccounts,
  delay,
  deployAndInitializeStandardizedTokenAndBridgeContracts,
  setup,
} from './fixtures/utils.js';

const hashPayload = async (payload: Fr[]) => {
  return pedersenPlookupCompressWithHashIndex(
    await CircuitsWasm.get(),
    payload.map(fr => fr.toBuffer()),
    GeneratorIndex.SIGNATURE_PAYLOAD,
  );
};

describe('e2e_token_bridge_contract', () => {
  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let wallets: AuthWitnessEntrypointWallet[];
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  let ethAccount: EthAddress;
  let ownerAddress: AztecAddress;
  let token: TokenContract;
  let bridge: TokenBridgeContract;
  let tokenPortalAddress: EthAddress;
  let tokenPortal: any;
  let underlyingERC20: any;

  beforeAll(async () => {
    let deployL1ContractsValues: DeployL1Contracts;

    ({ aztecNode, aztecRpcServer, deployL1ContractsValues, logger } = await setup(0));
    ({ accounts, wallets } = await createAuthWitnessAccounts(aztecRpcServer, 3));

    const walletClient = deployL1ContractsValues.walletClient;
    const publicClient = deployL1ContractsValues.publicClient;
    ethAccount = EthAddress.fromString((await walletClient.getAddresses())[0]);
    ownerAddress = accounts[0].address;

    logger(`Deploying and initializing token, portal and its bridge...`);
    const contracts = await deployAndInitializeStandardizedTokenAndBridgeContracts(
      wallets[0],
      walletClient,
      publicClient,
      deployL1ContractsValues!.registryAddress,
      ownerAddress,
    );
    token = contracts.l2Token;
    bridge = contracts.bridge;
    tokenPortalAddress = contracts.tokenPortalAddress;
    tokenPortal = contracts.tokenPortal;
    underlyingERC20 = contracts.underlyingERC20;
    logger(`Deployed and initialized token, portal and its bridge.`);
  }, 60_000);

  afterEach(async () => {
    await aztecNode?.stop();
    if (aztecRpcServer instanceof AztecRPCServer) {
      await aztecRpcServer?.stop();
    }
  });

  // TODO(#2291) - replace with new cross chain harness impl
  const mintTokensOnL1 = async (amount: bigint) => {
    logger('Minting tokens on L1');
    await underlyingERC20.write.mint([ethAccount.toString(), amount], {} as any);
    expect(await underlyingERC20.read.balanceOf([ethAccount.toString()])).toBe(amount);
  };

  // TODO(#2291) - replace with new cross chain harness impl
  const depositTokensToPortal = async (bridgeAmount: bigint, secretHash: Fr) => {
    await underlyingERC20.write.approve([tokenPortalAddress.toString(), bridgeAmount], {} as any);

    // Deposit tokens to the TokenPortal
    const deadline = 2 ** 32 - 1; // max uint32 - 1
    logger('Sending messages to L1 portal to be consumed');
    const args = [
      ownerAddress.toString(),
      bridgeAmount,
      deadline,
      secretHash.toString(true),
      ethAccount.toString(),
    ] as const;
    const { result: messageKeyHex } = await tokenPortal.simulate.depositToAztec(args, {
      account: ethAccount.toString(),
    } as any);
    await tokenPortal.write.depositToAztec(args, {} as any);

    return Fr.fromString(messageKeyHex);
  };

  const mintPublicOnL2 = async (amount: bigint) => {
    const tx = token.methods.mint_public({ address: ownerAddress }, amount).send();
    const receipt = await tx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);
  };

  it('Deposit funds (publicly) from L1 -> L2 and withdraw (publicly) back to L1', async () => {
    const l1TokenBalance = 1000000n;
    const bridgeAmount = 100n;
    const secret = Fr.random();
    const secretHash = await computeMessageSecretHash(secret);

    // 1. Mint tokens on L1
    await mintTokensOnL1(l1TokenBalance);

    // 2. Deposit tokens to the TokenPortal
    const messageKey = await depositTokensToPortal(bridgeAmount, secretHash);
    expect(await underlyingERC20.read.balanceOf([ethAccount.toString()])).toBe(l1TokenBalance - bridgeAmount);

    // Wait for the archiver to process the message
    await delay(5000); /// waiting 5 seconds.

    // Perform an unrelated transaction on L2 to progress the rollup - here we mint tokens to owner
    const amount = 99n;
    await mintPublicOnL2(amount);
    const balanceBefore = await token.methods.balance_of_public({ address: ownerAddress }).view();
    expect(balanceBefore).toBe(amount);

    // 3. Consume message on aztec and mint publicly
    logger('Consuming messages on L2');
    const tx = bridge.methods.mint_public(bridgeAmount, messageKey, secret, { address: ethAccount.toField() }).send();
    const receipt = await tx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);
    const afterBalance = await token.methods.balance_of_public({ address: ownerAddress }).view();
    expect(afterBalance).toBe(balanceBefore + bridgeAmount);

    // time to withdraw the funds again!
    logger('Withdrawing funds from L2');

    // 4. Give approval to bridge to burn owner's funds:
    const withdrawAmount = 9n;
    const nonce = Fr.random();

    const burnMessageHash = async (caller: AztecAddress, from: AztecAddress, amount: bigint, nonce: Fr) => {
      return await hashPayload([
        caller.toField(),
        token.address.toField(),
        FunctionSelector.fromSignature('burn_public((Field),Field,Field)').toField(),
        from.toField(),
        new Fr(amount),
        nonce,
      ]);
    };

    const messageHash = await burnMessageHash(bridge.address, ownerAddress, withdrawAmount, nonce);
    // Add it to the wallet as approved
    const owner = await SchnorrAuthWitnessAccountContract.at(ownerAddress, wallets[0]);
    const setValidTx = owner.methods.set_is_valid_storage(messageHash, 1).send();
    const validTxReceipt = await setValidTx.wait();
    expect(validTxReceipt.status).toBe(TxStatus.MINED);

    // 5. Withdraw from L2 bridge
    const withdrawTx = bridge.methods
      .withdraw_public({ address: ethAccount.toField() }, withdrawAmount, { address: EthAddress.ZERO.toField() }, nonce)
      .send();
    const withdrawReceipt = await withdrawTx.wait();
    expect(withdrawReceipt.status).toBe(TxStatus.MINED);
    expect(await token.methods.balance_of_public({ address: ownerAddress }).view()).toBe(afterBalance - withdrawAmount);

    // TODO (#2291): Consume message on L1 -> update crosschain test harness to do this cleanly.
  }, 120_000);

  it('Deposit funds (privately) from L1 -> L2 and withdraw (privately) back to L1', async () => {
    const l1TokenBalance = 1000000n;
    const bridgeAmount = 100n;
    const secret = Fr.random();
    const secretHash = await computeMessageSecretHash(secret);

    // 1. Mint tokens on L1
    await mintTokensOnL1(l1TokenBalance);

    // 2. Deposit tokens to the TokenPortal
    const messageKey = await depositTokensToPortal(bridgeAmount, secretHash);
    expect(await underlyingERC20.read.balanceOf([ethAccount.toString()])).toBe(l1TokenBalance - bridgeAmount);

    // Wait for the archiver to process the message
    await delay(5000); /// waiting 5 seconds.

    // Perform an unrelated transaction on L2 to progress the rollup - here we mint tokens to owner
    const amount = 99n;
    await mintPublicOnL2(amount);
    const balanceBefore = await token.methods.balance_of_public({ address: ownerAddress }).view();
    expect(balanceBefore).toBe(amount);

    // 3. Consume message on aztec and mint publicly
    logger('Consuming messages on L2');
    const tx = bridge.methods.mint(bridgeAmount, messageKey, secret, { address: ethAccount.toField() }).send();
    const receipt = await tx.wait();
    expect(receipt.status).toBe(TxStatus.MINED);
    const txClaim = token.methods.redeem_shield({ address: ownerAddress }, bridgeAmount, secret).send();
    const receiptClaim = await txClaim.wait();
    expect(receiptClaim.status).toBe(TxStatus.MINED);

    const afterPrivateBalance = await token.methods.balance_of_private({ address: ownerAddress }).view();
    expect(afterPrivateBalance).toBe(bridgeAmount);

    // time to withdraw the funds again!
    logger('Withdrawing funds from L2');

    // 4. Give approval to bridge to burn owner's funds:
    const withdrawAmount = 9n;
    const nonce = Fr.random();
    const burnMessageHash = async (caller: AztecAddress, from: AztecAddress, amount: bigint, nonce: Fr) => {
      return await hashPayload([
        caller.toField(),
        token.address.toField(),
        FunctionSelector.fromSignature('burn((Field),Field,Field)').toField(),
        from.toField(),
        new Fr(amount),
        nonce,
      ]);
    };
    const messageHash = await burnMessageHash(bridge.address, ownerAddress, withdrawAmount, nonce);
    await wallets[0].signAndGetAuthWitness(messageHash); // wallet[0] -> ownerAddress

    // 5. Withdraw from L2 bridge
    const withdrawTx = bridge.methods
      .withdraw(
        { address: token.address },
        { address: ethAccount.toField() },
        withdrawAmount,
        { address: EthAddress.ZERO.toField() },
        nonce,
      )
      .send();
    const withdrawReceipt = await withdrawTx.wait();
    expect(withdrawReceipt.status).toBe(TxStatus.MINED);
    expect(await token.methods.balance_of_private({ address: ownerAddress }).view()).toBe(
      afterPrivateBalance - withdrawAmount,
    );

    // TODO (#2291): Consume message on L1 -> update crosschain test harness to do this cleanly.
  }, 120_000);
});
