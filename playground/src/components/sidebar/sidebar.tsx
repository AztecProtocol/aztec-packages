import { css } from "@emotion/react";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import { AztecEnv, AztecContext, WebLogger } from "../../aztecEnv";
import { createStore } from "@aztec/kv-store/indexeddb";
import { AccountWalletWithSecretKey, Fr, AztecAddress } from "@aztec/aztec.js";
import { NetworkDB, WalletDB } from "../../utils/storage";
import { useContext, useEffect, useState } from "react";
import { CreateAccountDialog } from "./components/createAccountDialog";
import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import AddIcon from "@mui/icons-material/Add";
import { Button, Divider, Typography } from "@mui/material";
import {
  formatFrAsString,
  parseAliasedBuffersAsString,
} from "../../utils/conversion";
import ContactsIcon from "@mui/icons-material/Contacts";
import { CopyToClipboardButton } from "../common/copyToClipboardButton";
import { AddSendersDialog } from "./components/addSenderDialog";
import { deriveSigningKey } from "@aztec/circuits.js/keys";
import { TxsPanel } from "./components/txsPanel";
import { AddNetworksDialog } from "./components/addNetworkDialog";

const container = css({
  display: "flex",
  flexDirection: "column",
  height: "100%",
  width: "100%",
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

type Network = { nodeURL: string; name: string };

const NETWORKS: Network[] = [
  {
    nodeURL: "http://localhost:8080",
    name: "Local",
  },
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
    setLogs,
    currentContractAddress,
    wallet,
    walletDB,
    nodeURL,
    isPXEInitialized,
    pxe,
  } = useContext(AztecContext);
  const [changingNetworks, setChangingNetworks] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [networks, setNetworks] = useState(NETWORKS);
  const [openAddNetworksDialog, setOpenAddNetworksDialog] = useState(false);
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

  useEffect(() => {
    const refreshNetworks = async () => {
      const aliasedBuffers = await NetworkDB.getInstance().listNetworks();
      const aliasedNetworks = parseAliasedBuffersAsString(aliasedBuffers);
      const networks = [
        ...NETWORKS,
        ...aliasedNetworks.map((network) => ({
          nodeURL: network.value,
          name: network.key,
        })),
      ];
      setNetworks(networks);
    };
    refreshNetworks();
  }, []);

  const handleNetworkChange = async (event: SelectChangeEvent) => {
    setChangingNetworks(true);
    setPXEInitialized(false);
    const nodeURL = event.target.value;
    setNodeURL(nodeURL);
    const node = await AztecEnv.connectToNode(nodeURL);
    setAztecNode(node);
    const pxe = await AztecEnv.initPXE(node, setLogs);
    const rollupAddress = (await pxe.getNodeInfo()).l1ContractAddresses
      .rollupAddress;
    const walletLogger =
      WebLogger.getInstance().createLogger("wallet:data:idb");
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
    setChangingNetworks(false);
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

  const handleNetworkAdded = async (network?: string, alias?: string) => {
    if (network && alias) {
      await NetworkDB.getInstance().storeNetwork(alias, network);
      const aliasedBuffers = await NetworkDB.getInstance().listNetworks();
      const aliasedNetworks = parseAliasedBuffersAsString(aliasedBuffers);
      const networks = [
        ...NETWORKS,
        ...aliasedNetworks.map((network) => ({
          nodeURL: network.value,
          name: network.key,
        })),
      ];
      setNetworks(networks);
    }
    setOpenAddNetworksDialog(false);
  };

  return (
    <div css={container}>
      <div css={header}>
        <Typography
          variant="h1"
          sx={{ fontSize: "65px", padding: 0, marginTop: "0.5rem" }}
        >
          Playground
        </Typography>
      </div>
      <Typography variant="overline">Connect</Typography>
      <FormControl css={select}>
        <InputLabel>Network</InputLabel>
        <Select
          fullWidth
          value={nodeURL}
          label="Network"
          disabled={changingNetworks}
          onChange={handleNetworkChange}
        >
          {networks.map((network) => (
            <MenuItem key={network.name} value={network.nodeURL}>
              {network.name} ({network.nodeURL})
            </MenuItem>
          ))}
          <MenuItem
            key="create"
            value=""
            onClick={() => setOpenAddNetworksDialog(true)}
          >
            <AddIcon />
            &nbsp;Create
          </MenuItem>
        </Select>
      </FormControl>
      <AddNetworksDialog
        open={openAddNetworksDialog}
        onClose={handleNetworkAdded}
      />
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
      <TxsPanel />
      <CreateAccountDialog
        open={openCreateAccountDialog}
        onClose={handleAccountCreation}
      />
    </div>
  );
}
