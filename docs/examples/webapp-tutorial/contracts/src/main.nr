// Pod Racing Game Contract
//
// A two-player competitive racing game where players allocate points across 5 tracks
// over multiple rounds. The game flow:
// 1. Player 1 creates a game with a time limit
// 2. Player 2 joins the game
// 3. Both players play rounds privately (allocating points across tracks)
// 4. After all rounds, players reveal their total scores per track
// 5. Winner is determined by who won more tracks (best of 5)
//
// Key mechanics:
// - Each round, players distribute up to 9 points across 5 tracks
// - Round choices are private until the finish phase
// - The player with higher total points on a track wins that track
// - The player who wins 3+ tracks wins the game

mod game_round_note;
mod race;

use aztec::macros::aztec;

#[aztec]
pub contract PodRacing {
    use aztec::{
        macros::{functions::{external, initializer, only_self}, storage::storage},
        messages::delivery::MessageDelivery,
        note::note_getter_options::NoteGetterOptions,
    };
    use aztec::protocol::address::AztecAddress;
    use aztec::state_vars::{Map, Owned, PrivateSet, PublicMutable};

    use crate::{game_round_note::GameRoundNote, race::Race};

    global TOTAL_ROUNDS: u8 = 3;
    global GAME_LENGTH: u32 = 2; // Set to 2 for demo purposes

    // docs:start:storage
    #[storage]
    struct Storage<Context> {
        admin: PublicMutable<AztecAddress, Context>,
        races: Map<Field, PublicMutable<Race, Context>, Context>,
        progress: Map<Field, Owned<PrivateSet<GameRoundNote, Context>, Context>, Context>,
        win_history: Map<AztecAddress, PublicMutable<u64, Context>, Context>,
    }
    // docs:end:storage

    #[external("public")]
    #[initializer]
    fn constructor(admin: AztecAddress) {
        self.storage.admin.write(admin);
    }

    // docs:start:create-game
    #[external("public")]
    fn create_game(game_id: Field) {
        assert(self.storage.races.at(game_id).read().player1.eq(AztecAddress::zero()));
        let game = Race::new(
            self.msg_sender(),
            TOTAL_ROUNDS,
            self.context.block_number() + GAME_LENGTH,
        );
        self.storage.races.at(game_id).write(game);
    }
    // docs:end:create-game

    // docs:start:join-game
    #[external("public")]
    fn join_game(game_id: Field) {
        let maybe_existing_game = self.storage.races.at(game_id).read();
        let joined_game = maybe_existing_game.join(self.msg_sender());
        self.storage.races.at(game_id).write(joined_game);
    }
    // docs:end:join-game

    // docs:start:play-round
    /// Allocates points across 5 tracks for a round.
    /// This is a PRIVATE function - the allocation remains hidden from the opponent.
    #[external("private")]
    fn play_round(
        game_id: Field,
        round: u8,
        track1: u8,
        track2: u8,
        track3: u8,
        track4: u8,
        track5: u8,
    ) {
        assert(track1 + track2 + track3 + track4 + track5 < 10);

        let player = self.msg_sender();

        self
            .storage
            .progress
            .at(game_id)
            .at(player)
            .insert(GameRoundNote::new(track1, track2, track3, track4, track5, round, player))
            .deliver(MessageDelivery::onchain_constrained());

        self.enqueue(PodRacing::at(self.context.this_address()).validate_and_play_round(
            player,
            game_id,
            round,
        ));
    }
    // docs:end:play-round

    #[external("public")]
    #[only_self]
    fn validate_and_play_round(player: AztecAddress, game_id: Field, round: u8) {
        let game_in_progress = self.storage.races.at(game_id).read();
        self.storage.races.at(game_id).write(game_in_progress.increment_player_round(player, round));
    }

    // docs:start:finish-game
    /// Reveals a player's total scores per track.
    /// Reads private round notes and publishes aggregated totals.
    #[external("private")]
    fn finish_game(game_id: Field) {
        let player = self.msg_sender();
        let totals =
            self.storage.progress.at(game_id).at(player).get_notes(NoteGetterOptions::new());

        let mut total_track1: u64 = 0;
        let mut total_track2: u64 = 0;
        let mut total_track3: u64 = 0;
        let mut total_track4: u64 = 0;
        let mut total_track5: u64 = 0;

        for i in 0..TOTAL_ROUNDS {
            total_track1 += totals.get(i as u32).note.track1 as u64;
            total_track2 += totals.get(i as u32).note.track2 as u64;
            total_track3 += totals.get(i as u32).note.track3 as u64;
            total_track4 += totals.get(i as u32).note.track4 as u64;
            total_track5 += totals.get(i as u32).note.track5 as u64;
        }

        self.enqueue(PodRacing::at(self.context.this_address()).validate_finish_game_and_reveal(
            player,
            game_id,
            total_track1,
            total_track2,
            total_track3,
            total_track4,
            total_track5,
        ));
    }
    // docs:end:finish-game

    #[external("public")]
    #[only_self]
    fn validate_finish_game_and_reveal(
        player: AztecAddress,
        game_id: Field,
        total_track1: u64,
        total_track2: u64,
        total_track3: u64,
        total_track4: u64,
        total_track5: u64,
    ) {
        let game_in_progress = self.storage.races.at(game_id).read();
        self.storage.races.at(game_id).write(game_in_progress.set_player_scores(
            player,
            total_track1,
            total_track2,
            total_track3,
            total_track4,
            total_track5,
        ));
    }

    // docs:start:finalize-game
    /// Determines the winner after both players have revealed and the game has expired.
    #[external("public")]
    fn finalize_game(game_id: Field) {
        let game_in_progress = self.storage.races.at(game_id).read();
        let winner = game_in_progress.calculate_winner(self.context.block_number());
        let previous_wins = self.storage.win_history.at(winner).read();
        self.storage.win_history.at(winner).write(previous_wins + 1);
    }
    // docs:end:finalize-game
}
