import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import { AztecAddress, Wallet } from '@aztec/aztec.js';
import { DebugLogger } from '@aztec/foundation/log';
import { CardGameContract } from '@aztec/noir-contracts/types';
import { AztecRPC, CompleteAddress } from '@aztec/types';

import { setup } from './fixtures/utils.js';

/* eslint-disable camelcase */

interface Card {
  points: bigint;
  strength: bigint;
}

const cardToField = (card: Card): bigint => {
  return card.strength + card.points * 65536n;
};

interface PlayerGameEntry {
  address: bigint;
  deck_strength: bigint;
  points: bigint;
}

interface Game {
  players: PlayerGameEntry[];
  rounds_cards: Card[];
  started: boolean;
  finished: boolean;
  claimed: boolean;
  current_player: bigint;
  current_round: bigint;
}

describe('e2e_card_game', () => {
  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let wallet: Wallet;
  let logger: DebugLogger;
  let firstPlayer: AztecAddress;
  let secondPlayer: AztecAddress;

  let contract: CardGameContract;

  beforeEach(async () => {
    let accounts: CompleteAddress[];
    ({ aztecNode, aztecRpcServer, accounts, wallet, logger } = await setup(2));
    firstPlayer = accounts[0].address;
    secondPlayer = accounts[1].address;
    await deployContract();
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
      points: 45778n,
      strength: 7074n,
    },
    {
      points: 60338n,
      strength: 53787n,
    },
    {
      points: 13035n,
      strength: 45778n,
    },
  ];

  it('should be able to buy packs', async () => {
    await contract.methods.buyPack(27n).send({ origin: firstPlayer }).wait();
    const collection = await contract.methods.viewCollectionCards(firstPlayer, 0).view({ from: firstPlayer });
    expect(collection.filter((option: any) => option._is_some).map((option: any) => option._value)).toEqual(
      firstPlayerCollection,
    );
  }, 30_000);

  describe('game join', () => {
    beforeEach(async () => {
      await contract.methods.buyPack(27n).send({ origin: firstPlayer }).wait();
      await contract.methods.buyPack(27n).send({ origin: secondPlayer }).wait();
    }, 30_000);

    it('should be able to join games', async () => {
      await contract.methods
        .joinGame(42, [cardToField(firstPlayerCollection[0]), cardToField(firstPlayerCollection[2])])
        .send({ origin: firstPlayer })
        .wait();

      const collection = await contract.methods.viewCollectionCards(firstPlayer, 0).view({ from: firstPlayer });
      expect(collection.filter((option: any) => option._is_some).map((option: any) => option._value)).toEqual([
        {
          points: 60338n,
          strength: 53787n,
        },
      ]);

      expect((await contract.methods.viewGame(42).view({ from: firstPlayer })) as Game).toMatchObject({
        players: [
          {
            address: firstPlayer.toBigInt(),
            deck_strength: 52852n,
            points: 0n,
          },
          {
            address: 0n,
            deck_strength: 0n,
            points: 0n,
          },
        ],
        started: false,
        finished: false,
        claimed: false,
        current_player: 0n,
      });
    }, 30_000);

    it('should start games', async () => {
      const secondPlayerCollection = (
        await contract.methods.viewCollectionCards(secondPlayer, 0).view({ from: secondPlayer })
      )
        .filter((option: any) => option._is_some)
        .map((option: any) => option._value);

      await contract.methods
        .joinGame(42, [cardToField(firstPlayerCollection[0]), cardToField(firstPlayerCollection[2])])
        .send({ origin: firstPlayer })
        .wait();

      await contract.methods
        .joinGame(42, [cardToField(secondPlayerCollection[0]), cardToField(secondPlayerCollection[2])])
        .send({ origin: secondPlayer })
        .wait();

      await contract.methods.startGame(42).send({ origin: firstPlayer }).wait();

      expect((await contract.methods.viewGame(42).view({ from: firstPlayer })) as Game).toMatchObject({
        players: expect.arrayContaining([
          {
            address: firstPlayer.toBigInt(),
            deck_strength: 52852n,
            points: 0n,
          },
          {
            address: secondPlayer.toBigInt(),
            deck_strength: expect.anything(),
            points: 0n,
          },
        ]),
        started: true,
        finished: false,
        claimed: false,
        current_player: 0n,
      });
    }, 30_000);
  });

  describe.only('game play', () => {
    let players: AztecAddress[];
    let cards: Card[][];

    beforeEach(async () => {
      players = [firstPlayer, secondPlayer];
      await contract.methods.buyPack(27n).send({ origin: firstPlayer }).wait();
      await contract.methods.buyPack(27n).send({ origin: secondPlayer }).wait();

      const secondPlayerCollection = (
        await contract.methods.viewCollectionCards(secondPlayer, 0).view({ from: secondPlayer })
      )
        .filter((option: any) => option._is_some)
        .map((option: any) => option._value);

      cards = [
        [firstPlayerCollection[0], firstPlayerCollection[2]],
        [secondPlayerCollection[1], secondPlayerCollection[2]],
      ];

      await contract.methods.joinGame(42, cards[0].map(cardToField)).send({ origin: firstPlayer }).wait();

      await contract.methods.joinGame(42, cards[1].map(cardToField)).send({ origin: secondPlayer }).wait();

      await contract.methods.startGame(42).send({ origin: firstPlayer }).wait();
    }, 60_000);

    it('should play a game and claim the winned cards', async () => {
      for (let roundIndex = 0; roundIndex < cards.length; roundIndex++) {
        for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
          const player = players[playerIndex];
          const card = cards[playerIndex][roundIndex];
          await contract.methods.playCard(42, card).send({ origin: player }).wait();
        }
      }

      const game = (await contract.methods.viewGame(42).view({ from: firstPlayer })) as Game;

      expect(game.finished).toBe(true);

      const winner = AztecAddress.fromBigInt(
        game.players.reduce((currentWinner, player) => (player.points > currentWinner.points ? player : currentWinner))
          .address,
      );

      await contract.methods.claimCards(42, game.rounds_cards.map(cardToField)).send({ origin: winner }).wait();
      const winnerCollection = (await contract.methods.viewCollectionCards(winner, 0).view({ from: winner }))
        .filter((option: any) => option._is_some)
        .map((option: any) => option._value);

      expect(winnerCollection).toEqual(expect.arrayContaining(cards.flat()));
    }, 120_000);
  });
});
