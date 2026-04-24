use aztec::{
    oracle::capsules,
    protocol::{
        address::AztecAddress,
        blob_data::TxEffect,
        constants::PRIVATE_LOG_CIPHERTEXT_LEN,
        hash::sha256_to_field,
        traits::{Deserialize, Serialize},
    },
    utils::array::subarray,
};

pub global MAX_EFFECTS: u32 = 10;
// Mirrors MAX_EXITS in yarn-project/end-to-end/src/tee/types.ts. Keep in sync.
pub global MAX_EXITS: u32 = 1;

global TEE_NOTES_DA_COMPONENT_CAPSULE_KEY: Field =
    sha256_to_field("oxideTeeNotesCapsuleKey".as_bytes());
pub global TEE_NOTES_DA_TAG: Field = sha256_to_field("oxideTeeNotes".as_bytes());

global TEE_REQUIRED_NULLIFIERS_DA_COMPONENT_CAPSULE_KEY: Field =
    sha256_to_field("oxideTeeRequiredNullifiersCapsuleKey".as_bytes());
pub global TEE_REQUIRED_NULLIFIERS_DA_TAG: Field =
    sha256_to_field("oxideTeeRequiredNullifiers".as_bytes());

global TEE_METADATA_DA_COMPONENT_CAPSULE_KEY: Field =
    sha256_to_field("oxideTeeMetadataCapsuleKey".as_bytes());
pub global TEE_METADATA_DA_TAG: Field = sha256_to_field("oxideTeeMetadata".as_bytes());

global TEE_EXIT_MESSAGE_HASHES_DA_COMPONENT_CAPSULE_KEY: Field =
    sha256_to_field("oxideTeeExitMessageHashesCapsuleKey".as_bytes());
pub global TEE_EXIT_MESSAGE_HASHES_DA_TAG: Field =
    sha256_to_field("oxideTeeExitMessageHashes".as_bytes());

pub fn to_log_ciphertext<let N: u32>(
    da_tag: Field,
    fields: [Field; N],
) -> [Field; PRIVATE_LOG_CIPHERTEXT_LEN] {
    let mut ciphertext = BoundedVec::new();

    ciphertext.push(da_tag);

    for i in 0..fields.len() {
        ciphertext.push(fields[i]);
    }

    ciphertext.storage()
}

pub unconstrained fn load_tee_notes_da_capsule(address: AztecAddress) -> [Field; MAX_EFFECTS] {
    capsules::load(
        address,
        TEE_NOTES_DA_COMPONENT_CAPSULE_KEY,
        AztecAddress::zero(),
    )
        .unwrap()
}

pub fn extract_tee_notes_da_component(tx_effect: TxEffect) -> Option<[Field; MAX_EFFECTS]> {
    let notes_index = find_tagged_da_component(tx_effect, TEE_NOTES_DA_TAG);
    notes_index.map(|index| subarray(tx_effect.private_logs[index].fields, 2))
}

pub unconstrained fn load_tee_required_nullifiers_da_capsule(
    address: AztecAddress,
) -> [Field; MAX_EFFECTS] {
    capsules::load(
        address,
        TEE_REQUIRED_NULLIFIERS_DA_COMPONENT_CAPSULE_KEY,
        AztecAddress::zero(),
    )
        .unwrap()
}

pub fn extract_tee_required_nullifiers_da_component(
    tx_effect: TxEffect,
) -> Option<[Field; MAX_EFFECTS]> {
    let nullifiers_index = find_tagged_da_component(tx_effect, TEE_REQUIRED_NULLIFIERS_DA_TAG);
    nullifiers_index.map(|index| subarray(tx_effect.private_logs[index].fields, 2))
}

pub unconstrained fn load_tee_exit_message_hashes_da_capsule(
    address: AztecAddress,
) -> [Field; MAX_EXITS] {
    capsules::load(
        address,
        TEE_EXIT_MESSAGE_HASHES_DA_COMPONENT_CAPSULE_KEY,
        AztecAddress::zero(),
    )
        .unwrap()
}

pub fn extract_tee_exit_message_hashes_da_component(
    tx_effect: TxEffect,
) -> Option<[Field; MAX_EXITS]> {
    let exits_index = find_tagged_da_component(tx_effect, TEE_EXIT_MESSAGE_HASHES_DA_TAG);
    exits_index.map(|index| subarray(tx_effect.private_logs[index].fields, 2))
}

#[derive(Deserialize, Eq, Serialize)]
pub struct TEEMetadata {
    pub pub_key_x: Field,
    pub pub_key_y: Field,
    pub anchor_block_hash: Field,
}

pub unconstrained fn load_tee_metadata_da_capsule(address: AztecAddress) -> TEEMetadata {
    capsules::load(
        address,
        TEE_METADATA_DA_COMPONENT_CAPSULE_KEY,
        AztecAddress::zero(),
    )
        .unwrap()
}

pub fn extract_metadata_da_component(tx_effect: TxEffect) -> Option<TEEMetadata> {
    let metadata_index = find_tagged_da_component(tx_effect, TEE_METADATA_DA_TAG);
    metadata_index.map(|index| {
        TEEMetadata::deserialize(subarray(tx_effect.private_logs[index].fields, 2))
    })
}

fn find_tagged_da_component(tx_effect: TxEffect, da_tag: Field) -> Option<u32> {
    aztec::protocol::logging::debug_log_format("Finding tagged DA component: {0}", [da_tag]);
    let mut count = 0;
    let mut index = 0;
    for i in 0..tx_effect.private_logs.len() {
        // da tag is expected at index 1
        if tx_effect.private_logs[i].fields[1] == da_tag {
            count += 1;
            index = i;
        }
    }
    // We don't allow multiple DA components with the same tag.
    if count == 1 {
        Option::some(index)
    } else {
        Option::none()
    }
}
