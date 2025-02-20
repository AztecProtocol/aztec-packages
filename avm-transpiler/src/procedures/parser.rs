use crate::instructions::AvmTypeTag;
use once_cell::sync::Lazy;
use regex::Regex;

#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Copy)]
pub(crate) enum Mnemonic {
    // Compute
    ADD,
    SUB,
    MUL,
    DIV,
    FDIV,
    EQ,
    LT,
    LTE,
    AND,
    OR,
    XOR,
    NOT,
    SHL,
    SHR,
    CAST,
    // Control flow
    JUMP,
    JUMPI,
    // Memory
    SET,
    MOV,
    // Misc
    INTERNALRETURN,
    ECADD,
    TORADIXBE,
}

impl Mnemonic {
    fn lookup(as_string: &str) -> Mnemonic {
        match as_string {
            "ADD" => Mnemonic::ADD,
            "SUB" => Mnemonic::SUB,
            "MUL" => Mnemonic::MUL,
            "DIV" => Mnemonic::DIV,
            "FDIV" => Mnemonic::FDIV,
            "EQ" => Mnemonic::EQ,
            "LT" => Mnemonic::LT,
            "LTE" => Mnemonic::LTE,
            "AND" => Mnemonic::AND,
            "OR" => Mnemonic::OR,
            "XOR" => Mnemonic::XOR,
            "NOT" => Mnemonic::NOT,
            "SHL" => Mnemonic::SHL,
            "SHR" => Mnemonic::SHR,
            "CAST" => Mnemonic::CAST,
            "JUMP" => Mnemonic::JUMP,
            "JUMPI" => Mnemonic::JUMPI,
            "INTERNALRETURN" => Mnemonic::INTERNALRETURN,
            "SET" => Mnemonic::SET,
            "MOV" => Mnemonic::MOV,
            "ECADD" => Mnemonic::ECADD,
            "TORADIXBE" => Mnemonic::TORADIXBE,
            _ => unreachable!("Invalid mnemonic {}", as_string),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) struct Label {
    inner: String,
}

impl Label {
    fn new(inner: String) -> Self {
        Label { inner }
    }
}

#[derive(Debug, Clone)]
pub(crate) enum Symbol {
    Direct(usize),
    Indirect(usize),
    Reserved(usize),
    Label(Label),
}

#[derive(Debug, Clone)]
pub(crate) enum Operand {
    Symbol(Symbol),
    Immediate(u128),
}

#[derive(Debug, Clone)]
pub(crate) struct ParsedOpcode {
    pub(crate) mnemonic: Mnemonic,
    pub(crate) operands: Vec<Operand>,
    pub(crate) tag: Option<AvmTypeTag>,
    pub(crate) label: Option<Label>,
}

// Simple regex parser
pub(crate) fn parse(assembly: &str) -> Result<Vec<ParsedOpcode>, String> {
    // Strip out comments, then remove empty lines
    static COMMENT_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r";.*|\/\*.*?\*\/").unwrap());

    let assembly: Vec<_> = assembly
        .lines()
        .map(|line| COMMENT_REGEX.replace_all(line, "").trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    static LINE_REGEX: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"^(?:(?<label>\w+):\s+)?(?<mnemonic>\w+)(?:\s+(?<operands>.+?))?(?:\s+(?<tag>u1|u8|u16|u32|u64|u128|ff))?$").unwrap()
    });

    assembly
        .into_iter()
        .map(|line: String| {
            let Some(caps) = LINE_REGEX.captures(&line) else {
                return Err(format!("Line `{}` is invalid", line));
            };

            let label = caps.name("label").map(|m| Label::new(m.as_str().to_string()));

            let mnemonic = Mnemonic::lookup(
                caps.name("mnemonic")
                    .map(|m| m.as_str())
                    .ok_or_else(|| format!("Missing opcode mnemonic in line `{}`", line))?,
            );

            let operands = caps.name("operands").map(|m| m.as_str());
            let operands =
                parse_operands(operands.unwrap_or("")).map_err(|operand_parsing_err| {
                    format!("Error parsing operands for line `{}`: {}", line, operand_parsing_err)
                })?;

            let tag = caps.name("tag").map(|m| parse_tag(m.as_str()));

            Ok(ParsedOpcode { mnemonic, label, operands, tag })
        })
        .collect::<Result<Vec<_>, _>>()
}

fn parse_operands(operands: &str) -> Result<Vec<Operand>, String> {
    static OPERAND_REGEX: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"^\$(?<reserved>\d+)|^d(?<direct>\d+)|^i(?<indirect>\d+)|^(?<immediate>\d+)|^(?<label>\w*)$").unwrap()
    });
    // Split by comma, then trim whitespace
    operands
        .split(',')
        .map(|operand| operand.trim())
        .filter(|operand| !operand.is_empty())
        .map(|operand| {
            let Some(caps) = OPERAND_REGEX.captures(operand) else {
                return Err(format!("Operand `{}` is invalid", operand));
            };
            if let Some(reserved) = caps.name("reserved") {
                Ok(Operand::Symbol(Symbol::Reserved(reserved.as_str().parse().unwrap())))
            } else if let Some(direct) = caps.name("direct") {
                Ok(Operand::Symbol(Symbol::Direct(direct.as_str().parse().unwrap())))
            } else if let Some(indirect) = caps.name("indirect") {
                Ok(Operand::Symbol(Symbol::Indirect(indirect.as_str().parse().unwrap())))
            } else if let Some(immediate) = caps.name("immediate") {
                Ok(Operand::Immediate(immediate.as_str().parse().unwrap()))
            } else if let Some(label) = caps.name("label") {
                Ok(Operand::Symbol(Symbol::Label(Label::new(label.as_str().to_string()))))
            } else {
                unreachable!("Regex should have matched one of the groups")
            }
        })
        .collect()
}

fn parse_tag(tag_as_string: &str) -> AvmTypeTag {
    match tag_as_string {
        "u1" => AvmTypeTag::UINT1,
        "u8" => AvmTypeTag::UINT8,
        "u16" => AvmTypeTag::UINT16,
        "u32" => AvmTypeTag::UINT32,
        "u64" => AvmTypeTag::UINT64,
        "u128" => AvmTypeTag::UINT128,
        "ff" => AvmTypeTag::FIELD,
        _ => unreachable!("Invalid tag {}", tag_as_string),
    }
}
