import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import {
  AccountWalletWithSecretKey,
  ContractDeployer,
  Fr,
} from "@aztec/aztec.js";
import {
  Autocomplete,
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
import { useContext, useEffect, useState } from "react";
import { ContractInstanceWithAddress, PublicKeys } from "@aztec/circuits.js";
import {
  ContractArtifact,
  FunctionArtifact,
  encodeArguments,
  getDefaultInitializer,
  getInitializer,
} from "@aztec/foundation/abi";
import { GITHUB_TAG_PREFIX } from "../../../utils/interactions";
import { AztecContext } from "../../home/home";
import { parseAliasedBuffersAsString } from "../../../utils/conversion";
import { FunctionParameter } from "../../common/fnParameter";

const creationForm = css({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  padding: "1rem",
  alignItems: "center",
});

export function DeployContractDialog({
  open,
  contractArtifact,
  onClose,
}: {
  open: boolean;
  contractArtifact: ContractArtifact;
  onClose: (contract?: ContractInstanceWithAddress, alias?: string) => void;
}) {
  const [alias, setAlias] = useState("");
  const [initializer, setInitializer] = useState<FunctionArtifact>(null);
  const [parameters, setParameters] = useState([]);
  const [deploying, setDeploying] = useState(false);
  const [aliasedAddresses, setAliasedAddresses] = useState([]);
  const { walletDB, wallet } = useContext(AztecContext);

  useEffect(() => {
    const defaultInitializer = getDefaultInitializer(contractArtifact);
    setInitializer(defaultInitializer);
    const setAliases = async () => {
      const accountAliases = await walletDB.listAliases("accounts");
      const contractAliases = await walletDB.listAliases("contracts");
      setAliasedAddresses(
        parseAliasedBuffersAsString([...accountAliases, ...contractAliases])
      );
    };
    setAliases();
  }, [contractArtifact]);

  const handleParameterChange = (index, value) => {
    parameters[index] = value;
    setParameters(parameters);
  };

  const handleClose = () => {
    onClose();
  };

  const deploy = async () => {
    setDeploying(true);

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

    const deployer = new ContractDeployer(
      contractArtifact,
      wallet,
      PublicKeys.default(),
      initializer?.name
    );

    let args = [];

    if (initializer && parameters.length > 0) {
      args = encodeArguments(initializer, parameters);
    }

    const deployed = await deployer
      .deploy(...args)
      .send()
      .wait();

    onClose(deployed.contract.instance, alias);
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Deploy contract</DialogTitle>
      <div css={creationForm}>
        {deploying ? (
          <>
            <Typography>Deploying...</Typography>
            <CircularProgress />
          </>
        ) : (
          <>
            <FormGroup sx={{ display: "flex" }}>
              <FormControl>
                <InputLabel>Initializer</InputLabel>
                <Select
                  value={initializer?.name ?? ""}
                  label="Initializer"
                  disabled={
                    !contractArtifact.functions.some((fn) => fn.isInitializer)
                  }
                  onChange={(e) => {
                    setInitializer(
                      getInitializer(contractArtifact, e.target.value)
                    );
                  }}
                >
                  {contractArtifact.functions
                    .filter((fn) => fn.isInitializer)
                    .map((fn) => (
                      <MenuItem key={fn.name} value={fn.name}>
                        {fn.name}
                      </MenuItem>
                    ))}
                </Select>
                {initializer &&
                  initializer.parameters.map((param, i) => (
                    <FunctionParameter
                      parameter={param}
                      key={param.name}
                      onParameterChange={(newValue) => {
                        handleParameterChange(i, newValue);
                      }}
                    />
                  ))}
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
            <Button disabled={alias === ""} onClick={deploy}>
              Deploy
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
