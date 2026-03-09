// docs:start:game-round-note
use aztec::{macros::notes::note, protocol::{traits::Packable, address::AztecAddress}};

/// A private note storing a player's point allocation for one round.
/// These notes remain private until the player calls finish_game to reveal totals.
#[derive(Eq, Packable)]
#[note]
pub struct GameRoundNote {
    pub track1: u8,
    pub track2: u8,
    pub track3: u8,
    pub track4: u8,
    pub track5: u8,
    pub round: u8,
    pub owner: AztecAddress,
}

impl GameRoundNote {
    pub fn new(track1: u8, track2: u8, track3: u8, track4: u8, track5: u8, round: u8, owner: AztecAddress) -> Self {
        Self { track1, track2, track3, track4, track5, round, owner }
    }

    pub fn get(self) -> Self {
        Self {
            track1: self.track1,
            track2: self.track2,
            track3: self.track3,
            track4: self.track4,
            track5: self.track5,
            round: self.round,
            owner: self.owner,
        }
    }
}
// docs:end:game-round-note
