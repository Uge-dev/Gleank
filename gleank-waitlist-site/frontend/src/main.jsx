import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles/global.css";

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      error,
    };
  }

  componentDidCatch(error, info) {
    console.error("Frontend crash:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ padding: "32px", fontFamily: "Arial, sans-serif" }}>
          <h1>Gleank frontend crashed</h1>
          <p>
            Check the message below. This helps us know the exact file causing
            the blank page.
          </p>

          <pre
            style={{
              whiteSpace: "pre-wrap",
              background: "#111",
              color: "#fff",
              padding: "18px",
              borderRadius: "12px",
              overflowX: "auto",
            }}
          >
            {String(
              this.state.error?.stack ||
                this.state.error?.message ||
                this.state.error,
            )}
          </pre>
        </main>
      );
    }

    return this.props.children;
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element with id='root' was not found in index.html.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>,
);