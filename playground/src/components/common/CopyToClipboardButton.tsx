import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

export function CopyToClipboardButton({ data, disabled }: { data: string; disabled: boolean }) {
  const [open, setOpen] = useState(false);

  const handleClick = () => {
    setOpen(true);
    navigator.clipboard.writeText(data);
  };

  return (
    <>
      <IconButton disabled={disabled} onClick={handleClick} sx={{ color: 'var(--mui-palette-text-secondary)' }}>
        <ContentPasteIcon />
      </IconButton>
      <Snackbar
        message="Copied to clipboard"
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        autoHideDuration={2000}
        onClose={() => setOpen(false)}
        open={open}
      />
    </>
  );
}
