import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import { AbiType, AuthWitness, AztecAddress, Contract } from "@aztec/aztec.js";
import {
  Button,
  CircularProgress,
  FormControl,
  FormGroup,
  TextField,
  Typography,
  css,
} from "@mui/material";
import { useContext, useState } from "react";
import { AztecContext } from "../../home/home";
import { prepTx } from "../../../utils/interactions";
import { FunctionParameter } from "../../common/fnParameter";

const creationForm = css({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  padding: "1rem",
  alignItems: "center",
});

const aztecAddressTypeLike: AbiType = {
  kind: "struct",
  path: "address::AztecAddress",
  fields: [{ name: "inner", type: { kind: "field" } }],
};

export function CreateAuthwitDialog({
  open,
  fnName,
  args,
  isPrivate,
  onClose,
}: {
  open: boolean;
  fnName: string;
  args: any[];
  isPrivate: boolean;
  onClose: (witness?: AuthWitness, alias?: string) => void;
}) {
  const [alias, setAlias] = useState("");
  const [caller, setCaller] = useState("");
  const [creating, setCreating] = useState(false);

  const { wallet, currentContract } = useContext(AztecContext);

  const handleClose = () => {
    onClose();
  };

  const createAuthwit = async () => {
    setCreating(true);
    const { encodedArgs } = await prepTx(
      currentContract.artifact,
      fnName,
      args
    );
    const action = currentContract.methods[fnName](...encodedArgs);
    console.log(`Creating authwit for ${fnName} with args:`, args);
    let witness;
    if (isPrivate) {
      witness = await wallet.createAuthWit({
        caller: AztecAddress.fromString(caller),
        action,
      });
    } else {
      await wallet
        .setPublicAuthWit(
          { caller: AztecAddress.fromString(caller), action },
          true
        )
        .send()
        .wait();
    }
    setAlias("");
    setCreating(false);
    onClose(witness, alias);
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Create authwit</DialogTitle>
      <div css={creationForm}>
        {creating ? (
          <>
            <Typography>Creating...</Typography>
            <CircularProgress />
          </>
        ) : (
          <>
            <FormGroup sx={{ display: "flex" }}>
              <FunctionParameter
                parameter={{
                  name: "caller",
                  type: aztecAddressTypeLike,
                  visibility: "private",
                }}
                onParameterChange={setCaller}
              ></FunctionParameter>
              {isPrivate && (
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
              )}
            </FormGroup>
            <Button disabled={alias === ""} onClick={createAuthwit}>
              Create
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
