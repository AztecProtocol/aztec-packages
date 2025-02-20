use crate::instructions::AvmTypeTag;
use once_cell::sync::Lazy;
use regex::Regex;

#[allow(clippy::upper_case_acronyms)]
#[derive(Debug, Clone, Copy)]
pub(crate) enum Alias {
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

impl Alias {
    fn lookup(as_string: &str) -> Alias {
        match as_string {
            "ADD" => Alias::ADD,
            "SUB" => Alias::SUB,
            "MUL" => Alias::MUL,
            "DIV" => Alias::DIV,
            "FDIV" => Alias::FDIV,
            "EQ" => Alias::EQ,
            "LT" => Alias::LT,
            "LTE" => Alias::LTE,
            "AND" => Alias::AND,
            "OR" => Alias::OR,
            "XOR" => Alias::XOR,
            "NOT" => Alias::NOT,
            "SHL" => Alias::SHL,
            "SHR" => Alias::SHR,
            "CAST" => Alias::CAST,
            "JUMP" => Alias::JUMP,
            "JUMPI" => Alias::JUMPI,
            "INTERNALRETURN" => Alias::INTERNALRETURN,
            "SET" => Alias::SET,
            "MOV" => Alias::MOV,
            "ECADD" => Alias::ECADD,
            "TORADIXBE" => Alias::TORADIXBE,
            _ => unreachable!("Invalid alias {}", as_string),
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) enum Symbol {
    Direct(usize),
    Indirect(usize),
    Reserved(usize),
    Label(String),
}

#[derive(Debug, Clone)]
pub(crate) enum Operand {
    Symbol(Symbol),
    Immediate(u128),
}

#[derive(Debug, Clone)]
pub(crate) struct ParsedOpcode {
    pub(crate) alias: Alias,
    pub(crate) operands: Vec<Operand>,
    pub(crate) tag: Option<AvmTypeTag>,
    pub(crate) label: Option<String>,
}

pub(crate) type Assembly = Vec<ParsedOpcode>;

// Simple regex parser
pub(crate) fn parse(assembly: &str) -> Result<Assembly, String> {
    // Strip out comments, then remove empty lines
    static COMMENT_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r";.*|\/\*.*?\*\/").unwrap());

    let assembly: Vec<_> = assembly
        .lines()
        .map(|line| COMMENT_REGEX.replace_all(line, "").trim().to_string())
        .filter(|line| !line.is_empty())
        .collect();

    static LINE_REGEX: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"^(?:(?<label>\w+):\s+)?(?<alias>\w+)(?:\s+(?<operands>.+?))?(?:\s+(?<tag>u1|u8|u16|u32|u64|u128|ff))?$").unwrap()
    });

    assembly
        .into_iter()
        .map(|line: String| {
            let Some(caps) = LINE_REGEX.captures(&line) else {
                return Err(format!("Line `{}` is invalid", line));
            };

            let label = caps.name("label").map(|m| m.as_str().to_string());

            let alias = Alias::lookup(
                caps.name("alias")
                    .map(|m| m.as_str())
                    .ok_or_else(|| format!("Missing opcode alias in line `{}`", line))?,
            );

            let operands = caps.name("operands").map(|m| m.as_str());
            let operands =
                parse_operands(operands.unwrap_or("")).map_err(|operand_parsing_err| {
                    format!("Error parsing operands for line `{}`: {}", line, operand_parsing_err)
                })?;

            let tag = caps.name("tag").map(|m| parse_tag(m.as_str()));

            Ok(ParsedOpcode { alias, label, operands, tag })
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
                Ok(Operand::Symbol(Symbol::Label(label.as_str().to_string())))
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
