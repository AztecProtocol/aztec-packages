use dep::protocol_types::abis::event_selector::EventSelector;

trait EventInterface<let N: u32> {
    fn private_to_be_bytes(self, randomness: Field) -> [u8; N * 32 + 64];
    fn to_be_bytes(self) -> [u8; N * 32 + 32];
    fn get_event_type_id() -> EventSelector;
    fn emit<Env>(self, _emit: fn[Env](Self) -> ());
}
