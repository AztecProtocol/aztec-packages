import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';

export function CopyToClipboardButton({ data, disabled, sx }: { data: string; disabled: boolean; sx?: object }) {
  const [open, setOpen] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();

    setOpen(true);
    navigator.clipboard.writeText(data);
  };

  return (
    <>
      <IconButton disabled={disabled} onClick={handleClick} sx={{ color: 'var(--mui-palette-text-secondary)', ...sx }}>
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
