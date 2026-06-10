import { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate, useNavigate } from 'react-router-dom';
import { CloudSun } from 'lucide-react';

interface GoogleCredentialResponse {
    credential: string;
    select_by: string;
    client_id: string;
}

interface GoogleButtonConfig {
    theme?: 'outline' | 'filled_blue' | 'filled_black';
    size?: 'large' | 'medium' | 'small';
    locale?: string;
    width?: number;
}

interface GoogleAccountsId {
    initialize: (config: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
    }) => void;
    renderButton: (element: HTMLElement, config: GoogleButtonConfig) => void;
}

interface GoogleAccounts {
    id: GoogleAccountsId;
}

declare global {
    interface Window {
        google: {
            accounts: GoogleAccounts;
        };
    }
}

let lastGsiInitAt = 0;

const Login = () => {
    const { user, login } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (user) return;

        const now = Date.now();
        if (now - lastGsiInitAt < 1000) return;
        lastGsiInitAt = now;

        const initGoogleButton = () => {
            const btnElement = document.getElementById('google-btn');
            if (!btnElement) return;

            btnElement.innerHTML = '';

            window.google.accounts.id.initialize({
                client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
                callback: async (response: GoogleCredentialResponse) => {
                    try {
                        const authResponse = await fetch(
                            `${import.meta.env.VITE_API_URL as string}/auth/google`,
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id_token: response.credential }),
                            }
                        );

                        if (!authResponse.ok) throw new Error('Error authenticating on server');

                        const authData = await authResponse.json() as { access_token: string; refresh_token: string };
                        await login(authData.access_token, authData.refresh_token);
                        navigate('/');
                    } catch (error) {
                        console.error('Login failed:', error);
                        alert('Authentication failed. Try again.');
                    }
                },
            });

            window.google.accounts.id.renderButton(btnElement, {
                theme: 'outline',
                size: 'large',
                locale: 'ro',
                width: 250,
            });
        };

        if (window.google?.accounts?.id) {
            initGoogleButton();
        } else if (!document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.onload = initGoogleButton;
            document.body.appendChild(script);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    if (user) return <Navigate to="/" />;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', fontFamily: 'sans-serif' }}>
            <div style={{ backgroundColor: 'white', padding: '40px', borderRadius: '16px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)', textAlign: 'center', maxWidth: '400px' }}>
                <CloudSun size={64} color="#3b82f6" style={{ marginBottom: '20px' }} />
                <h1 style={{ margin: '0 0 10px 0', color: '#1f2937' }}>MeteoHub</h1>
                <p style={{ color: '#6b7280', marginBottom: '30px' }}>
                    Sign in to save favorite locations and access predictive analytics.
                </p>
                <div id="google-btn" style={{ display: 'flex', justifyContent: 'center', minHeight: '40px' }} />
            </div>
        </div>
    );
};

export default Login;