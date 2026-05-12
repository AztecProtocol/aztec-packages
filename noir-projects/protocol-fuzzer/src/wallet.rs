use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use anyhow::anyhow;
use log::debug;
use regex::Regex;
use serde_json::json;

static RE_SINGLE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"Simulation result:\s+(\d+)n").unwrap());
static RE_PAIR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?s)Simulation result:\s+\[\s*(\d+)n\s*,\s*(\d+)n\s*\]").unwrap()
});

// ---------------------------------------------------------------------------
// Address Book -- the fuzzer's own tally of account and contract addresses
// ---------------------------------------------------------------------------

struct ContractInfo {
    address: String,
    artifact: String,
}

struct AddressBook {
    /// Hex addresses indexed by AccountId (0, 1, 2, ...).
    accounts: Vec<String>,
    /// Contract alias (e.g. "test0", "parent0", "token0") -> info.
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
        if let Some(rest) = alias.strip_prefix("accounts:test")
            && let Ok(id) = rest.parse::<usize>()
            && let Some(addr) = self.accounts.get(id)
        {
            return addr.clone();
        }
        if let Some(name) = alias.strip_prefix("contracts:")
            && let Some(info) = self.contracts.get(name)
        {
            return info.address.clone();
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

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

pub(crate) type AccountId = usize;

/// How to execute a command on the sandbox: on-chain transaction (`Send`) or
/// read-only simulation (`Simulate`).
#[derive(Debug, Clone, Copy)]
pub enum Verb {
    Send,
    Simulate,
}

pub struct WalletCommand {
    pub verb: Verb,
    pub method: String,
    pub contract: String,
    pub from: String,
    pub args: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct TxEffects {
    pub l2_to_l1_msg_hashes: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct PrivateLogData {
    pub log_data: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ExecOutput {
    pub stdout: String,
    pub tx_effects: Option<TxEffects>,
}

// ---------------------------------------------------------------------------
// Bridge -- persistent connection to the Node.js bridge server
// ---------------------------------------------------------------------------

pub struct Bridge {
    url: String,
    prove: bool,
    client: reqwest::blocking::Client,
    address_book: Mutex<AddressBook>,
}

impl std::fmt::Debug for Bridge {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Bridge").field("url", &self.url).finish()
    }
}

impl Bridge {
    pub fn new(url: &str, prove: bool) -> Self {
        Self {
            url: url.to_string(),
            prove,
            client: reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(300))
                .build()
                .expect("failed to create HTTP client"),
            address_book: Mutex::new(AddressBook::new()),
        }
    }

    /// POST JSON to the bridge and return the parsed response.
    /// Errors if the bridge returns `{ ok: false, error: "..." }`.
    fn post(&self, endpoint: &str, body: &serde_json::Value) -> anyhow::Result<serde_json::Value> {
        let resp = self
            .client
            .post(format!("{}{endpoint}", self.url))
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

    /// Check that the bridge is reachable.
    pub fn check_connection(&self) -> anyhow::Result<()> {
        let resp = self
            .client
            .get(format!("{}/health", self.url))
            .timeout(Duration::from_secs(5))
            .send()
            .map_err(|_| {
                anyhow!(
                    "Bridge not reachable at {}.\n\
                 Start it with: bash setup-nightly-sandbox.sh",
                    self.url
                )
            })?;
        if resp.status().is_success() {
            debug!("bridge health check OK ({})", self.url);
            Ok(())
        } else {
            Err(anyhow!("Bridge returned HTTP {} on /health", resp.status()))
        }
    }

    /// Execute a wallet command and return output including optional TxEffect
    /// data.  Retries automatically on transient sandbox errors -- see
    /// `is_transient_error` for which messages are retried (currently stale
    /// world-state reads and reorg notices).
    pub fn execute(&self, cmd: &WalletCommand) -> anyhow::Result<ExecOutput> {
        let book = self.address_book.lock().unwrap();
        let resolved_from = book.resolve(&cmd.from);
        let resolved_contract = book.resolve(&cmd.contract);
        let resolved_args: Vec<String> = cmd.args.iter().map(|a| book.resolve(a)).collect();
        let artifact = book
            .artifact_for(&cmd.contract)
            .ok_or_else(|| anyhow!("no artifact for contract {}", cmd.contract))?;
        drop(book);

        let verb = match cmd.verb {
            Verb::Send => "send",
            Verb::Simulate => "simulate",
        };
        let body = json!({
            "verb": verb,
            "method": cmd.method,
            "contract": resolved_contract,
            "from": resolved_from,
            "args": resolved_args,
            "artifact": artifact,
            "prove": self.prove,
        });

        with_retry(&format!("{verb} {}", cmd.method), || {
            debug!("bridge POST /execute {}", body);
            let result = self.post("/execute", &body)?;
            let stdout = result["stdout"].as_str().unwrap_or("").to_string();
            debug!("bridge execute stdout: {stdout}");
            let tx_effects = parse_tx_effects(&result);
            Ok(ExecOutput { stdout, tx_effects })
        })
    }

    /// Import the 3 deterministic test accounts into the wallet.
    pub fn import_test_accounts(&self) -> anyhow::Result<()> {
        debug!("bridge POST /import-test-accounts");
        let result = self.post("/import-test-accounts", &json!({ "prove": self.prove }))?;

        if let Some(accounts) = result["accounts"].as_array() {
            let mut book = self.address_book.lock().unwrap();
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

    /// Deploy a contract artifact with optional `--init` and `--args`, plus an
    /// alias for the address book.
    pub fn deploy(
        &self,
        artifact: &str,
        from: &str,
        alias: &str,
        init: Option<&str>,
        args: Option<&str>,
    ) -> anyhow::Result<String> {
        let book = self.address_book.lock().unwrap();
        let resolved_from = book.resolve(from);
        let resolved_args: Option<Vec<String>> =
            args.map(|a| a.split_whitespace().map(|arg| book.resolve(arg)).collect());
        drop(book);

        let body = json!({
            "artifact": artifact,
            "from": resolved_from,
            "init": init,
            "args": resolved_args,
        });
        let result = with_retry("deploy", || {
            debug!("bridge POST /deploy {}", body);
            self.post("/deploy", &body)
        })?;
        let stdout = result["stdout"].as_str().unwrap_or("").to_string();

        let address = result["address"]
            .as_str()
            .ok_or_else(|| anyhow!("bridge deploy response missing 'address'"))?;
        {
            let mut book = self.address_book.lock().unwrap();
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

    /// Execute multiple wallet commands in parallel using scoped threads.
    /// Returns results in the same order as the input commands.
    pub fn execute_many(&self, cmds: &[WalletCommand]) -> Vec<anyhow::Result<ExecOutput>> {
        std::thread::scope(|s| {
            let handles: Vec<_> = cmds
                .iter()
                .map(|cmd| s.spawn(|| self.execute(cmd)))
                .collect();
            handles.into_iter().map(|h| h.join().unwrap()).collect()
        })
    }

    /// Resolve an alias (e.g. `contracts:test0`) to a hex address.
    pub fn resolve(&self, alias: &str) -> String {
        self.address_book.lock().unwrap().resolve(alias)
    }

    /// Query the node for private logs matching the siloed tag derived from
    /// `contract` and `raw_tag`. The bridge computes the siloed tag via
    /// `poseidon2_hash_with_separator([contract, rawTag], DOM_SEP)` and
    /// queries `getPrivateLogsByTags`.
    pub fn query_private_logs(
        &self,
        contract: &str,
        raw_tag: &str,
    ) -> anyhow::Result<Vec<PrivateLogData>> {
        let body = json!({ "contract": contract, "rawTag": raw_tag });
        let result = self.post("/query-private-logs", &body)?;
        let logs = result
            .get("logs")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .map(|log| PrivateLogData {
                        log_data: log
                            .get("logData")
                            .and_then(|f| f.as_array())
                            .map(|fs| {
                                fs.iter()
                                    .filter_map(|f| f.as_str().map(String::from))
                                    .collect()
                            })
                            .unwrap_or_default(),
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(logs)
    }

    /// Compute the L2->L1 message hash that an L1 recipient would check against
    /// the outbox.  Delegates to the bridge which has access to chain ID and
    /// rollup version.
    pub fn compute_l2_to_l1_hash(
        &self,
        l2_sender: &str,
        l1_recipient: &str,
        content: &str,
    ) -> anyhow::Result<String> {
        let body = json!({
            "l2Sender": l2_sender,
            "l1Recipient": l1_recipient,
            "content": content,
        });
        let result = self.post("/compute-l2-to-l1-hash", &body)?;
        result["hash"]
            .as_str()
            .map(String::from)
            .ok_or_else(|| anyhow!("missing 'hash' in response"))
    }
}

// ---------------------------------------------------------------------------
// TxEffect parsing
// ---------------------------------------------------------------------------

/// Parse the optional `txEffects` field from a bridge JSON response.
fn parse_tx_effects(result: &serde_json::Value) -> Option<TxEffects> {
    let effects = result.get("txEffects")?;
    let l2_to_l1_msg_hashes = effects
        .get("l2ToL1Msgs")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    Some(TxEffects {
        l2_to_l1_msg_hashes,
    })
}

// ---------------------------------------------------------------------------
// Retry helpers
// ---------------------------------------------------------------------------

/// Check whether an error is transient and worth retrying (e.g. sandbox reorgs
/// triggered by concurrent transactions).
fn is_transient_error(e: &anyhow::Error) -> bool {
    let msg = e.to_string();
    msg.contains("not found when querying world state") || msg.contains("reorg has occurred")
}

/// Maximum number of automatic retries for transient errors.
const MAX_RETRIES: usize = 2;

/// Retry a fallible operation on transient sandbox errors.
fn with_retry<T>(label: &str, f: impl Fn() -> anyhow::Result<T>) -> anyhow::Result<T> {
    let mut attempt = 0;
    loop {
        match f() {
            Ok(v) => return Ok(v),
            Err(e) if attempt < MAX_RETRIES && is_transient_error(&e) => {
                attempt += 1;
                log::warn!(
                    "Transient error on {label} (attempt {attempt}/{MAX_RETRIES}): {e}, retrying..."
                );
                std::thread::sleep(Duration::from_secs(2));
            }
            Err(e) => return Err(e),
        }
    }
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

fn capture_u128(caps: &regex::Captures, i: usize) -> u128 {
    caps.get(i)
        .unwrap()
        .as_str()
        .parse()
        .expect("matched digits should parse as u128")
}

/// Parse "Simulation result:  12345n" -> Some(12345)
pub fn parse_simulation_result(stdout: &str) -> Option<u128> {
    RE_SINGLE
        .captures(stdout)
        .map(|caps| capture_u128(&caps, 1))
}

/// Parse "Simulation result:  [12345n, 67890n]" -> Some([12345, 67890])
/// Uses (?s) so \s matches newlines (sandbox wraps long arrays across lines).
pub fn parse_simulation_result_pair(stdout: &str) -> Option<[u128; 2]> {
    RE_PAIR
        .captures(stdout)
        .map(|caps| [capture_u128(&caps, 1), capture_u128(&caps, 2)])
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
            ContractInfo {
                address: "0xddd".into(),
                artifact: "/tmp/a.json".into(),
            },
        );
        assert_eq!(book.resolve("contracts:test0"), "0xddd");
        assert_eq!(
            book.artifact_for("contracts:test0"),
            Some("/tmp/a.json".into())
        );
    }

    #[test]
    fn address_book_passthrough_unknown() {
        let book = AddressBook::new();
        assert_eq!(book.resolve("12345"), "12345");
        assert_eq!(book.resolve("0xdeadbeef"), "0xdeadbeef");
        assert_eq!(book.resolve("accounts:test99"), "accounts:test99");
    }
}
