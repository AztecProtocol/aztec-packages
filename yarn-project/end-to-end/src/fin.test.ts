import { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer, Contract, ContractDeployer, CurveType, Fr, Point, SentTx, SignerType } from '@aztec/aztec.js';
import { ConsumerFinanceContractAbi, GullibleAccountContractAbi, ZkTokenContractAbi } from '@aztec/noir-contracts/examples';
import { DebugLogger } from '@aztec/foundation/log';

import { pointToPublicKey, setup } from './utils.js';

describe("basic payroll in valencia", () => {
    let aztecNode: AztecNodeService;
    let aztecRpcServer: AztecRPCServer;
    let accounts: AztecAddress[];
    let logger: DebugLogger;
    let owner: Point;
    let ownerAddress: AztecAddress;
  
    let contract: Contract;
  
    beforeEach(async () => {
      ({ aztecNode, aztecRpcServer, accounts, logger } = await setup(2));
        owner = await aztecRpcServer.getAccountPublicKey(accounts[0]);
        ownerAddress = accounts[0];

    }, 100_000);

    afterEach(async () => {
        await aztecNode?.stop();
        await aztecRpcServer?.stop();
      });


  const deployContract = async (initialBalance = 0n, owner = { x: 0n, y: 0n }) => {
    logger(`Deploying L2 contract...`);
    const deployer = new ContractDeployer(ZkTokenContractAbi, aztecRpcServer);
    const tx = deployer.deploy(initialBalance, owner).send();
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, ZkTokenContractAbi, aztecRpcServer);
    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  const deployFinContract = async () => {
    logger(`Deploying L2 contract...`);
    const deployer = new ContractDeployer(ConsumerFinanceContractAbi, aztecRpcServer);
    const tx = deployer.deploy().send();
    const receipt = await tx.getReceipt();
    contract = new Contract(receipt.contractAddress!, ConsumerFinanceContractAbi, aztecRpcServer);
    await tx.isMined(0, 0.1);
    await tx.getReceipt();
    logger('L2 contract deployed');
    return contract;
  };

  const expectBalance = async (tokenContract:Contract, owner: AztecAddress, expectedBalance: bigint) => {
    const ownerPublicKey = await aztecRpcServer.getAccountPublicKey(owner);
    const [balance] = await tokenContract.methods.getBalance(pointToPublicKey(ownerPublicKey)).view({ from: owner });
    logger(`Account ${owner} balance: ${balance}`);
    expect(balance).toBe(expectedBalance);
  };


it("it pays salary to 3 people in one transaction (by creating 3+1 notes)", async () => {
    const initialBalance = 30n;
    const zkContract = await deployContract(initialBalance, pointToPublicKey(owner));
    const finContract = await deployFinContract();
    const numberOfAccounts = 3;
    const points: Point[] = [];

    // create another note for the owner:
    // const tx = zkContract.methods.mint(initialBalance, owner).send({ from: ownerAddress });
    // await tx.isMined(0, 0.5);
    // await tx.getReceipt();

    // call getBalance on zkContract for the owner:
    await expectBalance(zkContract, ownerAddress, initialBalance);

    for (let i = 0; i < numberOfAccounts; ++i) {
        // We use the well-known private key and the validating account contract for the first account,
        // and generate random keypairs with gullible account contracts (ie no sig validation) for the rest.
        // TODO(#662): Let the aztec rpc server generate the keypair rather than hardcoding the private key
        const [privKey, impl] = [undefined, GullibleAccountContractAbi];
        const [txHash, newAddress] = await aztecRpcServer.createSmartAccount(
          privKey,
          CurveType.GRUMPKIN,
          SignerType.SCHNORR,
          impl,
        );
        const isMined = await new SentTx(aztecRpcServer, Promise.resolve(txHash)).isMined();
        expect(isMined).toBeTruthy();
        const address = newAddress;
        const pubKey = await aztecRpcServer.getAccountPublicKey(address);
        points.push(pubKey);
        logger(`Created account ${address.toString()} with public key ${pubKey.toString()}`);
      }
    const amounts: bigint[] = [4n, 3n, 2n];
    const amountSum = amounts.reduce((a, b) => a + b, 0n);

    logger(`processPayroll()...`);
    const batchTransferTx = finContract.methods.processPayroll(
      zkContract.address.toField(),
      points,
      amounts,
      owner,
      Fr.fromBuffer(zkContract.methods.batchTransfer.selector),
    ).send({ from: ownerAddress });
    // const batchTransferTx = zkContract.methods.batchTransfer(owner, amounts, points, true).send({ from: ownerAddress });
    await batchTransferTx.isMined(0, 0.5);
    const batchTransferTxReceipt = await batchTransferTx.getReceipt();
    logger(`Consumption Receipt status: ${batchTransferTxReceipt.status}`);
    await expectBalance(zkContract, ownerAddress, initialBalance-amountSum);
    }, 240_000)
    
  
});
