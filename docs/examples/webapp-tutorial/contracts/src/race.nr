// docs:start:race
use aztec::protocol::{
    address::AztecAddress,
    traits::{Deserialize, Serialize, Packable},
};

/// Public game state: player addresses, round progress, and final track scores.
#[derive(Deserialize, Serialize, Eq, Packable)]
pub struct Race {
    pub player1: AztecAddress,
    pub player2: AztecAddress,
    pub total_rounds: u8,
    pub player1_round: u8,
    pub player2_round: u8,
    pub player1_track1_final: u64,
    pub player1_track2_final: u64,
    pub player1_track3_final: u64,
    pub player1_track4_final: u64,
    pub player1_track5_final: u64,
    pub player2_track1_final: u64,
    pub player2_track2_final: u64,
    pub player2_track3_final: u64,
    pub player2_track4_final: u64,
    pub player2_track5_final: u64,
    pub end_block: u32,
}

impl Race {
    pub fn new(player1: AztecAddress, total_rounds: u8, end_block: u32) -> Race {
        Self {
            player1,
            player2: AztecAddress::zero(),
            total_rounds,
            player1_round: 0,
            player2_round: 0,
            player1_track1_final: 0,
            player1_track2_final: 0,
            player1_track3_final: 0,
            player1_track4_final: 0,
            player1_track5_final: 0,
            player2_track1_final: 0,
            player2_track2_final: 0,
            player2_track3_final: 0,
            player2_track4_final: 0,
            player2_track5_final: 0,
            end_block,
        }
    }

    pub fn join(self, player2: AztecAddress) -> Race {
        assert(!self.player1.eq(AztecAddress::zero()) & self.player2.eq(AztecAddress::zero()));
        assert(!self.player1.eq(player2));
        Self {
            player1: self.player1,
            player2,
            total_rounds: self.total_rounds,
            player1_round: self.player1_round,
            player2_round: self.player2_round,
            player1_track1_final: 0,
            player1_track2_final: 0,
            player1_track3_final: 0,
            player1_track4_final: 0,
            player1_track5_final: 0,
            player2_track1_final: 0,
            player2_track2_final: 0,
            player2_track3_final: 0,
            player2_track4_final: 0,
            player2_track5_final: 0,
            end_block: self.end_block,
        }
    }

    pub fn increment_player_round(self, player: AztecAddress, round: u8) -> Race {
        assert(round < self.total_rounds + 1);
        let ret = if player.eq(self.player1) {
            assert(round == self.player1_round + 1);
            Option::some(Self {
                player1: self.player1, player2: self.player2,
                total_rounds: self.total_rounds,
                player1_round: round, player2_round: self.player2_round,
                player1_track1_final: self.player1_track1_final, player1_track2_final: self.player1_track2_final,
                player1_track3_final: self.player1_track3_final, player1_track4_final: self.player1_track4_final,
                player1_track5_final: self.player1_track5_final,
                player2_track1_final: self.player2_track1_final, player2_track2_final: self.player2_track2_final,
                player2_track3_final: self.player2_track3_final, player2_track4_final: self.player2_track4_final,
                player2_track5_final: self.player2_track5_final,
                end_block: self.end_block,
            })
        } else if player.eq(self.player2) {
            assert(round == self.player2_round + 1);
            Option::some(Self {
                player1: self.player1, player2: self.player2,
                total_rounds: self.total_rounds,
                player1_round: self.player1_round, player2_round: round,
                player1_track1_final: self.player1_track1_final, player1_track2_final: self.player1_track2_final,
                player1_track3_final: self.player1_track3_final, player1_track4_final: self.player1_track4_final,
                player1_track5_final: self.player1_track5_final,
                player2_track1_final: self.player2_track1_final, player2_track2_final: self.player2_track2_final,
                player2_track3_final: self.player2_track3_final, player2_track4_final: self.player2_track4_final,
                player2_track5_final: self.player2_track5_final,
                end_block: self.end_block,
            })
        } else {
            Option::none()
        };
        ret.unwrap()
    }

    pub fn set_player_scores(self, player: AztecAddress, track1_final: u64, track2_final: u64, track3_final: u64, track4_final: u64, track5_final: u64) -> Race {
        let ret = if player.eq(self.player1) {
            assert(
                self.player1_track1_final + self.player1_track2_final +
                self.player1_track3_final + self.player1_track4_final +
                self.player1_track5_final == 0
            );
            Option::some(Self {
                player1: self.player1, player2: self.player2,
                total_rounds: self.total_rounds,
                player1_round: self.player1_round, player2_round: self.player2_round,
                player1_track1_final: track1_final, player1_track2_final: track2_final,
                player1_track3_final: track3_final, player1_track4_final: track4_final,
                player1_track5_final: track5_final,
                player2_track1_final: self.player2_track1_final, player2_track2_final: self.player2_track2_final,
                player2_track3_final: self.player2_track3_final, player2_track4_final: self.player2_track4_final,
                player2_track5_final: self.player2_track5_final,
                end_block: self.end_block,
            })
        } else if player.eq(self.player2) {
            assert(
                self.player2_track1_final + self.player2_track2_final +
                self.player2_track3_final + self.player2_track4_final +
                self.player2_track5_final == 0
            );
            Option::some(Self {
                player1: self.player1, player2: self.player2,
                total_rounds: self.total_rounds,
                player1_round: self.player1_round, player2_round: self.player2_round,
                player1_track1_final: self.player1_track1_final, player1_track2_final: self.player1_track2_final,
                player1_track3_final: self.player1_track3_final, player1_track4_final: self.player1_track4_final,
                player1_track5_final: self.player1_track5_final,
                player2_track1_final: track1_final, player2_track2_final: track2_final,
                player2_track3_final: track3_final, player2_track4_final: track4_final,
                player2_track5_final: track5_final,
                end_block: self.end_block,
            })
        } else {
            Option::none()
        };
        ret.unwrap()
    }

    pub fn calculate_winner(self, current_block_number: u32) -> AztecAddress {
        assert(current_block_number > self.end_block);
        let mut player1_wins = 0;
        let mut player2_wins = 0;

        if self.player1_track1_final > self.player2_track1_final { player1_wins += 1; } else { player2_wins += 1; };
        if self.player1_track2_final > self.player2_track2_final { player1_wins += 1; } else { player2_wins += 1; };
        if self.player1_track3_final > self.player2_track3_final { player1_wins += 1; } else { player2_wins += 1; };
        if self.player1_track4_final > self.player2_track4_final { player1_wins += 1; } else { player2_wins += 1; };
        if self.player1_track5_final > self.player2_track5_final { player1_wins += 1; } else { player2_wins += 1; };

        if (player1_wins > player2_wins) { self.player1 } else { self.player2 }
    }
}
// docs:end:race
