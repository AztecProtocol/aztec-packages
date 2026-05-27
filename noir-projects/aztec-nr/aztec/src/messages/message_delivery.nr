//! Compatibility wrapper for the legacy `messages::message_delivery` path.

pub use crate::messages::delivery::{
    ConstrainedDelivery,
    MessageDelivery,
    do_private_message_delivery,
};
