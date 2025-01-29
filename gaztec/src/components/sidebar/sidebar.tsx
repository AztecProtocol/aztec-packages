import { css } from "@emotion/react";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import { AztecEnv, AztecContext } from "../../aztecEnv";
import { createStore } from "@aztec/kv-store/indexeddb";
import {
  AccountWalletWithSecretKey,
  Fr,
  TxHash,
  createLogger,
  AztecAddress,
} from "@aztec/aztec.js";
import { WalletDB } from "../../utils/storage";
import { useContext, useEffect, useState } from "react";
import { CreateAccountDialog } from "./components/createAccountDialog";
import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import AddIcon from "@mui/icons-material/Add";
import logoURL from "../../assets/Aztec_logo.png";
import { Button, Divider, Typography } from "@mui/material";
import {
  formatFrAsString,
  parseAliasedBuffersAsString,
} from "../../utils/conversion";
import { convertFromUTF8BufferAsString } from "../../utils/conversion";
import { ContractFunctionInteractionTx } from "../../utils/txs";
import ContactsIcon from "@mui/icons-material/Contacts";
import { CopyToClipboardButton } from "../common/copyToClipboardButton";
import { AddSendersDialog } from "./components/addSenderDialog";
import { deriveSigningKey } from "@aztec/circuits.js/keys";

const container = css({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  width: "25vw",
  backgroundColor: "var(--mui-palette-primary-light)",
  overflow: "hidden",
  padding: "0 0.5rem",
  textAlign: "center",
});

const select = css({
  display: "flex",
  flexDirection: "row",
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
  marginBottom: "0.5rem",
  width: "100%",
  backgroundColor: "var(--mui-palette-primary-main)",
  maxHeight: "30vh",
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
  { nodeURL: "http://35.197.121.62:8080", name: "Masternet" },
];

export function SidebarComponent() {
  const {
    setPXE,
    setNodeURL,
    setPXEInitialized,
    setWalletDB,
    setWallet,
    setCurrentContractAddress,
    setAztecNode,
    currentTx,
    currentContractAddress,
    wallet,
    walletDB,
    nodeURL,
    isPXEInitialized,
    pxe,
  } = useContext(AztecContext);
  const [accounts, setAccounts] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [openCreateAccountDialog, setOpenCreateAccountDialog] = useState(false);
  const [openAddSendersDialog, setOpenAddSendersDialog] = useState(false);

  const getAccountsAndSenders = async () => {
    const aliasedBuffers = await walletDB.listAliases("accounts");
    const aliasedAccounts = parseAliasedBuffersAsString(aliasedBuffers);
    const pxeAccounts = await pxe.getRegisteredAccounts();
    const ourAccounts = [];
    const senders = [];
    aliasedAccounts.forEach(({ key, value }) => {
      if (
        pxeAccounts.find((account) =>
          account.address.equals(AztecAddress.fromString(value))
        )
      ) {
        ourAccounts.push({ key, value });
      } else {
        senders.push(key, value);
      }
    });
    return { ourAccounts, senders };
  };

  const handleNetworkChange = async (event: SelectChangeEvent) => {
    setPXEInitialized(false);
    const nodeURL = event.target.value;
    setNodeURL(nodeURL);
    const node = await AztecEnv.connectToNode(nodeURL);
    setAztecNode(node);
    const pxe = await AztecEnv.initPXE(node);
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
    setPXE(pxe);
    setWalletDB(walletDB);
    setPXEInitialized(true);
  };

  useEffect(() => {
    const refreshContracts = async () => {
      const aliasedContracts = await walletDB.listAliases("contracts");
      setContracts(parseAliasedBuffersAsString(aliasedContracts));
    };
    if (walletDB) {
      refreshContracts();
    }
  }, [currentContractAddress, walletDB]);

  useEffect(() => {
    const refreshAccounts = async () => {
      const { ourAccounts } = await getAccountsAndSenders();
      setAccounts(ourAccounts);
    };
    if (walletDB && walletDB && pxe) {
      refreshAccounts();
    }
  }, [wallet, walletDB, pxe]);

  useEffect(() => {
    const refreshTransactions = async () => {
      const txsPerContract = await walletDB.retrieveTxsPerContract(
        currentContractAddress
      );
      const txHashes = txsPerContract.map((txHash) =>
        TxHash.fromString(convertFromUTF8BufferAsString(txHash))
      );
      const txs: ContractFunctionInteractionTx[] = await Promise.all(
        txHashes.map(async (txHash) => {
          const txData = await walletDB.retrieveTxData(txHash);
          return {
            contractAddress: currentContractAddress,
            txHash: txData.txHash,
            status: convertFromUTF8BufferAsString(txData.status),
            fnName: convertFromUTF8BufferAsString(txData.fnName),
            date: parseInt(convertFromUTF8BufferAsString(txData.date)),
          } as ContractFunctionInteractionTx;
        })
      );
      txs.sort((a, b) => (b.date >= a.date ? -1 : 1));
      if (
        currentTx &&
        currentTx.contractAddress === currentContractAddress &&
        (!currentTx.txHash ||
          !txs.find((tx) => tx.txHash.equals(currentTx.txHash)))
      ) {
        txs.unshift(currentTx);
      }
      setTransactions(txs);
    };
    if (currentContractAddress && walletDB) {
      refreshTransactions();
    }
  }, [currentContractAddress, currentTx]);

  const handleAccountChange = async (event: SelectChangeEvent) => {
    if (event.target.value == "") {
      return;
    }
    const accountAddress = AztecAddress.fromString(event.target.value);
    const accountData = await walletDB.retrieveAccount(accountAddress);
    const account = await getSchnorrAccount(
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
    if (account && salt && alias) {
      await walletDB.storeAccount(account.getAddress(), {
        type: "schnorr",
        secretKey: account.getSecretKey(),
        alias,
        salt,
      });
      const aliasedAccounts = await walletDB.listAliases("accounts");
      setAccounts(parseAliasedBuffersAsString(aliasedAccounts));
      setWallet(account);
    }

    setOpenCreateAccountDialog(false);
  };

  const handleContractChange = async (event: SelectChangeEvent) => {
    if (event.target.value == "") {
      return;
    }
    const contractAddress = AztecAddress.fromString(event.target.value);
    setCurrentContractAddress(contractAddress);
  };

  const handleSenderAdded = async (sender?: AztecAddress, alias?: string) => {
    if (sender && alias) {
      await wallet.registerSender(sender);
      await walletDB.storeAlias(
        "accounts",
        alias,
        Buffer.from(sender.toString())
      );
      const { ourAccounts } = await getAccountsAndSenders();
      setAccounts(ourAccounts);
    }
    setOpenAddSendersDialog(false);
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
      <Typography variant="overline">Connect</Typography>
      <FormControl css={select}>
        <InputLabel>Network</InputLabel>
        <Select
          fullWidth
          value={nodeURL}
          label="Network"
          onChange={handleNetworkChange}
        >
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
              fullWidth
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
            <CopyToClipboardButton
              disabled={!wallet}
              data={wallet?.getAddress().toString()}
            />
          </FormControl>
        </>
      ) : (
        <></>
      )}
      {wallet && (
        <>
          <Typography variant="overline">Tools</Typography>
          <FormControl css={select}>
            <InputLabel>Contracts</InputLabel>
            <Select
              value={currentContractAddress?.toString() ?? ""}
              label="Contract"
              onChange={handleContractChange}
              fullWidth
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
            <CopyToClipboardButton
              disabled={!currentContractAddress}
              data={currentContractAddress?.toString()}
            />
          </FormControl>
          <Button
            variant="contained"
            onClick={() => setOpenAddSendersDialog(true)}
            endIcon={<ContactsIcon />}
          >
            Contacts
          </Button>
          <AddSendersDialog
            open={openAddSendersDialog}
            onClose={handleSenderAdded}
          />
        </>
      )}
      <div css={{ flex: "1 0 auto", margin: "auto" }} />
      <Typography variant="overline">Transactions</Typography>
      <Divider />
      <div css={txPanel}>
        {transactions.map((tx) => (
          <div css={txData} key={tx.txHash ?? ""}>
            <div css={{ display: "flex" }}>
              <Typography variant="body2">
                {tx.txHash ? formatFrAsString(tx.txHash.toString()) : "()"}
                &nbsp;-&nbsp;
              </Typography>
              <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                {tx.receipt
                  ? tx.receipt.status.toUpperCase()
                  : tx.status.toUpperCase()}
                &nbsp;
                {tx.receipt && tx.receipt.status === "error"
                  ? tx.receipt.error
                  : tx.error}
              </Typography>
            </div>
            <Typography variant="body2">
              {tx.fnName}@{formatFrAsString(tx.contractAddress.toString())}
            </Typography>
          </div>
        ))}
      </div>
      <CreateAccountDialog
        open={openCreateAccountDialog}
        onClose={handleAccountCreation}
      />
    </div>
  );
}
