import { css, Global } from '@emotion/react';
import { AztecContext } from '../../aztecEnv';
import { useContext } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import ExpandCircleDownIcon from '@mui/icons-material/ExpandCircleDown';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import Typography from '@mui/material/Typography';
import CloseButton from '@mui/icons-material/Close';
import { styled } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import DownloadIcon from '@mui/icons-material/Download';
import Tooltip from '@mui/material/Tooltip';
import { ButtonGroup } from '@mui/material';

const Root = styled('div')(({ theme }) => ({
  ...theme.applyStyles('dark', {
    backgroundColor: theme.palette.background.default,
  }),
}));

const StyledBox = styled('div')(({ theme }) => ({
  backgroundColor: '#fff',
  ...theme.applyStyles('dark', {
    backgroundColor: 'var(--mui-palette-primary)',
  }),
}));

const Puller = styled('div')(({ theme }) => ({
  width: 30,
  height: 6,
  backgroundColor: 'var(--mui-palette-primary-light)',
  borderRadius: 3,
  position: 'absolute',
  top: 8,
  left: 'calc(50% - 20px)',
  ...theme.applyStyles('dark', {
    backgroundColor: 'var(--mui-palette-primary-dark)',
  }),
}));

const logContainer = css({
  display: 'flex',
  flexDirection: 'row',
  backgroundColor: 'var(--mui-palette-primary-light)',
  margin: '0.1rem',
  padding: '0.1rem 0.25rem',
  borderRadius: '0.5rem',
});

const logPrefix = css({
  width: '8rem',
  minWidth: '8rem',
  overflow: 'hidden',
});

const logContent = css({
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  flexGrow: 1,
  overflow: 'hidden',
  ':hover': css({
    whiteSpace: 'unset',
    textOverflow: 'unset',
    wordWrap: 'break-word',
  }),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const safeStringify = (obj: any) => JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v));

const drawerBleeding = 56;

export function LogPanel() {
  const { logs, logsOpen, totalLogCount, setLogsOpen } = useContext(AztecContext);

  const downloadLogs = () => {
    const element = document.createElement('a');
    const file = new Blob(
      [
        logs
          .map(log => {
            return `${new Date(log.timestamp).toISOString()} [${log.type.toUpperCase()}] ${log.prefix} ${log.message
              } ${safeStringify(log.data)}`;
          })
          .join('\n'),
      ],
      { type: 'text/plain' },
    );
    element.href = URL.createObjectURL(file);
    element.download = 'myFile.txt';
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
  };

  return (
    <>
      <Root>
        <CssBaseline />
        <Global
          styles={{
            '.MuiDrawer-root > .MuiPaper-root': {
              height: `calc(50% - ${drawerBleeding}px)`,
              overflow: 'visible',
            },
          }}
        />
        {!logsOpen && (
          <Tooltip title="Open logs">
            <IconButton
              sx={{
                position: 'fixed',
                bottom: '0.5rem',
                right: '0.5rem',
                zIndex: 10000
              }}
              onClick={() => setLogsOpen(true)}>
              <ExpandCircleDownIcon sx={{ transform: 'rotate(180deg)' }} />
            </IconButton>
          </Tooltip>
        )}
        <SwipeableDrawer
          anchor="bottom"
          open={logsOpen}
          onClose={() => setLogsOpen(false)}
          onOpen={() => setLogsOpen(true)}
          swipeAreaWidth={drawerBleeding}
          disableSwipeToOpen={false}
          ModalProps={{
            keepMounted: true,
          }}
        >
          <StyledBox
            sx={{
              display: 'flex',
              flexDirection: 'row',
              position: 'absolute',
              top: -drawerBleeding,
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              visibility: 'visible',
              right: 0,
              left: 0,
              alignItems: 'center',
            }}
          >
            <Puller />
            <Typography sx={{ p: 2, color: 'text.secondary' }}>{totalLogCount}&nbsp;logs</Typography>
            <div style={{ flexGrow: 1, margin: 'auto' }} />
            {logsOpen && (
              <ButtonGroup>
                <Tooltip title="Download logs">
                  <IconButton onClick={() => downloadLogs()} >
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Close logs">
                  <IconButton onClick={() => setLogsOpen(false)}  sx={{ marginRight: '0.5rem' }}>
                    <CloseButton />
                  </IconButton>
                </Tooltip>
              </ButtonGroup>
            )}
          </StyledBox>
          <StyledBox sx={{ px: 0.5, height: '100%', overflow: 'auto' }}>
            {logs.map((log, index) => (
              <div key={log.id} css={logContainer}>
                <div css={logPrefix}>
                  <Typography variant="subtitle2">{log.prefix}</Typography>
                </div>
                <div css={logContent}>
                  <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                    {log.message}&nbsp;
                    <span css={{ fontStyle: 'italic', fontSize: '0.75rem' }}>{safeStringify(log.data)}</span>
                  </Typography>
                </div>
                <div>
                  <Typography sx={{ marginLeft: '1rem' }} variant="body2">
                    +{log.timestamp - (logs[index + 1]?.timestamp ?? log.timestamp)}
                    ms
                  </Typography>
                </div>
              </div>
            ))}
          </StyledBox>
        </SwipeableDrawer>
      </Root>
    </>
  );
}
