import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import AdminLogin from "./pages/AdminLogin.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import { getAdminToken } from "./services/api.js";

function safeGetAdminToken() {
  try {
    return getAdminToken();
  } catch (error) {
    console.error("Unable to read admin token:", error);
    return null;
  }
}

function ProtectedAdmin({ children }) {
  const token = safeGetAdminToken();

  if (!token) {
    return <Navigate to="/admin-login" replace />;
  }

  return children;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/admin-login" element={<AdminLogin />} />

      <Route
        path="/admin"
        element={
          <ProtectedAdmin>
            <AdminDashboard />
          </ProtectedAdmin>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;