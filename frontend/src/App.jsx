import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AppDetails from './pages/AppDetails';
import { Activity } from 'lucide-react';

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

const Navbar = () => {
  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Activity size={28} color="var(--accent-primary)" />
        <span>Vee Monitor</span>
      </div>
      <div>
        <button onClick={handleLogout} className="btn-icon" title="התנתק">
          התנתק
        </button>
      </div>
    </nav>
  );
};

function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        {localStorage.getItem('token') && <Navbar />}
        <main className="main-content">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />
            <Route path="/app/:id" element={
              <ProtectedRoute>
                <AppDetails />
              </ProtectedRoute>
            } />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
