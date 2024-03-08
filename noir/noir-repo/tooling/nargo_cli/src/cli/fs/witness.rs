use std::path::{Path, PathBuf};

use acvm::acir::native_types::{WitnessMap, WitnessStack};
use nargo::constants::WITNESS_EXT;

use super::{create_named_dir, write_to_file};
use crate::errors::FilesystemError;

pub(crate) fn save_witness_to_dir<P: AsRef<Path>>(
    witnesses: WitnessMap,
    witness_name: &str,
    witness_dir: P,
) -> Result<PathBuf, FilesystemError> {
    create_named_dir(witness_dir.as_ref(), "witness");
    let witness_path = witness_dir.as_ref().join(witness_name).with_extension(WITNESS_EXT);
    dbg!(witnesses.clone());
    // TODO(https://github.com/noir-lang/noir/issues/4428)
    let witness_stack: WitnessStack = witnesses.into();
    let buf: Vec<u8> = witness_stack.try_into()?;
    // let x = vec![
    //     31, 139, 8, 0, 0, 0, 0, 0, 2, 255, 173, 206, 185, 13, 0, 48, 8, 67, 209, 144, 107, 30, 146,
    //     44, 144, 253, 167, 162, 65, 130, 158, 239, 198, 174, 158, 44, 45, 178, 211, 254, 222, 90,
    //     203, 17, 206, 186, 29, 252, 53, 64, 107, 114, 150, 46, 206, 122, 6, 24, 73, 44, 193, 220,
    //     1, 0, 0,
    // ];
    write_to_file(buf.as_slice(), &witness_path);

    Ok(witness_path)
}
