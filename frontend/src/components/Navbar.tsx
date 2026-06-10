import { Link, useLocation } from 'react-router-dom';
import { CloudSun, Map, Heart, User, LogOut, Settings, BarChart2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

const Navbar = () => {
    const location = useLocation();
    const { user, logout } = useAuth(); 
    const [showDropdown, setShowDropdown] = useState(false);
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

    const isActive = (path: string) => location.pathname === path;

    const navLinkStyle = (path: string) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        textDecoration: 'none',
        color: isActive(path) ? '#3b82f6' : '#4b5563',
        fontWeight: isActive(path) ? 'bold' : 'normal',
        padding: '8px 12px',
        borderRadius: '8px',
        backgroundColor: isActive(path) ? '#eff6ff' : 'transparent',
        transition: 'all 0.2s'
    });

    return (
        <nav style={{ 
            backgroundColor: 'white', 
            padding: '10px 20px', 
            boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            position: 'sticky',
            top: 0,
            zIndex: 1000
        }}>
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: '#1e3a8a' }}>
                <CloudSun size={28} color="#3b82f6" />
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>MeteoHub</h1>
            </Link>
            <div style={{ display: 'flex', gap: '10px' }}>
                <Link to="/" style={navLinkStyle('/')}>
                    <Map size={18} /> Home
                </Link>
                <Link to="/stats" style={navLinkStyle('/stats')}>
                    <BarChart2 size={18} /> Statistics
                </Link>
                <Link to="/favorites" style={navLinkStyle('/favorites')}>
                    <Heart size={18} /> Favorites
                </Link>
            </div>
            <div style={{ position: 'relative' }}>
                {user ? (
                    <div>
                        <button 
                            onClick={() => setShowDropdown(!showDropdown)}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px', 
                                background: 'none', 
                                border: '1px solid #e5e7eb', 
                                padding: '4px 12px', 
                                borderRadius: '20px', 
                                cursor: 'pointer', 
                                backgroundColor: '#f9fafb' 
                            }}
                        >
                            {user.avatar_url && !avatarLoadFailed ? (
                                <img 
                                    src={user.avatar_url} 
                                    alt="Profile" 
                                    referrerPolicy="no-referrer"
                                    crossOrigin="anonymous"
                                    onError={() => setAvatarLoadFailed(true)}
                                    style={{ width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover' }} 
                                />
                            ) : (
                                <User size={16} color="#4b5563" />
                            )}
                            <span style={{ fontWeight: 'bold', color: '#374151' }}>
                                {user.username || 'My Account'}
                            </span>
                        </button>

                        {showDropdown && (
                            <div style={{ 
                                position: 'absolute', 
                                top: '45px', 
                                right: '0', 
                                backgroundColor: 'white', 
                                border: '1px solid #e5e7eb', 
                                borderRadius: '8px', 
                                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
                                width: '200px', 
                                overflow: 'hidden' 
                            }}>
                                <div style={{ padding: '12px 15px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
                                    <small style={{ color: '#6b7280' }}>Logged in as</small><br/>
                                    <strong style={{ display: 'block', marginBottom: '4px' }}>{user.username}</strong>
                                    <span style={{ 
                                        fontSize: '11px', 
                                        backgroundColor: '#dcfce7', 
                                        color: '#166534', 
                                        padding: '2px 6px', 
                                        borderRadius: '10px',
                                        fontWeight: 'bold'
                                    }}>
                                        Reputation: {user.reputation_score}
                                    </span>
                                </div>
                                
                                <Link to="/settings" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '10px 15px', textDecoration: 'none', color: '#4b5563' }}>
                                    <Settings size={16}/> Settings
                                </Link>
                                
                                <button 
                                    onClick={() => {
                                        logout();
                                        setShowDropdown(false);
                                    }} 
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '8px', 
                                        width: '100%', 
                                        padding: '10px 15px', 
                                        background: 'none', 
                                        border: 'none', 
                                        textAlign: 'left', 
                                        cursor: 'pointer', 
                                        color: '#dc2626',
                                        borderTop: '1px solid #f3f4f6'
                                    }}
                                >
                                    <LogOut size={16}/> Logout
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <Link 
                        to="/login"
                        style={{ 
                            backgroundColor: '#2563eb', 
                            color: 'white', 
                            textDecoration: 'none',
                            padding: '8px 16px', 
                            borderRadius: '8px', 
                            fontWeight: 'bold', 
                            fontSize: '14px'
                        }}
                    >
                        Login
                    </Link>
                )}
            </div>
        </nav>
    );
};

export default Navbar;