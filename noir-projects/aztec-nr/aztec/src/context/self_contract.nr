use crate::{
    context::{
        call_interfaces::{PrivateCallInterface, PublicCallInterface, PublicStaticCallInterface},
        private_context::PrivateContext,
        public_context::PublicContext,
        utility_context::UtilityContext,
    },
    event::{
        event_emission::{emit_event_in_private, emit_event_in_public},
        event_interface::EventInterface,
    },
};
use protocol_types::{address::AztecAddress, traits::{Deserialize, Serialize}};

pub struct SelfContract<Context> {
    context: Context,
}

impl<Context> SelfContract<Context> {
    pub fn new(context: Context) -> Self {
        SelfContract { context }
    }
}

impl SelfContract<&mut PrivateContext> {
    pub fn msg_sender(self) -> AztecAddress {
        self.context.msg_sender()
    }

    pub fn address(self) -> AztecAddress {
        self.context.this_address()
    }

    pub fn call<T, let M: u32>(self, call_interface: PrivateCallInterface<M, T>) -> T
    where
        T: Deserialize,
    {
        call_interface.call(self.context)
    }

    pub fn enqueue<T, let M: u32>(self, call_interface: PublicCallInterface<M, T>)
    where
        T: Deserialize,
    {
        call_interface.enqueue(self.context)
    }

    pub fn emit_event<Event>(self, event: Event, recipient: AztecAddress, delivery_mode: u8)
    where
        Event: EventInterface + Serialize,
    {
        emit_event_in_private(event, self.context, recipient, delivery_mode);
    }
    // aztec-nr does not know about the router contract (because the router contract depends on aztec-nr)
    // pub fn check_timestamp(self, operation: u8, value: u64) {
    //     privately_check_timestamp(operation, value, self.context);
    // }
    // pub fn check_block_number(self, operation: u8, value: u32) {
    //     privately_check_block_number(operation, value, self.context);
    // }
}

impl SelfContract<PublicContext> {
    pub fn msg_sender(self) -> AztecAddress {
        self.context.msg_sender()
    }

    pub fn address(self) -> AztecAddress {
        self.context.this_address()
    }

    pub unconstrained fn call<T, let M: u32>(self, call_interface: PublicCallInterface<M, T>) -> T
    where
        T: Deserialize,
    {
        let mut ctx = self.context;
        call_interface.call(&mut ctx)
    }

    pub unconstrained fn view<T, let M: u32>(
        self,
        call_interface: PublicStaticCallInterface<M, T>,
    ) -> T
    where
        T: Deserialize,
    {
        let mut ctx = self.context;
        call_interface.view(&mut ctx)
    }

    pub fn emit_event<Event>(self, event: Event)
    where
        Event: EventInterface + Serialize,
    {
        let mut ctx = self.context;
        emit_event_in_public(event, &mut ctx);
    }
}

impl SelfContract<UtilityContext> {
    pub fn address(self) -> AztecAddress {
        self.context.this_address()
    }
}
