import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Auth from './pages/Auth';
import Chat from './pages/Chat'; // We will create this file in Step 3

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on startup
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  // Function to handle login (passed to Auth page)
  const handleLogin = (userData) => {
    setUser(userData);
  };

  // Function to logout
  const handleLogout = () => {
    localStorage.clear();
    setUser(null);
  };

  if (loading) return <div className="h-screen bg-[#111b21] flex items-center justify-center text-[#00a884]">Loading Kairos...</div>;

  return (
    <Routes>
      <Route
        path="/"
        element={!user ? <Auth onLoginSuccess={handleLogin} /> : <Navigate to="/chat" />}
      />
      <Route
        path="/chat"
        element={user ? <Chat user={user} onLogout={handleLogout} /> : <Navigate to="/" />}
      />
    </Routes>
  );
}

export default App;