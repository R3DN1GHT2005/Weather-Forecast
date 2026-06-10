import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import api from '../services/api';

const Settings = () => {
    const { user, token, refreshUser } = useAuth();
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

    useEffect(() => {
        if (!user) {
            navigate('/login');
            return;
        }

        setUsername(user.username ?? '');
        setAvatarLoadFailed(false);
    }, [user, navigate]);

    const handleSaveSettings = async () => {
        if (!token) return;
        setIsLoading(true);
        setMessage(null);

        try {
            await api.patch('/users/me/settings', 
                { username },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            await refreshUser();
            setMessage({ type: 'success', text: 'Settings saved successfully!' });
        } catch (error) {
            console.error('Error saving:', error);
            setMessage({ type: 'error', text: 'Username cannot be empty.' });
        } finally {
            setIsLoading(false);
        }
    };

    if (!user) {
        return <div>Loading...</div>;
    }

    return (
        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
            <button 
                onClick={() => navigate('/')}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    color: '#3b82f6',
                    cursor: 'pointer',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    marginBottom: '20px'
                }}
            >
                <ArrowLeft size={20} /> Back
            </button>

            <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                padding: '30px'
            }}>
                <h1 style={{ margin: '0 0 30px 0', color: '#1f2937', fontSize: '24px' }}>⚙️ Account Settings</h1>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                        Email (Google)
                    </label>
                    <input
                        type="email"
                        value={user.email}
                        disabled
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            backgroundColor: '#f3f4f6',
                            color: '#6b7280',
                            cursor: 'not-allowed',
                            boxSizing: 'border-box'
                        }}
                    />
                    <small style={{ color: '#9ca3af', display: 'block', marginTop: '4px' }}>
                        Email is linked to your Google account and cannot be changed.
                    </small>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                        Username
                    </label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter a username"
                        style={{
                            width: '100%',
                            padding: '10px 12px',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            fontSize: '14px',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                        Avatar (from Google)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {user.avatar_url && !avatarLoadFailed ? (
                            <img
                                src={user.avatar_url}
                                alt="Avatar"
                                referrerPolicy="no-referrer"
                                crossOrigin="anonymous"
                                onError={() => setAvatarLoadFailed(true)}
                                style={{
                                    width: '80px',
                                    height: '80px',
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: '2px solid #e5e7eb'
                                }}
                            />
                        ) : (
                            <div style={{
                                width: '80px',
                                height: '80px',
                                borderRadius: '50%',
                                backgroundColor: '#f3f4f6',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#9ca3af'
                            }}>
                                No avatar
                            </div>
                        )}
                        <small style={{ color: '#9ca3af' }}>
                            Avatar is retrieved from your Google account and updates automatically at login.
                        </small>
                    </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#374151' }}>
                        Reputation
                    </label>
                    <div style={{
                        padding: '10px 12px',
                        backgroundColor: '#f0fdf4',
                        border: '1px solid #86efac',
                        borderRadius: '8px',
                        color: '#166534',
                        fontWeight: 'bold'
                    }}>
                        {user.reputation_score} points
                    </div>
                </div>

                {message && (
                    <div style={{
                        padding: '12px 16px',
                        marginBottom: '20px',
                        borderRadius: '8px',
                        backgroundColor: message.type === 'success' ? '#dcfce7' : '#fee2e2',
                        color: message.type === 'success' ? '#166534' : '#dc2626',
                        border: `1px solid ${message.type === 'success' ? '#86efac' : '#fca5a5'}`
                    }}>
                        {message.text}
                    </div>
                )}

                <button
                    onClick={handleSaveSettings}
                    disabled={isLoading}
                    style={{
                        width: '100%',
                        padding: '12px',
                        backgroundColor: isLoading ? '#e5e7eb' : '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        fontSize: '16px'
                    }}
                >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
            </div>
        </div>
    );
};

export default Settings;
