use std::collections::HashMap;
use std::sync::{LazyLock, Mutex, OnceLock};
use std::time::Duration;

use anyhow::anyhow;
use log::debug;
use regex::Regex;
use rsbash::rash;
use serde_json::json;

static RE_SINGLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Simulation result:\s+(\d+)n").unwrap());
static RE_PAIR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)Simulation result:\s+\[\s*(\d+)n\s*,\s*(\d+)n\s*\]").unwrap()
});
static RE_DEPLOYED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Contract deployed at (0x[0-9a-fA-F]+)").unwrap());

// ---------------------------------------------------------------------------
// Address Book — the fuzzer's own tally of account and contract addresses
// ---------------------------------------------------------------------------

struct ContractInfo {
    address: String,
    artifact: String,
}

struct AddressBook {
    /// Hex addresses indexed by AccountId (0, 1, 2, …).
    accounts: Vec<String>,
    /// Contract alias (e.g. "test0", "parent0", "token0") → info.
    contracts: HashMap<String, ContractInfo>,
}

impl AddressBook {
    fn new() -> Self {
        Self {
            accounts: Vec::new(),
            contracts: HashMap::new(),
        }
    }

    /// Resolve an alias like `accounts:test0` or `contracts:test0` to a hex
    /// address.  Non-alias strings (plain numbers, hex addresses) pass through.
    fn resolve(&self, alias: &str) -> String {
        if let Some(rest) = alias.strip_prefix("accounts:test") {
            if let Ok(id) = rest.parse::<usize>() {
                if let Some(addr) = self.accounts.get(id) {
                    return addr.clone();
                }
            }
        }
        if let Some(name) = alias.strip_prefix("contracts:") {
            if let Some(info) = self.contracts.get(name) {
                return info.address.clone();
            }
        }
        alias.to_string()
    }

    /// Get the artifact path for a contract by its alias (with or without the
    /// `contracts:` prefix).
    fn artifact_for(&self, contract_alias: &str) -> Option<String> {
        let name = contract_alias
            .strip_prefix("contracts:")
            .unwrap_or(contract_alias);
        self.contracts.get(name).map(|c| c.artifact.clone())
    }
}

static ADDRESS_BOOK: LazyLock<Mutex<AddressBook>> =
    LazyLock::new(|| Mutex::new(AddressBook::new()));

fn parse_deployed_address(stdout: &str) -> Option<String> {
    RE_DEPLOYED
        .captures(stdout)
        .map(|c| c[1].to_string())
}

// ---------------------------------------------------------------------------
// Bridge configuration
// ---------------------------------------------------------------------------

/// Set by `init()` from main. `Some(url)` = bridge mode, `None` = CLI mode.
static BRIDGE_URL: OnceLock<Option<String>> = OnceLock::new();
/// Client-side proof generation.  Set once by `init()`.
static PROVE: OnceLock<bool> = OnceLock::new();

/// Initialise the wallet connection mode.  Must be called once before any
/// wallet operations.  `bridge_url = Some("http://…")` for bridge mode,
/// `None` for CLI mode.
pub fn init(bridge_url: Option<String>, prove: bool) {
    BRIDGE_URL
        .set(bridge_url)
        .expect("wallet::init called more than once");
    PROVE.set(prove).expect("wallet::init called more than once");
}

/// Like `init`, but silently ignores duplicate calls (for tests).
#[cfg(test)]
pub fn try_init(bridge_url: Option<String>) {
    let _ = BRIDGE_URL.set(bridge_url);
    let _ = PROVE.set(false);
}

fn bridge_url() -> Option<&'static str> {
    BRIDGE_URL
        .get()
        .expect("wallet::init was not called")
        .as_deref()
}

fn prove_enabled() -> bool {
    *PROVE.get().expect("wallet::init was not called")
}

static HTTP_CLIENT: LazyLock<reqwest::blocking::Client> = LazyLock::new(|| {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .expect("failed to create HTTP client")
});

/// POST JSON to the bridge and return the parsed response.
/// Errors if the bridge returns `{ ok: false, error: "..." }`.
fn bridge_post(endpoint: &str, body: &serde_json::Value) -> anyhow::Result<serde_json::Value> {
    let url = bridge_url().ok_or_else(|| anyhow!("bridge not configured"))?;
    let resp = HTTP_CLIENT
        .post(format!("{url}{endpoint}"))
        .json(body)
        .send()
        .map_err(|e| anyhow!("bridge request to {endpoint} failed: {e}"))?;
    let status = resp.status();
    let result: serde_json::Value = resp
        .json()
        .map_err(|e| anyhow!("bridge returned non-JSON (HTTP {status}): {e}"))?;
    if result["ok"].as_bool() == Some(true) {
        Ok(result)
    } else {
        Err(anyhow!(
            "{}",
            result["error"].as_str().unwrap_or("unknown bridge error")
        ))
    }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

pub(crate) type AccountId = usize;

pub struct WalletCommand {
    pub verb: String,
    pub method: String,
    pub contract: String,
    pub from: String,
    pub args: Vec<String>,
}

// ---------------------------------------------------------------------------
// Public API — dispatches to bridge (default) or CLI
// ---------------------------------------------------------------------------

/// Check that the configured backend (bridge or CLI) is reachable.
/// Returns an error with a human-readable message if not.
pub fn check_connection() -> anyhow::Result<()> {
    if let Some(url) = bridge_url() {
        let resp = HTTP_CLIENT
            .get(format!("{url}/health"))
            .timeout(Duration::from_secs(5))
            .send()
            .map_err(|_| anyhow!(
                "Bridge not reachable at {url}.\n\
                 Start it with: bash setup-nightly-sandbox.sh\n\
                 Or use --connection cli to fall back to the CLI wallet."
            ))?;
        if resp.status().is_success() {
            debug!("bridge health check OK ({url})");
            Ok(())
        } else {
            Err(anyhow!("Bridge returned HTTP {} on /health", resp.status()))
        }
    } else {
        let (ret, _stdout, stderr) = rash!("aztec-wallet --version")
            .map_err(|_| anyhow!(
                "aztec-wallet not found on PATH.\n\
                 Make sure ~/.local/bin is on your PATH, or use --connection bridge."
            ))?;
        if ret != 0 {
            return Err(anyhow!(
                "aztec-wallet exited with code {ret}.\nstderr: {stderr}"
            ));
        }
        debug!("CLI wallet check OK");
        Ok(())
    }
}

/// Execute an aztec-wallet command and return stdout.
pub fn execute(cmd: &WalletCommand) -> anyhow::Result<String> {
    if bridge_url().is_some() {
        return bridge_execute(cmd);
    }
    cli_execute(cmd)
}

/// Import the 3 deterministic test accounts into the wallet.
pub fn import_test_accounts() -> anyhow::Result<()> {
    if bridge_url().is_some() {
        return bridge_import_test_accounts();
    }
    cli_import_test_accounts()
}

/// Deploy a contract artifact with optional `--init` and `--args`, plus an
/// alias for the address book.
pub fn deploy(
    artifact: &str,
    from: &str,
    alias: &str,
    init: Option<&str>,
    args: Option<&str>,
) -> anyhow::Result<String> {
    if bridge_url().is_some() {
        return bridge_deploy(artifact, from, alias, init, args);
    }
    cli_deploy(artifact, from, alias, init, args)
}

// ---------------------------------------------------------------------------
// Bridge implementations
// ---------------------------------------------------------------------------

fn bridge_import_test_accounts() -> anyhow::Result<()> {
    debug!("bridge POST /import-test-accounts");
    let result = bridge_post("/import-test-accounts", &json!({ "prove": prove_enabled() }))?;

    if let Some(accounts) = result["accounts"].as_array() {
        let mut book = ADDRESS_BOOK.lock().unwrap();
        book.accounts = accounts
            .iter()
            .filter_map(|a| a.as_str().map(String::from))
            .collect();
        for (i, addr) in book.accounts.iter().enumerate() {
            debug!("  accounts:test{i} = {addr}");
        }
    }

    Ok(())
}

fn bridge_deploy(
    artifact: &str,
    from: &str,
    alias: &str,
    init: Option<&str>,
    args: Option<&str>,
) -> anyhow::Result<String> {
    // Resolve aliases in `from` and `args` using the address book
    let book = ADDRESS_BOOK.lock().unwrap();
    let resolved_from = book.resolve(from);
    let resolved_args: Option<Vec<String>> = args.map(|a| {
        a.split_whitespace()
            .map(|arg| book.resolve(arg))
            .collect()
    });
    drop(book);

    let body = json!({
        "artifact": artifact,
        "from": resolved_from,
        "init": init,
        "args": resolved_args,
    });
    debug!("bridge POST /deploy {}", body);
    let result = bridge_post("/deploy", &body)?;
    let stdout = result["stdout"].as_str().unwrap_or("").to_string();

    // Store the deployed contract in our address book
    let address = result["address"]
        .as_str()
        .ok_or_else(|| anyhow!("bridge deploy response missing 'address'"))?;
    {
        let mut book = ADDRESS_BOOK.lock().unwrap();
        book.contracts.insert(
            alias.to_string(),
            ContractInfo {
                address: address.to_string(),
                artifact: artifact.to_string(),
            },
        );
        debug!("  contracts:{alias} = {address}  artifact={artifact}");
    }

    debug!("bridge deploy stdout: {stdout}");
    Ok(stdout)
}

fn bridge_execute(cmd: &WalletCommand) -> anyhow::Result<String> {
    let book = ADDRESS_BOOK.lock().unwrap();
    let resolved_from = book.resolve(&cmd.from);
    let resolved_contract = book.resolve(&cmd.contract);
    let resolved_args: Vec<String> = cmd.args.iter().map(|a| book.resolve(a)).collect();
    let artifact = book
        .artifact_for(&cmd.contract)
        .ok_or_else(|| anyhow!("no artifact for contract {}", cmd.contract))?;
    drop(book);

    let body = json!({
        "verb": cmd.verb,
        "method": cmd.method,
        "contract": resolved_contract,
        "from": resolved_from,
        "args": resolved_args,
        "artifact": artifact,
        "prove": prove_enabled(),
    });
    debug!("bridge POST /execute {}", body);
    let result = bridge_post("/execute", &body)?;
    let stdout = result["stdout"].as_str().unwrap_or("").to_string();
    debug!("bridge execute stdout: {stdout}");
    Ok(stdout)
}

// ---------------------------------------------------------------------------
// CLI implementations (fallback when BRIDGE_URL=none)
// ---------------------------------------------------------------------------

fn cli_run(cmd: &str) -> anyhow::Result<(String, String)> {
    let (ret, stdout, stderr) = rash!(cmd)?;
    if ret != 0 {
        return Err(anyhow!(
            "Command failed with exit code {ret}: {cmd}\nstderr: {stderr}"
        ));
    }
    Ok((stdout, stderr))
}

fn cli_execute(cmd: &WalletCommand) -> anyhow::Result<String> {
    let args = cmd.args.join(" ");
    let prove_flag = if prove_enabled() { "-p native" } else { "-p none" };
    let mut syscmd = format!(
        "aztec-wallet {prove_flag} {} {} --from {} \
        --contract-address {}",
        cmd.verb, cmd.method, cmd.from, cmd.contract
    );
    if !cmd.args.is_empty() {
        syscmd.push_str(&format!(" --args {args}"));
    }
    debug!("{syscmd}");
    let (stdout, _stderr) = cli_run(&syscmd)?;
    debug!("stdout: {stdout}");
    Ok(stdout)
}

fn cli_import_test_accounts() -> anyhow::Result<()> {
    debug!("Running import-test-accounts (CLI)");
    let (ret, _stdout, stderr) = rash!("aztec-wallet import-test-accounts")?;
    if ret != 0 {
        if stderr.contains("ECONNREFUSED") {
            return Err(anyhow!(
                "Could not connect to the Aztec sandbox. Is it running?\n\
                Start it with: aztec start --sandbox"
            ));
        }
        return Err(anyhow!(
            "import-test-accounts failed with exit code {ret}\nstderr: {stderr}"
        ));
    }
    Ok(())
}

fn cli_deploy(
    artifact: &str,
    from: &str,
    alias: &str,
    init: Option<&str>,
    args: Option<&str>,
) -> anyhow::Result<String> {
    let mut cmd = format!("aztec-wallet deploy {artifact} --from {from} --alias {alias}");
    if let Some(init) = init {
        cmd.push_str(&format!(" --init {init}"));
    }
    if let Some(args) = args {
        cmd.push_str(&format!(" --args {args}"));
    }
    let (stdout, _stderr) = cli_run(&cmd)?;

    // Store deployed address in our address book
    if let Some(address) = parse_deployed_address(&stdout) {
        let mut book = ADDRESS_BOOK.lock().unwrap();
        book.contracts.insert(
            alias.to_string(),
            ContractInfo {
                address: address.clone(),
                artifact: artifact.to_string(),
            },
        );
        debug!("  contracts:{alias} = {address}  artifact={artifact}");
    }

    debug!("Deploy stdout: {stdout}");
    Ok(stdout)
}

// ---------------------------------------------------------------------------
// Parsing helpers (shared by both backends)
// ---------------------------------------------------------------------------

/// Parse "Simulation result:  12345n" -> Some(12345)
pub fn parse_simulation_result(stdout: &str) -> Option<u128> {
    RE_SINGLE.captures(stdout).map(|caps| {
        caps.get(1)
            .unwrap()
            .as_str()
            .parse::<u128>()
            .expect("matched digits should parse as u128")
    })
}

/// Parse "Simulation result:  [12345n, 67890n]" -> Some([12345, 67890])
/// Uses (?s) so \s matches newlines (sandbox wraps long arrays across lines).
pub fn parse_simulation_result_pair(stdout: &str) -> Option<[u128; 2]> {
    RE_PAIR.captures(stdout).map(|caps| {
        let a = caps
            .get(1)
            .unwrap()
            .as_str()
            .parse::<u128>()
            .expect("matched digits should parse as u128");
        let b = caps
            .get(2)
            .unwrap()
            .as_str()
            .parse::<u128>()
            .expect("matched digits should parse as u128");
        [a, b]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_single_result() {
        let stdout = "Simulation result:  42n";
        assert_eq!(parse_simulation_result(stdout), Some(42));
    }

    #[test]
    fn parse_large_result() {
        let stdout = "Simulation result:  208681979753062036312901159467002686397n";
        assert_eq!(
            parse_simulation_result(stdout),
            Some(208681979753062036312901159467002686397)
        );
    }

    #[test]
    fn parse_result_no_n_suffix() {
        let stdout = "Simulation result:  208681979";
        assert_eq!(parse_simulation_result(stdout), None);
    }

    #[test]
    fn parse_pair_result() {
        let stdout = "Simulation result:  [100n, 200n]";
        assert_eq!(parse_simulation_result_pair(stdout), Some([100, 200]));
    }

    #[test]
    fn parse_pair_result_with_spaces() {
        let stdout = "Simulation result:  [ 100n , 200n ]";
        assert_eq!(parse_simulation_result_pair(stdout), Some([100, 200]));
    }

    #[test]
    fn parse_pair_result_multiline() {
        let stdout = "Simulation result:  [\n      79104718386446992958899112153673017973n,\n      162573612145643275075507288478559600030n\n    ]";
        assert_eq!(
            parse_simulation_result_pair(stdout),
            Some([
                79104718386446992958899112153673017973,
                162573612145643275075507288478559600030
            ])
        );
    }

    #[test]
    fn parse_no_match() {
        let stdout = "Some other output";
        assert_eq!(parse_simulation_result(stdout), None);
        assert_eq!(parse_simulation_result_pair(stdout), None);
    }

    #[test]
    fn parse_deployed_address_ok() {
        let stdout = "Contract deployed at 0x266247e79b69e97a56f19c0eae1ffd312aede58859df2f36c0ee448898c9c8a1\nContract partial address 0x1686fc41";
        assert_eq!(
            parse_deployed_address(stdout),
            Some("0x266247e79b69e97a56f19c0eae1ffd312aede58859df2f36c0ee448898c9c8a1".into())
        );
    }

    #[test]
    fn address_book_resolve_account() {
        let mut book = AddressBook::new();
        book.accounts = vec!["0xaaa".into(), "0xbbb".into(), "0xccc".into()];
        assert_eq!(book.resolve("accounts:test0"), "0xaaa");
        assert_eq!(book.resolve("accounts:test1"), "0xbbb");
        assert_eq!(book.resolve("accounts:test2"), "0xccc");
    }

    #[test]
    fn address_book_resolve_contract() {
        let mut book = AddressBook::new();
        book.contracts.insert(
            "test0".into(),
            ContractInfo { address: "0xddd".into(), artifact: "/tmp/a.json".into() },
        );
        assert_eq!(book.resolve("contracts:test0"), "0xddd");
        assert_eq!(book.artifact_for("contracts:test0"), Some("/tmp/a.json".into()));
    }

    #[test]
    fn address_book_passthrough_unknown() {
        let book = AddressBook::new();
        assert_eq!(book.resolve("12345"), "12345");
        assert_eq!(book.resolve("0xdeadbeef"), "0xdeadbeef");
        assert_eq!(book.resolve("accounts:test99"), "accounts:test99");
    }
}
