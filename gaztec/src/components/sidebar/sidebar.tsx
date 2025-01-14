import { css } from "@emotion/react";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import { PrivateContext } from "../home/home";
import { PrivateEnv } from "../../config";
import { createStore } from "@aztec/kv-store/indexeddb";
import { AccountWalletWithSecretKey, Fr, createLogger } from "@aztec/aztec.js";
import { WalletDB } from "../../utils/storage";
import { useContext, useState } from "react";
import { CreateAccountDialog } from "./components/createAccountDialog";
import { getSchnorrAccount } from "@aztec/accounts/schnorr";
import { AztecAddress, deriveSigningKey } from "@aztec/circuits.js";
import AddIcon from "@mui/icons-material/Add";
import logoURL from "../../assets/Aztec_logo.png";
import { Typography } from "@mui/material";
import {
  formatAddressAsString,
  parseAliasedAddresses,
} from "../../utils/addresses";

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
    wallet,
    walletDB,
    nodeURL,
    isPXEInitialized,
    pxe,
  } = useContext(PrivateContext);
  const [accounts, setAccounts] = useState([]);
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
    setAccounts(parseAliasedAddresses(aliasedAccounts));
    setWalletDB(walletDB);
    setPXE(pxe);
    setPXEInitialized(true);
  };

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
    setAccounts(parseAliasedAddresses(aliasedAccounts));
    setOpenCreateAccountDialog(false);
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
                  {formatAddressAsString(account.value)})
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
    </div>
  );
}
