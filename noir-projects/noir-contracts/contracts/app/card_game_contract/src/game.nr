use crate::cards::Card;
use aztec::protocol::{address::AztecAddress, traits::{Deserialize, FromField, Packable, Serialize, ToField}};
use std::meta::derive;

global NUMBER_OF_PLAYERS: u32 = 2;
global NUMBER_OF_CARDS_DECK: u32 = 2;

#[derive(Serialize, Deserialize, Eq)]
pub struct PlayerEntry {
    pub address: AztecAddress,
    pub deck_strength: u32,
    pub points: u64,
}

impl Packable for PlayerEntry {
    let N: u32 = 2;

    fn pack(self) -> [Field; Self::N] {
        [self.address.to_field(), (self.deck_strength as Field) * 2.pow_32(64) + (self.points as Field)]
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let address = AztecAddress::from_field(packed[0]);
        let points = packed[1] as u64;
        let deck_strength = ((packed[1] - points as Field) / 2.pow_32(64)) as u32;
        Self { address, deck_strength, points }
    }
}

impl PlayerEntry {
    pub fn is_initialized(self) -> bool {
        !self.address.is_zero()
    }
}

pub global PLAYABLE_CARDS: u32 = 4;

#[derive(Serialize, Deserialize)]
pub struct Game {
    players: [PlayerEntry; NUMBER_OF_PLAYERS],
    pub rounds_cards: [Card; PLAYABLE_CARDS],
    started: bool,
    finished: bool,
    pub claimed: bool,
    current_player: u32,
    current_round: u32,
}

// Constants used just by the implementation of Packable
global PLAYERS_PACKED_LEN: u32 = NUMBER_OF_PLAYERS * <PlayerEntry as Packable>::N;
global CARDS_PACKED_LEN: u32 = PLAYABLE_CARDS * <Card as Packable>::N;
global SCALARS_OFFSET: u32 = PLAYERS_PACKED_LEN + CARDS_PACKED_LEN;

impl Packable for Game {
    let N: u32 = PLAYERS_PACKED_LEN + CARDS_PACKED_LEN + 1;

    fn pack(self) -> [Field; Self::N] {
        let mut result = [0; Self::N];

        let players_packed = self.players.pack();
        for i in 0..PLAYERS_PACKED_LEN {
            result[i] = players_packed[i];
        }

        let cards_packed = self.rounds_cards.pack();
        for i in 0..CARDS_PACKED_LEN {
            result[PLAYERS_PACKED_LEN + i] = cards_packed[i];
        }

        // Layout: [ current_round: u32 | current_player: u32 | claimed: 1b | finished: 1b | started: 1b ]
        result[SCALARS_OFFSET] = (self.started as Field)
            + (self.finished as Field) * 2.pow_32(1)
            + (self.claimed as Field) * 2.pow_32(2)
            + (self.current_player as Field) * 2.pow_32(3)
            + (self.current_round as Field) * 2.pow_32(35);

        result
    }

    fn unpack(packed: [Field; Self::N]) -> Self {
        let mut players_packed = [0; PLAYERS_PACKED_LEN];
        for i in 0..PLAYERS_PACKED_LEN {
            players_packed[i] = packed[i];
        }
        let players = <[PlayerEntry; NUMBER_OF_PLAYERS]>::unpack(players_packed);

        let mut cards_packed = [0; CARDS_PACKED_LEN];
        for i in 0..CARDS_PACKED_LEN {
            cards_packed[i] = packed[PLAYERS_PACKED_LEN + i];
        }
        let rounds_cards = <[Card; PLAYABLE_CARDS]>::unpack(cards_packed);

        let mut tmp = packed[SCALARS_OFFSET];
        let started = (tmp as u8) % 2 != 0;
        tmp = (tmp - started as Field) / 2.pow_32(1);
        let finished = (tmp as u8) % 2 != 0;
        tmp = (tmp - finished as Field) / 2.pow_32(1);
        let claimed = (tmp as u8) % 2 != 0;
        tmp = (tmp - claimed as Field) / 2.pow_32(1);
        let current_player = tmp as u32;
        tmp = (tmp - current_player as Field) / 2.pow_32(32);
        let current_round = tmp as u32;

        Self { players, rounds_cards, started, finished, claimed, current_player, current_round }
    }
}

impl Game {
    pub fn add_player(&mut self, player_entry: PlayerEntry) -> bool {
        let mut added = false;

        for i in 0..NUMBER_OF_PLAYERS {
            let entry = self.players[i];
            if entry.is_initialized() {
                assert(!entry.address.eq(player_entry.address), "Player already in game");
            } else if !added {
                self.players[i] = player_entry;
                added = true;
            }
        }

        added
    }

    pub fn start_game(&mut self) {
        assert(!self.started, "Game already started");
        for i in 0..NUMBER_OF_PLAYERS {
            let entry = self.players[i];
            assert(entry.is_initialized(), "Game not full");
        }
        let sorted_by_deck_strength =
            self.players.sort_via(|a: PlayerEntry, b: PlayerEntry| a.deck_strength < b.deck_strength);
        self.players = sorted_by_deck_strength;
        self.started = true;
    }

    pub fn current_player(self) -> PlayerEntry {
        assert(self.started, "Game not started");
        assert(!self.finished, "Game finished");
        self.players[self.current_player]
    }

    pub fn winner(self) -> PlayerEntry {
        assert(self.finished, "Game not finished");
        let mut winner = self.players[0];
        for i in 1..NUMBER_OF_PLAYERS {
            let entry = self.players[i];
            if entry.points > winner.points {
                winner = entry;
            }
        }
        winner
    }

    pub fn play_card(&mut self, card: Card) {
        assert(self.started, "Game not started");
        assert(!self.finished, "Game finished");

        let round_offset = self.current_round * NUMBER_OF_PLAYERS;

        self.rounds_cards[round_offset + self.current_player] = card;
        self.current_player = (self.current_player + 1) % NUMBER_OF_PLAYERS;

        if self.current_player == 0 {
            self._finish_round();
        }
    }

    fn _finish_round(&mut self) {
        let round_offset = self.current_round as u32 * NUMBER_OF_PLAYERS;
        self.current_round += 1;

        let mut winner_index = 0;
        let mut winner_strength = 0;
        let mut round_points = 0;

        for i in 0..NUMBER_OF_PLAYERS {
            let card = self.rounds_cards[round_offset + i];
            round_points += (card.points as u64);
            if card.strength > winner_strength {
                winner_strength = card.strength;
                winner_index = i;
            }
        }

        self.players[winner_index].points += round_points;
        if self.current_round == NUMBER_OF_CARDS_DECK {
            self.finished = true;
        }
    }
}

mod test {
    use crate::cards::Card;
    use super::{AztecAddress, FromField, Game, Packable, PlayerEntry};

    #[test]
    fn test_pack_unpack_player_entry() {
        let entry = PlayerEntry { address: AztecAddress::from_field(0xdeadbeef), deck_strength: 999, points: 12345678 };
        let unpacked = PlayerEntry::unpack(entry.pack());
        assert(unpacked.address.eq(entry.address));
        assert_eq(unpacked.deck_strength, entry.deck_strength);
        assert_eq(unpacked.points, entry.points);
    }

    #[test]
    fn test_pack_unpack_player_entry_zeros() {
        let entry = PlayerEntry { address: AztecAddress::from_field(0), deck_strength: 0, points: 0 };
        let unpacked = PlayerEntry::unpack(entry.pack());
        assert(unpacked.address.eq(entry.address));
        assert_eq(unpacked.deck_strength, 0);
        assert_eq(unpacked.points, 0);
    }

    #[test]
    fn test_pack_unpack_game() {
        let game = Game {
            players: [
                PlayerEntry { address: AztecAddress::from_field(1), deck_strength: 100, points: 50 },
                PlayerEntry { address: AztecAddress::from_field(2), deck_strength: 200, points: 75 },
            ],
            rounds_cards: [
                Card { strength: 10, points: 5 },
                Card { strength: 20, points: 15 },
                Card { strength: 30, points: 25 },
                Card { strength: 40, points: 35 },
            ],
            started: true,
            finished: false,
            claimed: true,
            current_player: 1,
            current_round: 1,
        };
        let unpacked = Game::unpack(game.pack());

        assert(unpacked.players[0].address.eq(game.players[0].address));
        assert_eq(unpacked.players[0].deck_strength, 100);
        assert_eq(unpacked.players[0].points, 50);
        assert(unpacked.players[1].address.eq(game.players[1].address));
        assert_eq(unpacked.players[1].deck_strength, 200);
        assert_eq(unpacked.players[1].points, 75);

        assert_eq(unpacked.rounds_cards[0].strength, 10);
        assert_eq(unpacked.rounds_cards[0].points, 5);
        assert_eq(unpacked.rounds_cards[3].strength, 40);
        assert_eq(unpacked.rounds_cards[3].points, 35);

        assert(unpacked.started);
        assert(!unpacked.finished);
        assert(unpacked.claimed);
        assert_eq(unpacked.current_player, 1);
        assert_eq(unpacked.current_round, 1);
    }

    #[test]
    fn test_pack_unpack_game_all_false() {
        let game = Game {
            players: [
                PlayerEntry { address: AztecAddress::from_field(0), deck_strength: 0, points: 0 },
                PlayerEntry { address: AztecAddress::from_field(0), deck_strength: 0, points: 0 },
            ],
            rounds_cards: [
                Card { strength: 0, points: 0 },
                Card { strength: 0, points: 0 },
                Card { strength: 0, points: 0 },
                Card { strength: 0, points: 0 },
            ],
            started: false,
            finished: false,
            claimed: false,
            current_player: 0,
            current_round: 0,
        };
        let unpacked = Game::unpack(game.pack());
        assert(!unpacked.started);
        assert(!unpacked.finished);
        assert(!unpacked.claimed);
        assert_eq(unpacked.current_player, 0);
        assert_eq(unpacked.current_round, 0);
    }
}
