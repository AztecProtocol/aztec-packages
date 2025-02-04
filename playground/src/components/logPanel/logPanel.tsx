import { css, Global } from "@emotion/react";
import { AztecContext } from "../../aztecEnv";
import { useContext, useState } from "react";
import {
  CircularProgress,
  CssBaseline,
  Fab,
  styled,
  SwipeableDrawer,
  Typography,
} from "@mui/material";
import ArticleIcon from "@mui/icons-material/Article";

const Root = styled("div")(({ theme }) => ({
  height: "100%",
  ...theme.applyStyles("dark", {
    backgroundColor: theme.palette.background.default,
  }),
}));

const StyledBox = styled("div")(({ theme }) => ({
  backgroundColor: "#fff",
  ...theme.applyStyles("dark", {
    backgroundColor: "var(--mui-palette-primary)",
  }),
}));

const Puller = styled("div")(({ theme }) => ({
  width: 30,
  height: 6,
  backgroundColor: "var(--mui-palette-primary-light)",
  borderRadius: 3,
  position: "absolute",
  top: 8,
  left: "calc(50% - 20px)",
  ...theme.applyStyles("dark", {
    backgroundColor: "var(--mui-palette-primary-dark)",
  }),
}));

const logContainer = css({
  display: "flex",
  flexDirection: "row",
  backgroundColor: "var(--mui-palette-primary-light)",
  margin: "0.1rem",
  padding: "0.1rem 0.25rem",
  borderRadius: "0.5rem",
});

const logPrefix = css({
  width: "8rem",
  minWidth: "8rem",
  overflow: "hidden",
});

const logContent = css({
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  flexGrow: 1,
  overflow: "hidden",
  ":hover": css({
    whiteSpace: "unset",
    textOverflow: "unset",
    wordWrap: "break-word",
  }),
});

const logTimestamp = css({});

const safeStringify = (obj: any) =>
  JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v));

const drawerBleeding = 56;

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
            ".MuiDrawer-root > .MuiPaper-root": {
              height: `calc(50% - ${drawerBleeding}px)`,
              overflow: "visible",
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
              display: "flex",
              flexDirection: "row",
              position: "absolute",
              top: -drawerBleeding,
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              visibility: "visible",
              right: 0,
              left: 0,
              alignItems: "center",
            }}
          >
            <Puller />
            <Typography sx={{ p: 2, color: "text.secondary" }}>
              {logs.length}&nbsp;logs
            </Typography>
          </StyledBox>
          <StyledBox sx={{ px: 0.5, height: "100%", overflow: "auto" }}>
            {logs.map((log, index) => (
              <div key={`${log.timestamp}-${log.message}`} css={logContainer}>
                <div css={logPrefix}>
                  <Typography variant="subtitle2">
                    {log.prefix}:&nbsp;
                  </Typography>
                </div>
                <div css={logContent}>
                  <Typography variant="body2" sx={{ fontSize: "0.85rem" }}>
                    {log.message}&nbsp;
                    <span css={{ fontStyle: "italic", fontSize: "0.75rem" }}>
                      {safeStringify(log.data)}
                    </span>
                  </Typography>
                </div>
                <div css={logTimestamp}>
                  <Typography sx={{ marginLeft: "1rem" }} variant="body2">
                    +
                    {log.timestamp -
                      (logs[index + 1]?.timestamp ?? log.timestamp)}
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
          position: "absolute",
          bottom: "5rem",
          right: "1rem",
          "@media (width <= 800px)": {
            visibility: "hidden",
          },
        }}
        color="secondary"
        onClick={toggleDrawer(true)}
      >
        <ArticleIcon />
      </Fab>
    </>
  );
}
