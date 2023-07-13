import { AztecRPCServer } from '@aztec/aztec-rpc';
import {
  AccountContract,
  AccountWallet,
  Contract,
  ContractDeployer,
  Fr,
  SchnorrAuthProvider,
  generatePublicKey,
} from '@aztec/aztec.js';
import {
  AztecAddress,
  CircuitsWasm,
  PartialContractAddress,
  Point,
  getContractDeploymentInfo,
} from '@aztec/circuits.js';
import { Schnorr } from '@aztec/circuits.js/barretenberg';
import { ContractAbi } from '@aztec/foundation/abi';
import { toBigInt } from '@aztec/foundation/serialize';
import { ChildAbi, SchnorrAccountContractAbi } from '@aztec/noir-contracts/examples';
import { PublicKey } from '@aztec/types';
import { randomBytes } from 'crypto';

import { setup } from './utils.js';

async function deployContract(
  aztecRpcServer: AztecRPCServer,
  publicKey: PublicKey,
  abi: ContractAbi,
  contractAddressSalt?: Fr,
) {
  const deployer = new ContractDeployer(abi, aztecRpcServer, publicKey);
  const deployMethod = deployer.deploy();
  await deployMethod.create({ contractAddressSalt });
  const tx = deployMethod.send();
  expect(await tx.isMined(0, 0.1)).toBeTruthy();
  const receipt = await tx.getReceipt();
  return { address: receipt.contractAddress!, partialContractAddress: deployMethod.partialContractAddress! };
}

async function createNewAccount(
  aztecRpcServer: AztecRPCServer,
  abi: ContractAbi,
  args: any[],
  privateKey: Buffer,
  createWallet: CreateWalletFunction,
) {
  const salt = Fr.random();
  const publicKey = await generatePublicKey(privateKey);
  const { address, partialAddress } = await getContractDeploymentInfo(abi, args, salt, publicKey);
  await aztecRpcServer.addAccount(privateKey, address, partialAddress, abi);
  await deployContract(aztecRpcServer, publicKey, abi, salt);
  const wallet = await createWallet(aztecRpcServer, address, partialAddress, privateKey);
  return { wallet, address, partialAddress };
}

type CreateWalletFunction = (
  aztecRpcServer: AztecRPCServer,
  address: AztecAddress,
  partialAddress: PartialContractAddress,
  privateKey: Buffer,
) => Promise<AccountWallet>;

function itShouldBehaveLikeAnAccountContract(abi: ContractAbi, args: any[], createWallet: CreateWalletFunction) {
  describe(`${abi.name} behaves like an account contract`, () => {
    let context: Awaited<ReturnType<typeof setup>>;
    let child: Contract;
    let address: AztecAddress;
    let partialAddress: PartialContractAddress;
    let wallet: AccountWallet;

    beforeEach(async () => {
      context = await setup();
      const privateKey = randomBytes(32);
      const { aztecRpcServer } = context;
      ({ wallet, address, partialAddress } = await createNewAccount(
        aztecRpcServer,
        abi,
        args,
        privateKey,
        createWallet,
      ));

      const { address: childAddress } = await deployContract(aztecRpcServer, Point.random(), ChildAbi);
      child = new Contract(childAddress, ChildAbi, wallet);
    }, 60_000);

    afterEach(async () => {
      await context.aztecNode.stop();
      await context.aztecRpcServer.stop();
    });

    it('calls a private function', async () => {
      const { logger } = context;
      logger('Calling private function...');
      const tx = child.methods.value(42).send();
      expect(await tx.isMined(0, 0.1)).toBeTruthy();
    }, 60_000);

    it('calls a public function', async () => {
      const { logger, aztecNode } = context;
      logger('Calling public function...');
      const tx = child.methods.pubStoreValue(42).send();
      expect(await tx.isMined(0, 0.1)).toBeTruthy();
      expect(toBigInt((await aztecNode.getStorageAt(child.address, 1n))!)).toEqual(42n);
    }, 60_000);

    it('fails to call a function using an invalid signature', async () => {
      const invalidWallet = await createWallet(context.aztecRpcServer, address, partialAddress, randomBytes(32));
      const childWithInvalidWallet = new Contract(child.address, child.abi, invalidWallet);
      await expect(childWithInvalidWallet.methods.value(42).simulate()).rejects.toThrowError(
        /could not satisfy all constraints/,
      );
    });
  });
}

const createSchnorrAccount = async (
  aztecRpcServer: AztecRPCServer,
  address: AztecAddress,
  partialAddress: PartialContractAddress,
  privateKey: Buffer,
) =>
  new AccountWallet(
    aztecRpcServer,
    new AccountContract(
      address,
      await generatePublicKey(privateKey),
      new SchnorrAuthProvider(await Schnorr.new(), privateKey),
      partialAddress,
      SchnorrAccountContractAbi,
      await CircuitsWasm.get(),
    ),
  );

describe('e2e_account_contracts', () => {
  itShouldBehaveLikeAnAccountContract(SchnorrAccountContractAbi, [], createSchnorrAccount);
});
