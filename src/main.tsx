
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import { ThemeProvider } from "./app/theme/ThemeProvider";
  import { Toaster } from "./app/components/ui/sonner";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <ThemeProvider>
      <App />
      <Toaster />
    </ThemeProvider>
  );
