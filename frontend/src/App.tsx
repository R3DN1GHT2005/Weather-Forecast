import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CityDetails from './pages/CityDetails';
import Statistics from './pages/Statistics'; 
import Favorites from './pages/Favorites'; 
import Settings from './pages/Settings';
import Login from './pages/Login';
import Navbar from './components/Navbar';    
import { ProtectedRoute } from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <div style={{ backgroundColor: '#f3f4f6', minHeight: '100vh' }}>
        <Navbar />
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
            <Routes>
              {/* Rute Publice */}
              <Route path="/" element={<Dashboard />} />
              <Route path="/login" element={<Login />} />
              <Route path="/city/:id" element={<CityDetails />} />
              
              {/* Rute Protejate */}
              <Route path="/stats" element={<Statistics />} />
              <Route 
                path="/favorites" 
                element={
                  <ProtectedRoute>
                    <Favorites />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/settings" 
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                } 
              />
            </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;