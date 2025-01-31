import { css, Global } from "@emotion/react";
import { AztecContext } from "../../aztecEnv";
import { useContext, useState } from "react";
import {
  Button,
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
  margin: "0.15rem",
  padding: "0.1rem 0.5rem",
  borderRadius: "0.5rem",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  ":hover": css({
    whiteSpace: "unset",
    textOverflow: "unset",
    wordWrap: "break-word",
  }),
});

const divider = css({
  minWidth: "10rem",
});

const safeStringify = (obj: any) =>
  JSON.stringify(obj, (_, v) => (typeof v === "bigint" ? v.toString() : v));

const drawerBleeding = 56;

export function LogPanel() {
  const { logs } = useContext(AztecContext);
  const [open, setOpen] = useState(false);

  const toggleDrawer = (newOpen: boolean) => () => {
    setOpen(newOpen);
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
          open={open}
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
              position: "absolute",
              top: -drawerBleeding,
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              visibility: "visible",
              right: 0,
              left: 0,
            }}
          >
            <Puller />
            <Typography sx={{ p: 2, color: "text.secondary" }}>
              {logs.length}&nbsp;logs
            </Typography>
          </StyledBox>
          <StyledBox sx={{ px: 2, pb: 2, height: "100%", overflow: "auto" }}>
            {logs.map((log, index) => (
              <div key={log.message} css={logContainer}>
                <div css={divider}>
                  <Typography variant="subtitle2">
                    {log.prefix}:&nbsp;
                  </Typography>
                </div>
                <Typography
                  sx={{ overflow: "hidden", flexGrow: 1 }}
                  variant="body2"
                >
                  {log.message}&nbsp;
                  <span css={{ fontStyle: "italic", fontSize: "0.8rem" }}>
                    {safeStringify(log.data)}
                  </span>
                </Typography>
                <div css={divider}>
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
        sx={{ position: "absolute", bottom: "5rem", right: "1rem" }}
        color="secondary"
        onClick={toggleDrawer(true)}
      >
        <ArticleIcon />
      </Fab>
    </>
  );
}
