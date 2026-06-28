import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { CartProvider } from "./context/CartContext";
import { AuthProvider } from "./context/AuthContext";
import { SavedProvider } from "./context/SavedContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SavedProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </SavedProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
