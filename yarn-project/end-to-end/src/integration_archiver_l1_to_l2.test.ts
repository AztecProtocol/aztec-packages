import { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, Contract } from '@aztec/aztec.js';
import { EthAddress } from '@aztec/foundation/eth-address';

import { CircuitsWasm } from '@aztec/circuits.js';
import { computeSecretMessageHash } from '@aztec/circuits.js/abis';
import { DeployL1Contracts, deployL1Contract } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { DebugLogger } from '@aztec/foundation/log';
import { PortalERC20Abi, PortalERC20Bytecode, TokenPortalAbi, TokenPortalBytecode } from '@aztec/l1-artifacts';
import { Chain, HttpTransport, PublicClient, getContract } from 'viem';
import { delay, deployNonNativeL2TokenContract, pointToPublicKey, setNextBlockTimestamp, setup } from './utils.js';
import { Archiver } from '@aztec/archiver';

describe('e2e_l1_to_l2_msg', () => {
  let aztecNode: AztecNodeService;
  let aztecRpcServer: AztecRPCServer;
  let archiver: Archiver;
  let accounts: AztecAddress[];
  let logger: DebugLogger;
  let config: AztecNodeConfig;

  let l2Contract: Contract;
  let ethAccount: EthAddress;

  let tokenPortalAddress: EthAddress;
  let underlyingERC20Address: EthAddress;
  let rollupRegistryAddress: EthAddress;
  let tokenPortal: any;
  let underlyingERC20: any;
  let publicClient: PublicClient<HttpTransport, Chain>;

  beforeEach(async () => {
    let deployL1ContractsValues: DeployL1Contracts | undefined;
    ({ aztecNode, aztecRpcServer, deployL1ContractsValues, accounts, config, logger } = await setup(2));
    archiver = await Archiver.createAndSync(config);
    rollupRegistryAddress = deployL1ContractsValues!.registryAddress;

    const walletClient = deployL1ContractsValues.walletClient;
    publicClient = deployL1ContractsValues.publicClient;

    ethAccount = EthAddress.fromString((await walletClient.getAddresses())[0]);

    // Deploy portal contracts
    underlyingERC20Address = await deployL1Contract(walletClient, publicClient, PortalERC20Abi, PortalERC20Bytecode);
    tokenPortalAddress = await deployL1Contract(walletClient, publicClient, TokenPortalAbi, TokenPortalBytecode);
    underlyingERC20 = getContract({
      address: underlyingERC20Address.toString(),
      abi: PortalERC20Abi,
      walletClient,
      publicClient,
    });
    tokenPortal = getContract({
      address: tokenPortalAddress.toString(),
      abi: TokenPortalAbi,
      walletClient,
      publicClient,
    });
  }, 30_000);

  afterEach(async () => {
    await archiver.stop();
    await aztecNode?.stop();
    await aztecRpcServer?.stop();
  });

  const expectBalance = async (owner: AztecAddress, expectedBalance: bigint) => {
    const ownerPublicKey = await aztecRpcServer.getAccountPublicKey(owner);
    const [balance] = await l2Contract.methods.getBalance(pointToPublicKey(ownerPublicKey)).view({ from: owner });
    logger(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  it('cancelled l1 to l2 messages cannot be consumed by archiver', async () => {
    // first initialise the portal, create a message, then cancel it
    const initialBalance = 10n;
    const [ownerAddress] = accounts;
    const ownerPub = await aztecRpcServer.getAccountPublicKey(ownerAddress);
    logger(`Deploying L2 Token contract...`);
    l2Contract = await deployNonNativeL2TokenContract(
      aztecRpcServer,
      tokenPortalAddress,
      initialBalance,
      pointToPublicKey(ownerPub),
    );
    logger('L2 contract deployed');
    await expectBalance(accounts[0], initialBalance);

    const l2TokenAddress = l2Contract.address.toString() as `0x${string}`;

    logger('Initializing the TokenPortal contract');
    await tokenPortal.write.initialize(
      [rollupRegistryAddress.toString(), underlyingERC20Address.toString(), l2TokenAddress],
      {} as any,
    );
    logger('Successfully initialized the TokenPortal contract');

    // Generate a claim secret using pedersen
    // TODO: make this into an aztec.js utility function
    logger("Generating a claim secret using pedersen's hash function");
    const wasm = await CircuitsWasm.get();
    const secret = Fr.random();
    const claimSecretHash = computeSecretMessageHash(wasm, secret);
    logger('Generated claim secret: ', claimSecretHash);

    logger('Minting tokens on L1');
    await underlyingERC20.write.mint([ethAccount.toString(), 1000000n], {} as any);
    await underlyingERC20.write.approve([tokenPortalAddress.toString(), 1000n], {} as any);

    expect(await underlyingERC20.read.balanceOf([ethAccount.toString()])).toBe(1000000n);

    // Deposit tokens to the TokenPortal
    const secretString = `0x${claimSecretHash.toBuffer().toString('hex')}` as `0x${string}`;
    const deadline = Number((await publicClient.getBlock()).timestamp + 1000n);
    const mintAmount = 100n;

    logger('Sending messages to L1 portal');
    const args = [ownerAddress.toString(), mintAmount, deadline, secretString] as const;
    await tokenPortal.write.depositToAztec(args, {} as any);
    expect(await underlyingERC20.read.balanceOf([ethAccount.toString()])).toBe(1000000n - mintAmount);

    // Wait for the archiver to process the message
    await delay(5000); /// waiting 5 seconds.

    // set the block timestamp to be after the deadline (so we can cancel the message)
    await setNextBlockTimestamp(config.rpcUrl, deadline + 1);

    // cancel the message
    logger('cancelling the l1 to l2 message');
    const argsCancel = [ownerAddress.toString(), 100n, deadline, secretString, 0n] as const;
    await tokenPortal.write.cancelL1ToAztecMessage(argsCancel, { gas: 1_000_000n } as any);
    expect(await underlyingERC20.read.balanceOf([ethAccount.toString()])).toBe(1000000n);
    // let archiver sync up
    await delay(5000);

    // archiver shouldn't have any pending messages.
    expect((await archiver.getPendingL1ToL2Messages(10)).length).toEqual(0);
  }, 80_000);

  it('archiver handles l1 to l2 message correctly even when l2block has no such messages', async () => {
    const initialBalance = 10n;
    const [ownerAddress, receiver] = accounts;
    const ownerPub = await aztecRpcServer.getAccountPublicKey(ownerAddress);
    logger(`Deploying L2 Token contract...`);
    l2Contract = await deployNonNativeL2TokenContract(
      aztecRpcServer,
      tokenPortalAddress,
      initialBalance,
      pointToPublicKey(ownerPub),
    );
    logger('L2 contract deployed');

    // send a transfer tx to force through rollup with the message included
    const transferAmount = 1n;
    l2Contract.methods
      .transfer(
        transferAmount,
        pointToPublicKey(await aztecRpcServer.getAccountPublicKey(ownerAddress)),
        pointToPublicKey(await aztecRpcServer.getAccountPublicKey(receiver)),
      )
      .send({ from: accounts[0] });

    expect((await archiver.getPendingL1ToL2Messages(10)).length).toEqual(0);
    expect(() => archiver.getConfirmedL1ToL2Message(Fr.ZERO)).toThrow();
  });
});
