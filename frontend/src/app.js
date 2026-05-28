import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import AuthPage from "./Pages/AuthPage";
import FlatSetupPage from "./Pages/FlatSetupPage";
import HomePage from "./Pages/HomePage";
import HousePage from "./Pages/HousePage";
import SettingsPage from "./Pages/SettingsPage";
import ShoppingListPage from "./Pages/ShoppingListPage";

function AppShell() {
  const { currentUser, userFlat, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div style={{
        background: "#0a0a0a",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{
          color: "#FF4B00",
          fontFamily: "Space Grotesk, sans-serif",
          fontSize: 11,
          letterSpacing: 4,
          textTransform: "uppercase",
          fontWeight: 800,
        }}>
          Loading...
        </span>
      </div>
    );
  }

  if (!currentUser) return <AuthPage />;
  if (!userFlat) return <FlatSetupPage />;

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/house" element={<HousePage />} />
      <Route path="/shopping" element={<ShoppingListPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppShell />
      </Router>
    </AuthProvider>
  );
}
