import { Archiver } from '@aztec/archiver';
import { AztecNodeConfig } from '@aztec/aztec-node';
import { AztecAddress, CompleteAddress, Wallet, computeMessageSecretHash } from '@aztec/aztec.js';
import { DeployL1Contracts } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { DebugLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts/types';

import { Chain, HttpTransport, PublicClient } from 'viem';

import { delay, deployAndInitializeTokenAndBridgeContracts, setNextBlockTimestamp, setup } from './fixtures/utils.js';

// TODO (#2291) - Replace with token bridge standard
describe('archiver integration with l1 to l2 messages', () => {
  let wallet: Wallet;
  let archiver: Archiver;
  let logger: DebugLogger;
  let config: AztecNodeConfig;
  let teardown: () => Promise<void>;

  let l2Token: TokenContract;
  let ethAccount: EthAddress;

  let tokenPortalAddress: EthAddress;
  let tokenPortal: any;
  let underlyingERC20: any;
  let publicClient: PublicClient<HttpTransport, Chain>;

  let owner: AztecAddress;
  let receiver: AztecAddress;

  beforeEach(async () => {
    let deployL1ContractsValues: DeployL1Contracts | undefined;
    let accounts: CompleteAddress[];
    ({ teardown, wallet, deployL1ContractsValues, accounts, config, logger } = await setup(2));
    archiver = await Archiver.createAndSync(config);

    const walletClient = deployL1ContractsValues.walletClient;
    publicClient = deployL1ContractsValues.publicClient;

    ethAccount = EthAddress.fromString((await walletClient.getAddresses())[0]);
    owner = accounts[0].address;
    receiver = accounts[1].address;

    // Deploy and initialize all required contracts
    logger('Deploying Portal, initializing and deploying l2 contract...');
    const contracts = await deployAndInitializeTokenAndBridgeContracts(
      wallet,
      walletClient,
      publicClient,
      deployL1ContractsValues!.l1ContractAddresses.registryAddress!,
      owner,
    );
    l2Token = contracts.token;
    underlyingERC20 = contracts.underlyingERC20;
    tokenPortal = contracts.tokenPortal;
    tokenPortalAddress = contracts.tokenPortalAddress;
    logger('Successfully deployed contracts and initialized portal');
  }, 100_000);

  afterEach(async () => {
    await archiver.stop();
    await teardown();
  }, 30_000);

  it('cancelled l1 to l2 messages cannot be consumed by archiver', async () => {
    // create a message, then cancel it
    const initialL1MintAmount = 1000000n;
    const mintAmount = 1000n;

    // Generate a claim secret using pedersen
    logger("Generating a claim secret using pedersen's hash function");
    const secret = Fr.random();
    const secretHash = await computeMessageSecretHash(secret);
    const secretString = `0x${secretHash.toBuffer().toString('hex')}` as `0x${string}`;
    logger('Generated claim secret: ' + secretString);

    logger('Minting tokens on L1');
    await underlyingERC20.write.mint([ethAccount.toString(), initialL1MintAmount], {} as any);
    expect(await underlyingERC20.read.balanceOf([ethAccount.toString()])).toBe(initialL1MintAmount);

    // Deposit tokens to the TokenPortal
    await underlyingERC20.write.approve([tokenPortalAddress.toString(), mintAmount], {} as any);
    const deadline = Number((await publicClient.getBlock()).timestamp + 1000n);

    logger('Sending messages to L1 portal');
    const args = [mintAmount, owner.toString(), ethAccount.toString(), deadline, secretString] as const;
    await tokenPortal.write.depositToAztecPublic(args, {} as any);
    expect(await underlyingERC20.read.balanceOf([ethAccount.toString()])).toBe(initialL1MintAmount - mintAmount);

    // Wait for the archiver to process the message
    await delay(5000); /// waiting 5 seconds.

    // set the block timestamp to be after the deadline (so we can cancel the message)
    await setNextBlockTimestamp(config.rpcUrl, deadline + 1);

    // cancel the message
    logger('cancelling the l1 to l2 message');
    const argsCancel = [mintAmount, owner.toString(), deadline, secretString, 0n] as const;
    await tokenPortal.write.cancelL1ToAztecMessagePublic(argsCancel, { gas: 1_000_000n } as any);
    expect(await underlyingERC20.read.balanceOf([ethAccount.toString()])).toBe(initialL1MintAmount);
    // let archiver sync up
    await delay(5000);

    // archiver shouldn't have any pending messages.
    expect((await archiver.getPendingL1ToL2Messages(10)).length).toEqual(0);
  }, 80_000);

  it('archiver handles l1 to l2 message correctly even when l2block has no such messages', async () => {
    // send a transfer tx to force through rollup with the message included
    l2Token.methods.transfer_public(owner, receiver, 0n, 0n).send();

    expect((await archiver.getPendingL1ToL2Messages(10)).length).toEqual(0);
    expect(() => archiver.getConfirmedL1ToL2Message(Fr.ZERO)).toThrow();
  });
});
