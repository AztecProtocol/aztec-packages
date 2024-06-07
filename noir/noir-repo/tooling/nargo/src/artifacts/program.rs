use std::collections::BTreeMap;

use acvm::acir::circuit::Program;
use acvm::FieldElement;
use codespan_reporting::files::{Error, Files, SimpleFile};
use fm::FileId;
use fm::PathString;
use noirc_abi::Abi;
use noirc_driver::CompiledProgram;
use noirc_driver::DebugFile;
use noirc_errors::debug_info::ProgramDebugInfo;
use serde::{Deserialize, Serialize};
use std::ops::Range;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ProgramArtifact {
    pub noir_version: String,

    /// Hash of the [`Program`][noirc_frontend::monomorphization::ast::Program] from which this [`ProgramArtifact`]
    /// was compiled.
    ///
    /// Used to short-circuit compilation in the case of the source code not changing since the last compilation.
    pub hash: u64,

    pub abi: Abi,

    #[serde(
        serialize_with = "Program::serialize_program_base64",
        deserialize_with = "Program::deserialize_program_base64"
    )]
    pub bytecode: Program<FieldElement>,

    #[serde(
        serialize_with = "ProgramDebugInfo::serialize_compressed_base64_json",
        deserialize_with = "ProgramDebugInfo::deserialize_compressed_base64_json"
    )]
    pub debug_symbols: ProgramDebugInfo,

    /// Map of file Id to the source code so locations in debug info can be mapped to source code they point to.
    pub file_map: BTreeMap<FileId, DebugFile>,

    pub names: Vec<String>,
}

impl From<CompiledProgram> for ProgramArtifact {
    fn from(compiled_program: CompiledProgram) -> Self {
        ProgramArtifact {
            hash: compiled_program.hash,
            abi: compiled_program.abi,
            noir_version: compiled_program.noir_version,
            bytecode: compiled_program.program,
            debug_symbols: ProgramDebugInfo { debug_infos: compiled_program.debug },
            file_map: compiled_program.file_map,
            names: compiled_program.names,
        }
    }
}

impl From<ProgramArtifact> for CompiledProgram {
    fn from(program: ProgramArtifact) -> Self {
        CompiledProgram {
            hash: program.hash,
            abi: program.abi,
            noir_version: program.noir_version,
            program: program.bytecode,
            debug: program.debug_symbols.debug_infos,
            file_map: program.file_map,
            warnings: vec![],
            names: program.names,
        }
    }
}

impl<'a> Files<'a> for ProgramArtifact {
    type FileId = FileId;
    type Name = PathString;
    type Source = &'a str;

    fn name(&self, file_id: Self::FileId) -> Result<Self::Name, Error> {
        self.file_map.get(&file_id).ok_or(Error::FileMissing).map(|file| file.path.clone().into())
    }

    fn source(&'a self, file_id: Self::FileId) -> Result<Self::Source, Error> {
        self.file_map.get(&file_id).ok_or(Error::FileMissing).map(|file| file.source.as_ref())
    }

    fn line_index(&self, file_id: Self::FileId, byte_index: usize) -> Result<usize, Error> {
        self.file_map.get(&file_id).ok_or(Error::FileMissing).and_then(|file| {
            SimpleFile::new(PathString::from(file.path.clone()), file.source.clone())
                .line_index((), byte_index)
        })
    }

    fn line_range(&self, file_id: Self::FileId, line_index: usize) -> Result<Range<usize>, Error> {
        self.file_map.get(&file_id).ok_or(Error::FileMissing).and_then(|file| {
            SimpleFile::new(PathString::from(file.path.clone()), file.source.clone())
                .line_range((), line_index)
        })
    }
}
