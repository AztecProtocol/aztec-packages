use clap::{Parser, Subcommand};
use color_eyre::eyre;
use const_format::formatcp;

mod create_flamegraph_cmd;

const ACVM_VERSION: &str = env!("CARGO_PKG_VERSION");

static VERSION_STRING: &str = formatcp!("version = {}\n", ACVM_VERSION,);

#[derive(Parser, Debug)]
#[command(name="acvm", author, version=VERSION_STRING, about, long_about = None)]
struct CreateFlamegraphCli {
    #[command(subcommand)]
    command: CreateFlamegraphCommand,
}

#[non_exhaustive]
#[derive(Subcommand, Clone, Debug)]
enum CreateFlamegraphCommand {
    CreateFlamegraph(create_flamegraph_cmd::CreateFlamegraphCommand),
}

#[cfg(not(feature = "codegen-docs"))]
pub(crate) fn start_cli() -> eyre::Result<()> {
    let CreateFlamegraphCli { command } = CreateFlamegraphCli::parse();

    match command {
        CreateFlamegraphCommand::CreateFlamegraph(args) => create_flamegraph_cmd::run(args),
    }
    .map_err(|err| eyre::eyre!("{}", err))?;

    Ok(())
}

#[cfg(feature = "codegen-docs")]
pub(crate) fn start_cli() -> eyre::Result<()> {
    let markdown: String = clap_markdown::help_markdown::<NargoCli>();
    println!("{markdown}");
    Ok(())
}
