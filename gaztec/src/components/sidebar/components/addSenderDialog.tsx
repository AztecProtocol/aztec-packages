import DialogTitle from "@mui/material/DialogTitle";
import Dialog from "@mui/material/Dialog";
import { Button, TextField, css } from "@mui/material";
import { useState } from "react";
import { AztecAddress } from "@aztec/circuits.js";

const creationForm = css({
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  padding: "1rem",
  alignItems: "center",
});

export function AddSendersDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: (sender?: AztecAddress, alias?: string) => void;
}) {
  const [alias, setAlias] = useState("");
  const [sender, setSender] = useState("");

  const addSender = async () => {
    const parsed = AztecAddress.fromString(sender);
    onClose(parsed, alias);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog onClose={handleClose} open={open}>
      <DialogTitle>Add contact</DialogTitle>
      <div css={creationForm}>
        <TextField
          value={sender}
          label="Contact"
          onChange={(event) => {
            setSender(event.target.value);
          }}
        />
        <TextField
          value={alias}
          label="Alias"
          onChange={(event) => {
            setAlias(event.target.value);
          }}
        />
        <Button disabled={alias === "" || sender === ""} onClick={addSender}>
          Add
        </Button>
        <Button color="error" onClick={handleClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}
