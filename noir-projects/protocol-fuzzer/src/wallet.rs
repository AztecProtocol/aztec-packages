use anyhow::anyhow;
use log::debug;
use rsbash::rash;

pub(crate) type AccountId = usize;

pub struct WalletCommand {
    pub verb: String,
    pub method: String,
    pub contract: String,
    pub from: String,
    pub args: Vec<String>,
}

/// Execute an aztec-wallet command and return stdout.
/// Returns Err if the command exits with non-zero status.
pub fn execute(cmd: &WalletCommand) -> anyhow::Result<String> {
    let args = cmd.args.join(" ");
    let mut syscmd = format!(
        "aztec-wallet {} {} --from {} \
        --contract-address {}",
        cmd.verb, cmd.method, cmd.from, cmd.contract
    );
    if !cmd.args.is_empty() {
        syscmd.push_str(&format!(" --args {args}"));
    }
    let (ret, stdout, stderr) = rash!(&syscmd)?;
    debug!("{syscmd}");
    debug!("stdout: {stdout}");
    if ret != 0 {
        debug!("stderr: {stderr}");
        return Err(anyhow!(
            "Command failed with exit code {ret}: {syscmd}\nstderr: {stderr}"
        ));
    }
    Ok(stdout)
}

/// Run `aztec-wallet import-test-accounts`. Returns Err on failure.
pub fn import_test_accounts() -> anyhow::Result<()> {
    debug!("Running import-test-accounts");
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

/// Deploy a contract artifact with optional `--init` and `--args`, plus `--alias`.
pub fn deploy(
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
    let (ret, stdout, stderr) = rash!(&cmd)?;
    debug!("Deploy stdout: {stdout}");
    if ret != 0 {
        return Err(anyhow!(
            "Deploy failed with exit code {ret}\nstderr: {stderr}"
        ));
    }
    Ok(stdout)
}

/// Parse "Simulation result:  12345n" → Some(12345)
pub fn parse_simulation_result(stdout: &str) -> Option<u128> {
    let re = regex::Regex::new(r"Simulation result:\s+(\d+)n").unwrap();
    re.captures(stdout).map(|caps| {
        let amount = caps.get(1).unwrap().as_str();
        amount.parse::<u128>().unwrap_or(0)
    })
}

/// Parse "Simulation result:  [12345n, 67890n]" → Some([12345, 67890])
pub fn parse_simulation_result_pair(stdout: &str) -> Option<[u128; 2]> {
    let re = regex::Regex::new(r"Simulation result:\s+\[\s*(\d+)n\s*,\s*(\d+)n\s*\]").unwrap();
    re.captures(stdout).map(|caps| {
        let a = caps.get(1).unwrap().as_str().parse::<u128>().unwrap_or(0);
        let b = caps.get(2).unwrap().as_str().parse::<u128>().unwrap_or(0);
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
    fn parse_no_match() {
        let stdout = "Some other output";
        assert_eq!(parse_simulation_result(stdout), None);
        assert_eq!(parse_simulation_result_pair(stdout), None);
    }
}
