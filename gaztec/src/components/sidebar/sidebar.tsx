import { css } from "@emotion/react";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import { PrivateContext } from "../home/home";
import { PrivateEnv } from "../../config";
import { createStore } from "@aztec/kv-store/indexeddb";
import {
  AccountWalletWithSecretKey,
  Contract,
  Fr,
  TxHash,
  createLogger,
  loadContractArtifact,
} from "@aztec/aztec.js";
import { WalletDB } from "../../utils/storage";
import { useContext, useEffect, useState } from "react";
import { CreateAccountDialog } from "./components/createAccountDialog";
import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import { AztecAddress, deriveSigningKey } from "@aztec/circuits.js";
import AddIcon from "@mui/icons-material/Add";
import logoURL from "../../assets/Aztec_logo.png";
import { Divider, Typography } from "@mui/material";
import {
  formatFrAsString,
  parseAliasedBufferAsString,
} from "../../utils/conversion";
import { convertFromUTF8BufferAsString } from "../../utils/conversion";
import { ContractFunctionInteractionTx } from "../../utils/txs";

const container = css({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  width: "25vw",
  backgroundColor: "var(--mui-palette-primary-light)",
  overflow: "hidden",
  padding: "0 0.5rem",
});

const select = css({
  width: "100%",
  margin: "0.5rem 0rem",
});

const header = css({
  display: "flex",
  flexDirection: "row",
  height: "5rem",
  width: "100%",
  alignItems: "center",
  marginBottom: "1rem",
});

const logo = css({
  height: "90%",
  margin: "0.5rem 1rem 0rem 0rem",
});

const txPanel = css({
  marginTop: "auto",
  marginBottom: "0.5rem",
  width: "100%",
  backgroundColor: "var(--mui-palette-primary-main)",
  maxHeight: "50vh",
  overflowY: "auto",
  borderRadius: "0.5rem",
});

const txData = css({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "0.5rem",
  backgroundColor: "var(--mui-palette-primary-light)",
  borderRadius: "0.5rem",
  margin: "0.5rem",
});

const NETWORKS = [
  {
    nodeURL: "http://localhost:8080",
    name: "Local",
  },
  { nodeURL: "http://34.145.98.34:8080", name: "Devnet" },
];

export function SidebarComponent() {
  const {
    setPXE,
    setNodeURL,
    setPXEInitialized,
    setWalletDB,
    setWallet,
    setCurrentContract,
    currentTx,
    currentContract,
    wallet,
    walletDB,
    nodeURL,
    isPXEInitialized,
    pxe,
  } = useContext(PrivateContext);
  const [accounts, setAccounts] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);

  const handleNetworkChange = async (event: SelectChangeEvent) => {
    setPXEInitialized(false);
    const nodeURL = event.target.value;
    setNodeURL(nodeURL);
    const pxe = await PrivateEnv.initPXE(nodeURL);
    const rollupAddress = (await pxe.getNodeInfo()).l1ContractAddresses
      .rollupAddress;
    const walletLogger = createLogger("wallet:data:indexeddb");
    const walletDBStore = await createStore(
      `wallet-${rollupAddress}`,
      { dataDirectory: "wallet", dataStoreMapSizeKB: 2e10 },
      walletLogger
    );
    const walletDB = WalletDB.getInstance();
    walletDB.init(walletDBStore, walletLogger.info);
    const aliasedAccounts = await walletDB.listAliases("accounts");
    const aliasedContracts = await walletDB.listAliases("contracts");
    setContracts(parseAliasedBufferAsString(aliasedContracts));
    setAccounts(parseAliasedBufferAsString(aliasedAccounts));
    setWalletDB(walletDB);
    setPXE(pxe);
    setPXEInitialized(true);
  };

  useEffect(() => {
    const refreshContracts = async () => {
      const aliasedContracts = await walletDB.listAliases("contracts");
      setContracts(parseAliasedBufferAsString(aliasedContracts));
    };
    if (walletDB) {
      refreshContracts();
    }
  }, [currentContract]);

  useEffect(() => {
    const refreshAccounts = async () => {
      const aliasedAccounts = await walletDB.listAliases("accounts");
      setAccounts(parseAliasedBufferAsString(aliasedAccounts));
    };
    if (walletDB) {
      refreshAccounts();
    }
  }, [wallet]);

  useEffect(() => {
    const refreshTransactions = async () => {
      const txsPerContract = await walletDB.retrieveTxsPerContract(
        currentContract.address
      );
      const txHashes = txsPerContract.map((txHash) =>
        TxHash.fromString(convertFromUTF8BufferAsString(txHash))
      );
      const txs: ContractFunctionInteractionTx[] = await Promise.all(
        txHashes.map(async (txHash) => {
          const txData = await walletDB.retrieveTxData(txHash);
          return {
            contractAddress: currentContract.address,
            txHash: txData.txHash,
            status: convertFromUTF8BufferAsString(txData.status),
            fnName: convertFromUTF8BufferAsString(txData.fnName),
          } as ContractFunctionInteractionTx;
        })
      );
      if (currentTx && !txs.find((tx) => tx.txHash.equals(currentTx.txHash))) {
        txs.unshift(currentTx);
      }
      setTransactions(txs);
    };
    if (currentContract && walletDB) {
      refreshTransactions();
    }
  }, [currentContract, currentTx]);

  const handleAccountChange = async (event: SelectChangeEvent) => {
    if (event.target.value == "") {
      return;
    }
    const accountAddress = AztecAddress.fromString(event.target.value);
    const accountData = await walletDB.retrieveAccount(accountAddress);
    const account = getSchnorrAccount(
      pxe,
      accountData.secretKey,
      deriveSigningKey(accountData.secretKey),
      accountData.salt
    );
    setWallet(await account.getWallet());
  };

  const handleAccountCreation = async (
    account?: AccountWalletWithSecretKey,
    salt?: Fr,
    alias?: string
  ) => {
    if (!account || !salt || !alias) {
      return;
    }
    await walletDB.storeAccount(account.getAddress(), {
      type: "schnorr",
      secretKey: account.getSecretKey(),
      alias,
      salt,
    });
    const aliasedAccounts = await walletDB.listAliases("accounts");
    setAccounts(parseAliasedBufferAsString(aliasedAccounts));
    setWallet(account);
    setOpenCreateAccountDialog(false);
  };

  const handleContractChange = async (event: SelectChangeEvent) => {
    if (event.target.value == "") {
      return;
    }
    const contractAddress = AztecAddress.fromString(event.target.value);
    const artifactAsString = await walletDB.retrieveAlias(
      `artifacts:${contractAddress}`
    );
    const contractArtifact = loadContractArtifact(
      JSON.parse(convertFromUTF8BufferAsString(artifactAsString))
    );
    const contract = await Contract.at(
      contractAddress,
      contractArtifact,
      wallet
    );
    setCurrentContract(contract);
  };

  return (
    <div css={container}>
      <div css={header}>
        <img css={logo} src={logoURL} />
        <Typography
          variant="h1"
          sx={{ fontSize: "65px", padding: 0, marginTop: "0.5rem" }}
        >
          GAztec
        </Typography>
      </div>
      <FormControl css={select}>
        <InputLabel>Network</InputLabel>
        <Select value={nodeURL} label="Network" onChange={handleNetworkChange}>
          {NETWORKS.map((network) => (
            <MenuItem key={network.name} value={network.nodeURL}>
              {network.name} ({network.nodeURL})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {pxe && isPXEInitialized ? (
        <>
          <FormControl css={select}>
            <InputLabel>Account</InputLabel>
            <Select
              value={wallet?.getAddress().toString() ?? ""}
              label="Account"
              onChange={handleAccountChange}
            >
              {accounts.map((account) => (
                <MenuItem key={account.key} value={account.value}>
                  {account.key.split(":")[1]}&nbsp;(
                  {formatFrAsString(account.value)})
                </MenuItem>
              ))}
              <MenuItem
                key="create"
                value=""
                onClick={() => setOpenCreateAccountDialog(true)}
              >
                <AddIcon />
                &nbsp;Create
              </MenuItem>
            </Select>
          </FormControl>
          <CreateAccountDialog
            pxe={pxe}
            open={openCreateAccountDialog}
            onClose={handleAccountCreation}
          />
        </>
      ) : (
        <></>
      )}
      {wallet && (
        <FormControl css={select}>
          <InputLabel>Contracts</InputLabel>
          <Select
            value={currentContract?.address.toString() ?? ""}
            label="Contract"
            onChange={handleContractChange}
          >
            {contracts.map((contract) => (
              <MenuItem
                key={`${contract.key}-${contract.value}`}
                value={contract.value}
              >
                {contract.key.split(":")[1]}&nbsp;(
                {formatFrAsString(contract.value)})
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      <div css={txPanel}>
        <Typography component="h2">Transactions</Typography>
        <Divider />
        {transactions.map((tx) => (
          <div css={txData} key={tx.txHash ?? ""}>
            <div css={{ display: "flex" }}>
              <Typography component="h4">
                {tx.txHash ? formatFrAsString(tx.txHash.toString()) : "()"}
                &nbsp;-&nbsp;
              </Typography>
              <Typography component="h5" sx={{ fontWeight: 800 }}>
                {tx.receipt
                  ? tx.receipt.status.toUpperCase()
                  : tx.status.toUpperCase()}
                {tx.receipt?.error}
              </Typography>
            </div>
            <Typography component="h5">
              {tx.fnName}@{formatFrAsString(tx.contractAddress.toString())}
            </Typography>
          </div>
        ))}
      </div>
    </div>
  );
}
