import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import api from '../services/api';
import axios from 'axios';

interface User {
    id: number;
    email: string;
    username: string | null;
    avatar_url: string | null;
    reputation_score: number;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (accessToken: string, refreshToken: string) => Promise<void>; 
    logout: () => void;
    refreshUser: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export { AuthContext };

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('access_token'));
    const [isLoading, setIsLoading] = useState(true);

    const loadCurrentUser = useCallback(async (accessToken: string) => {
        const userResponse = await api.get<User>('/users/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        setUser(userResponse.data);
        return userResponse.data;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        setToken(null);
        setUser(null);
        setIsLoading(false);
    }, []);

    const login = useCallback(async (accessToken: string, refreshToken: string) => {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        setToken(accessToken);

        try {
            await loadCurrentUser(accessToken);
        } catch {
            logout();
        }
    }, [loadCurrentUser, logout]);

    const refreshUser = useCallback(async () => {
        const savedToken = localStorage.getItem('access_token');
        if (!savedToken) {
            setToken(null);
            setUser(null);
            return;
        }

        try {
            setToken(savedToken);
            await loadCurrentUser(savedToken);
        } catch {
            logout();
        }
    }, [loadCurrentUser, logout]);

    useEffect(() => {
        let isMounted = true;

        const initAuth = async () => {
            const savedToken = localStorage.getItem('access_token');
            if (!savedToken) {
                if (isMounted) setIsLoading(false);
                return;
            }

            try {
                const userData = await loadCurrentUser(savedToken);
                if (isMounted) {
                    setToken(savedToken);
                    setUser(userData);
                }
            } catch (error) {
                if (!axios.isAxiosError(error) || error.response?.status !== 401) {
                    console.error("Eroare la încărcarea profilului:", error);
                }
                if (isMounted) {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    setToken(null);
                    setUser(null);
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        initAuth();

        return () => { isMounted = false; };
    }, [loadCurrentUser]);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, refreshUser, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};