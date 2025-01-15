import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import { AccountWalletWithSecretKey, Contract } from "@aztec/aztec.js";
import {
  Button,
  CircularProgress,
  FormControl,
  FormGroup,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  css,
} from "@mui/material";
import { useContext, useState } from "react";
import { AztecAddress, ContractInstanceWithAddress } from "@aztec/circuits.js";
import { ContractArtifact, getInitializer } from "@aztec/foundation/abi";
import { GITHUB_TAG_PREFIX } from "../../../utils/interactions";
import { FunctionParameter } from "../../common/fnParameter";
import { AztecContext } from "../../home/home";

const creationForm = css({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  padding: "1rem",
  alignItems: "center",
});

export function RegisterContractDialog({
  open,
  contractArtifact,
  onClose,
}: {
  open: boolean;
  contractArtifact: ContractArtifact;
  onClose: (contract?: ContractInstanceWithAddress, alias?: string) => void;
}) {
  const [alias, setAlias] = useState("");
  const [address, setAddress] = useState("");
  const [registering, setRegistering] = useState(false);

  const { wallet, node } = useContext(AztecContext);

  const handleClose = () => {
    onClose();
  };

  const register = async () => {
    setRegistering(true);

    const nodeInfo = await wallet.getNodeInfo();
    const expectedAztecNrVersion = `${GITHUB_TAG_PREFIX}-v${nodeInfo.nodeVersion}`;
    if (
      contractArtifact.aztecNrVersion &&
      contractArtifact.aztecNrVersion !== expectedAztecNrVersion
    ) {
      throw new Error(
        `Contract was compiled with a different version of Aztec.nr: ${contractArtifact.aztecNrVersion}. Consider updating Aztec.nr to ${expectedAztecNrVersion}`
      );
    }

    const contractInstance = await node.getContract(
      AztecAddress.fromString(address)
    );

    await wallet.registerContract({
      instance: contractInstance,
    });

    const contract = await Contract.at(
      AztecAddress.fromString(address),
      contractArtifact,
      wallet
    );

    onClose(contract.instance, alias);
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Deploy contract</DialogTitle>
      <div css={creationForm}>
        {registering ? (
          <>
            <Typography>Registering...</Typography>
            <CircularProgress />
          </>
        ) : (
          <>
            <FormGroup sx={{ display: "flex" }}>
              <FormControl>
                <TextField
                  placeholder="Address"
                  value={address}
                  label="Address"
                  sx={{ marginTop: "1rem" }}
                  onChange={(event) => {
                    setAddress(event.target.value);
                  }}
                />
              </FormControl>
              <FormControl>
                <TextField
                  placeholder="Alias"
                  value={alias}
                  label="Alias"
                  sx={{ marginTop: "1rem" }}
                  onChange={(event) => {
                    setAlias(event.target.value);
                  }}
                />
              </FormControl>
            </FormGroup>
            <Button disabled={alias === ""} onClick={register}>
              Register
            </Button>
            <Button color="error" onClick={handleClose}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </Dialog>
  );
}
