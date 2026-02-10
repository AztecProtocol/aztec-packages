use super::utils::get_low_nibble;
use aztec::protocol::traits::{Deserialize, Serialize};

pub struct ExtensionHeader {
    pub is_odd: bool,
    pub first_nibble: u8,
    pub extension_length: u8,
}

#[derive(Serialize, Deserialize)]
pub struct Node {
    pub rows: [[u64; 4]; 16],
    pub row_exist: [bool; 16],
    pub node_type: u8,
}

impl Node {
    #[inline_always]
    pub fn is_branch_node(self) -> bool {
        self.node_type == 0
    }

    #[inline_always]
    pub fn is_extension_node(self) -> bool {
        self.node_type == 1
    }

    #[inline_always]
    pub fn get_row_byte(self, row: u32, byte_index: u32) -> u8 {
        let limb_index = byte_index / 8;
        let shift = ((byte_index % 8) * 8) as u64;
        (self.rows[row][limb_index] >> shift) as u8
    }

    pub fn extract_extension_header(self) -> ExtensionHeader {
        let is_odd = self.rows[0][0] != 0;
        let first_nibble = if is_odd {
            get_low_nibble(self.rows[0][1] as u8)
        } else {
            0
        };
        let extension_length = (self.rows[0][2] as u8);
        ExtensionHeader { is_odd, first_nibble, extension_length }
    }
}

#[derive(Serialize, Deserialize)]
pub struct Account {
    pub nonce: [u8; 8],
    pub balance: [u8; 32],
    pub address: [u8; 20],
    pub nonce_length: u8,
    pub balance_length: u8,
    pub storage_hash: [u64; 4],
    pub code_hash: [u64; 4],
}

#[derive(Serialize, Deserialize)]
pub struct StorageSlot {
    pub value: [u8; 32],
    pub value_length: u8,
}
