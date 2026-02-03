import { css, Global } from '@emotion/react';
import { AztecContext } from '../../aztecContext';
import { useContext } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDropDown';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import Typography from '@mui/material/Typography';
import CloseButton from '@mui/icons-material/Close';
import { styled } from '@mui/material/styles';
import IconButton from '@mui/material/IconButton';
import DownloadIcon from '@mui/icons-material/Download';
import Tooltip from '@mui/material/Tooltip';
import { ButtonGroup, useMediaQuery } from '@mui/material';
import { colors, commonStyles } from '../../global.styles';

const Root = styled('div')(({ theme }) => ({
  ...theme.applyStyles('dark', {
    backgroundColor: theme.palette.background.default,
  }),
}));

const StyledBox = styled('div')(({ theme }) => ({
  ...theme.applyStyles('dark', {
    backgroundColor: commonStyles.glassPaperDark,
    backdropFilter: commonStyles.backdropBlur,
  }),
}));

const Puller = styled('div')(({ theme }) => ({
  width: 30,
  height: 6,
  backgroundColor: colors.primary.main,
  borderRadius: commonStyles.borderRadius,
  position: 'absolute',
  top: 8,
  left: 'calc(50% - 20px)',
  ...theme.applyStyles('dark', {
    backgroundColor: colors.primary.main,
  }),
}));

const logContainer = css({
  display: 'flex',
  flexDirection: 'row',
  backgroundColor: commonStyles.glassDarker,
  border: commonStyles.borderNormal,
  color: colors.text.primary,
  margin: '0.1rem',
  padding: '0.5rem 0.75rem',
  borderRadius: commonStyles.borderRadius,
});

const logPrefix = css({
  width: '8rem',
  minWidth: '8rem',
  overflow: 'hidden',
  color: colors.primary.main,
  fontWeight: 600,
});

const logContent = css({
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  flexGrow: 1,
  overflow: 'hidden',
  color: colors.text.primary,
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
  const isMobile = useMediaQuery('(max-width: 900px)');

  const downloadLogs = () => {
    const element = document.createElement('a');
    const file = new Blob(
      [
        logs
          .map(log => {
            return `${new Date(log.timestamp).toISOString()} [${log.type.toUpperCase()}] ${log.prefix} ${
              log.message
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
      {!logsOpen && !isMobile && (
        <Tooltip title="Open logs">
          <IconButton
            sx={{
              backgroundColor: colors.secondary.main,
              position: 'fixed',
              bottom: '4rem',
              right: '1rem',
              width: '2rem',
              height: '2rem',
              zIndex: 999999,
              pointerEvents: 'auto',
            }}
            onClick={() => setLogsOpen(true)}
          >
            <ArrowDownwardIcon sx={{ transform: 'rotate(180deg)' }} />
          </IconButton>
        </Tooltip>
      )}
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
              borderTopLeftRadius: 0,
              borderTopRightRadius: 0,
              border: '1px solid rgba(212, 255, 40, 0.2)',
              borderBottom: 'none',
              visibility: 'visible',
              right: 0,
              left: 0,
              alignItems: 'center',
            }}
          >
            <Puller />
            <Typography sx={{ p: 2, color: colors.primary.main, fontWeight: 600 }}>
              {totalLogCount}&nbsp;logs
            </Typography>
            <div style={{ flexGrow: 1, margin: 'auto' }} />
            {logsOpen && (
              <ButtonGroup>
                <Tooltip title="Download logs">
                  <IconButton onClick={() => downloadLogs()}>
                    <DownloadIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Close logs">
                  <IconButton onClick={() => setLogsOpen(false)} sx={{ marginRight: '0.5rem' }}>
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
                  <Typography
                    sx={{ marginLeft: '1rem', color: colors.secondary.main, fontWeight: 500 }}
                    variant="body2"
                  >
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
