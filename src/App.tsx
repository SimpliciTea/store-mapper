import { createTheme, MantineProvider } from "@mantine/core";
import { CanvasContainer } from "./components/Canvas";
import "@mantine/core/styles.css";

const theme = createTheme({});

function App() {
  return (
    <MantineProvider theme={theme}>
      <div
        style={{
          minHeight: "100vh",
          minWidth: "100vw",
          overflow: "hidden",
          backgroundColor: "lightgray",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CanvasContainer />
      </div>
    </MantineProvider>
  );
}

export default App;
