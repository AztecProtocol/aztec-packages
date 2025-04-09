import { css, Global } from '@emotion/react';
import { AztecContext } from '../../aztecEnv';
import { useContext } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import Fab from '@mui/material/Fab';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import Typography from '@mui/material/Typography';
import ArticleIcon from '@mui/icons-material/Article';
import { styled } from '@mui/material/styles';

const Root = styled('div')(({ theme }) => ({
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: 0,
  zIndex: 1001,
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
  height: 3,
  backgroundColor: 'var(--mui-palette-primary-light)',
  borderRadius: 3,
  position: 'absolute',
  top: 4,
  left: 'calc(50% - 15px)',
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

const logTimestamp = css({});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const safeStringify = (obj: any) => JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v));

const drawerBleeding = 20;

export function LogPanel() {
  const { logs, logsOpen, setLogsOpen } = useContext(AztecContext);

  const toggleDrawer = (newOpen: boolean) => () => {
    setLogsOpen(newOpen);
  };
  return (
    <>
      <Root>
        <CssBaseline />
        <Global
          styles={{
            '.MuiDrawer-root > .MuiPaper-root': {
              height: `calc(30% - ${drawerBleeding}px)`,
              overflow: 'visible',
            },
          }}
        />
        <SwipeableDrawer
          anchor="bottom"
          open={logsOpen}
          onClose={toggleDrawer(false)}
          onOpen={toggleDrawer(true)}
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
              height: drawerBleeding,
              maxHeight: drawerBleeding,
              overflow: 'hidden'
            }}
          >
            <Puller />
            <Typography sx={{ p: 1, color: 'text.secondary', fontSize: '0.75rem' }}>{logs.length}&nbsp;logs</Typography>
          </StyledBox>
          <StyledBox sx={{ px: 0.5, height: '100%', overflow: 'auto' }}>
            {logs.map((log, index) => (
              <div key={log.id} css={logContainer}>
                <div css={logPrefix}>
                  <Typography variant="subtitle2">{log.prefix}:&nbsp;</Typography>
                </div>
                <div css={logContent}>
                  <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                    {log.message}&nbsp;
                    <span css={{ fontStyle: 'italic', fontSize: '0.75rem' }}>{safeStringify(log.data)}</span>
                  </Typography>
                </div>
                <div css={logTimestamp}>
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
      <Fab
        sx={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          zIndex: 1000,
          backgroundColor: 'var(--mui-palette-primary-main)',
          color: 'white',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          width: '40px',
          minWidth: '40px',
          display: 'flex',
          alignItems: 'center',
          '&:hover': {
            backgroundColor: 'var(--mui-palette-primary-dark)',
            width: '300px',
            '& .MuiFab-label': {
              width: 'auto',
              margin: '0 8px',
              opacity: 1,
            },
          },
          '@media (width <= 800px)': {
            visibility: 'hidden',
          },
        }}
        onClick={toggleDrawer(true)}
      >
       <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        position: 'relative',
      }}
    >
      <ArticleIcon
        sx={{
          transition: 'opacity 0.3s ease',
          opacity: 1,
          '.MuiFab-root:hover &': {
            opacity: 0,
          },
        }}
      />
      <Typography
        sx={{
          whiteSpace: 'nowrap',
          opacity: 0,
          width: 0,
          transition: 'opacity 0.3s ease, width 0.3s ease',
          fontSize: '0.875rem',
          margin: 0,
          '.MuiFab-root:hover &': {
            opacity: 1,
            width: 'auto',
          },
        }}
      >
        PXE logs (advanced)
      </Typography>
</div>
      </Fab>
    </>
  );
}
