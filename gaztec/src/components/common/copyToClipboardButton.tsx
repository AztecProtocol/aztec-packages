import { useState } from "react";
import { IconButton, Snackbar } from "@mui/material";
import ContentPasteIcon from "@mui/icons-material/ContentPaste";

export function CopyToClipboardButton({ data }: { data: string }) {
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    setOpen(true);
    navigator.clipboard.writeText(data);
  };

  return (
    <>
      <IconButton onClick={handleClick} color="primary">
        <ContentPasteIcon />
      </IconButton>
      <Snackbar
        message="Copied to clibboard"
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        autoHideDuration={2000}
        onClose={() => setOpen(false)}
        open={open}
      />
    </>
  );
}
