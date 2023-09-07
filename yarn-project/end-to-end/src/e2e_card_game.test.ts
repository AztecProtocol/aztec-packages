import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { AztecAddress, Wallet } from '@aztec/aztec.js';
import { DebugLogger } from '@aztec/foundation/log';
import { CardGameContract } from '@aztec/noir-contracts/types';
import { AztecRPC, CompleteAddress } from '@aztec/types';

import { setup } from './fixtures/utils.js';

interface Card {
  points: bigint;
  strength: bigint;
}

describe('e2e_card_game', () => {
  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let wallet: Wallet;
  let logger: DebugLogger;
  let firstPlayer: AztecAddress;
  // let secondPlayer: AztecAddress;

  let contract: CardGameContract;

  beforeEach(async () => {
    let accounts: CompleteAddress[];
    ({ aztecNode, aztecRpcServer, accounts, wallet, logger } = await setup(2));
    firstPlayer = accounts[0].address;
    // secondPlayer = accounts[1].address;
  }, 100_000);

  afterEach(async () => {
    await aztecNode?.stop();
    if (aztecRpcServer instanceof AztecRPCServer) {
      await aztecRpcServer?.stop();
    }
  });

  const deployContract = async () => {
    logger(`Deploying L2 contract...`);
    contract = await CardGameContract.deploy(wallet).send().deployed();
    logger(`L2 contract deployed at ${contract.address}`);
  };

  const firstPlayerCollection: Card[] = [
    {
      points: 7074n,
      strength: 45778n,
    },
    {
      points: 53787n,
      strength: 60338n,
    },
    {
      points: 45778n,
      strength: 13035n,
    },
  ];

  it('should be able to buy packs', async () => {
    await deployContract();
    await contract.methods.buyPack(27n).send({ origin: firstPlayer }).wait();
    const collection = await contract.methods.getCollectionCards(firstPlayer, 0).view({ from: firstPlayer });
    expect(collection.filter((option: any) => option._is_some).map((option: any) => option._value)).toEqual(
      firstPlayerCollection,
    );
  }, 30_000);
});
