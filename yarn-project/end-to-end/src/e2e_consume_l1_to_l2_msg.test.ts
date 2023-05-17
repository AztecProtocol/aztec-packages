import { AztecNode, getConfigEnvVars } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecAddress, AztecRPCServer, Contract, ContractDeployer, TxStatus } from '@aztec/aztec.js';
import { NonNativeTokenContractAbi } from '@aztec/noir-contracts/examples';

import { Account, mnemonicToAccount } from 'viem/accounts';
import { createAztecRpcServer } from './create_aztec_rpc_client.js';
import { deployL1Contract, deployL1Contracts } from './deploy_l1_contracts.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { Fr, Point } from '@aztec/foundation/fields';
import { toBigIntBE } from '@aztec/foundation/bigint-buffer';
import { MNEMONIC } from './fixtures.js';
import { PortalERC20Abi, PortalERC20Bytecode, TokenPortalAbi, TokenPortalBytecode } from '@aztec/l1-artifacts';
import { Chain, GetContractReturnType, HttpTransport, PublicClient, WalletClient, getContract } from 'viem';
import { computeSecretMessageHash } from '@aztec/circuits.js/abis';
import { CircuitsWasm } from '@aztec/circuits.js';

const logger = createDebugLogger('aztec:e2e_l1_to_l2_msg');

const config = getConfigEnvVars();

describe('e2e_l1_to_l2_msg', () => {
  let node: AztecNode;
  let aztecRpcServer: AztecRPCServer;
  let accounts: AztecAddress[];
  let contract: Contract;

  let ethAccount: EthAddress;

  let tokenPortalAddress: EthAddress;
  let underlyingERC20Address: EthAddress;
  let tokenPortal: GetContractReturnType<
    typeof TokenPortalAbi,
    PublicClient<HttpTransport, Chain>,
    WalletClient<HttpTransport, Chain, Account>
  >;
  let underlyingERC20: GetContractReturnType<
    typeof PortalERC20Abi,
    PublicClient<HttpTransport, Chain>,
    WalletClient<HttpTransport, Chain, Account>
  >;

  beforeEach(async () => {
    const account = mnemonicToAccount(MNEMONIC);

    ethAccount = EthAddress.fromString(account.address);

    const privKey = account.getHdKey().privateKey;
    const { rollupAddress, registryAddress, unverifiedDataEmitterAddress, walletClient, publicClient } =
      await deployL1Contracts(config.rpcUrl, account, logger);

    config.publisherPrivateKey = Buffer.from(privKey!);
    config.rollupContract = rollupAddress;
    config.unverifiedDataEmitterContract = unverifiedDataEmitterAddress;

    // Deploy portal contracts
    underlyingERC20Address = await deployL1Contract(walletClient, publicClient, PortalERC20Abi, PortalERC20Bytecode);
    tokenPortalAddress = await deployL1Contract(walletClient, publicClient, TokenPortalAbi, TokenPortalBytecode, [
      registryAddress.toString(),
      underlyingERC20Address.toString(),
    ]);
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

    node = await AztecNode.createAndSync(config);
    aztecRpcServer = await createAztecRpcServer(2, node);
    accounts = await aztecRpcServer.getAccounts();
  }, 60_000);

  afterEach(async () => {
    await node?.stop();
    await aztecRpcServer?.stop();
  });

  const expectBalance = async (owner: AztecAddress, expectedBalance: bigint) => {
    const ownerPublicKey = await aztecRpcServer.getAccountPublicKey(owner);
    const [balance] = await contract.methods.getBalance(pointToPublicKey(ownerPublicKey)).view({ from: owner });
    logger(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };

  const pointToPublicKey = (point: Point) => {
    const x = point.buffer.subarray(0, 32);
    const y = point.buffer.subarray(32, 64);
    return {
      x: toBigIntBE(x),
      y: toBigIntBE(y),
    };
  };

  const deployContract = async (initialBalance = 0n, owner = { x: 0n, y: 0n }) => {
    logger(`Deploying L2 Token contract...`);
    const deployer = new ContractDeployer(NonNativeTokenContractAbi, aztecRpcServer);
    const tx = deployer.deploy(initialBalance, owner).send();
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, NonNativeTokenContractAbi, aztecRpcServer);
    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  it('Should be able to consume an L1 Message and mint a non native token on L2', async () => {
    const initialBalance = 1n;
    const ownerAddress = accounts[0];
    const owner = await aztecRpcServer.getAccountPublicKey(ownerAddress);
    const deployedContract = await deployContract(initialBalance, pointToPublicKey(owner));
    await expectBalance(accounts[0], initialBalance);

    // Generate a claim secret using pedersen
    // TODO: make this into an aztec.js utility function
    logger("Generating a claim secret using pedersen's hash function");
    const wasm = await CircuitsWasm.get();
    const secret = Fr.random();
    const claimSecretHash = computeSecretMessageHash(wasm, secret);
    logger('Generated claim secret: ', claimSecretHash);

    // Mint some PortalERC20 token on l1
    await underlyingERC20.write.mint([ethAccount.toString(), 1000000n], {} as any);
    await underlyingERC20.write.approve([tokenPortalAddress.toString(), 1000n], {} as any);

    // Deposit tokens to the TokenPortal
    const contractString = deployedContract.address.toString() as `0x${string}`;
    const secretString = `0x${claimSecretHash.toBuffer().toString('hex')}` as `0x${string}`;
    const deadline = 4_294_967_295 - 1; // max uint - 1
    const returnedMessageKey = await tokenPortal.write.depositToAztec(
      [contractString, 100n, deadline, secretString],
      {} as any,
    );

    const messageKeyFr = Fr.fromBuffer(Buffer.from(returnedMessageKey, 'hex'));

    // Wait for the rollup to process the message
    // not implemented

    // Force the node to consume the message
    // not implemented

    // Call the mint tokens function on the noir contract
    const mintAmount = 100n;
    const tx = deployedContract.methods
      .mint(mintAmount, pointToPublicKey(owner), messageKeyFr, secret)
      .send({ from: ownerAddress });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
    await expectBalance(ownerAddress, mintAmount);
  });
});
