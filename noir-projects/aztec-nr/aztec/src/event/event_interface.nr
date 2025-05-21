use crate::{
    context::{PrivateContext, PublicContext},
    messages::logs::{event::to_encrypted_private_event_message, utils::prefix_with_tag},
};
use dep::protocol_types::{
    abis::event_selector::EventSelector,
    address::AztecAddress,
    traits::{Serialize, ToField},
};

// TODO(#11571): with decryption happening in Noir we can now use the Packable trait instead.
pub trait EventInterface {
    fn get_event_type_id() -> EventSelector;

    fn emit<Env>(self, _emit: fn[Env](Self) -> ()) {
        _emit(self);
    }

    fn emit_in_private_log<let N: u32>(
        self,
        context: &mut PrivateContext,
        sender: AztecAddress,
        recipient: AztecAddress,
    )
    where
        Self: Serialize<N>,
    {
        let ciphertext = to_encrypted_private_event_message(self, recipient);
        let log_content = prefix_with_tag(ciphertext, sender, recipient);

        context.emit_private_log(log_content, log_content.len());
    }

    fn emit_in_public_log<let N: u32>(self, context: &mut PublicContext)
    where
        Self: Serialize<N>,
    {
        let mut log_content = [0; N + 1];

        let serialized_event = self.serialize();
        for i in 0..serialized_event.len() {
            log_content[i] = serialized_event[i];
        }

        // We put the selector in the "last" place, to avoid reading or assigning to an expression in an index
        log_content[serialized_event.len()] = Self::get_event_type_id().to_field();

        context.emit_public_log(log_content);
    }
}
