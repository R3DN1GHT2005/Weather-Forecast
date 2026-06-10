import { useEffect, useState } from 'react';
import axios from 'axios';
import api from '../services/api';
import WeatherCard from '../components/WeatherCard';
import AlertBanner from '../components/AlertBanner';
import { Loader2, HeartOff, Bell } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface CityDTO {
    id: number;
    name: string;
    lat: number | null;
    lng: number | null;
    temp_min: number | null;
    temp_max: number | null;
    wind: number | null;
    humidity: number | null;
    forecast_date: string | null;
}

interface CityAlert {
    id: number;
    alert_message: string;
    recommendation: string | null;
    created_at: string | null;
}

interface CityWithAlerts {
    cityName: string;
    alerts: CityAlert[];
}

const Favorites = () => {
    const { token } = useAuth();

    const [favoriteCities, setFavoriteCities] = useState<CityDTO[]>([]);
    const [isLoading, setIsLoading] = useState(!!token);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [cityBeingRemoved, setCityBeingRemoved] = useState<number | null>(null);
    const [citiesHavingAlerts, setCitiesHavingAlerts] = useState<CityWithAlerts[]>([]);

    useEffect(() => {
        if (!token) return;
        const abortController = new AbortController();
        const signal = abortController.signal;

        const loadFavoriteCities = async () => {
            try {
                const favoritesResponse = await api.get<CityDTO[]>('/users/me/favorites', {
                    headers: { Authorization: `Bearer ${token}` },
                    signal,
                });
                setFavoriteCities(favoritesResponse.data);

                const cityAlertResults = await Promise.all(
                    favoritesResponse.data.map(async (city) => {
                        try {
                            const alertResponse = await api.get<CityAlert[]>(`/cities/${city.id}/alerts/today`, {
                                headers: { Authorization: `Bearer ${token}` },
                                signal,
                            });
                            return { cityName: city.name, alerts: alertResponse.data };
                        } catch (error) {
                            if (axios.isAxiosError(error) && axios.isCancel(error)) return { cityName: city.name, alerts: [] };
                            return { cityName: city.name, alerts: [] };
                        }
                    })
                );
                setCitiesHavingAlerts(cityAlertResults.filter((cityWithAlerts) => cityWithAlerts.alerts.length > 0));
            } catch (error) {
                if (axios.isAxiosError(error) && axios.isCancel(error)) return;
                console.error("Error loading favorites:", error);
                setFetchError("Could not load favorites list.");
            } finally {
                setIsLoading(false);
            }
        };

        void loadFavoriteCities();

        return () => abortController.abort();
    }, [token]);

    if (!token) {
        return (
            <div style={{ color: '#dc2626', textAlign: 'center', padding: '40px', fontSize: '18px', fontWeight: 'bold' }}>
                You must be logged in to view favorites.
            </div>
        );
    }

    const handleRemoveFavorite = async (cityId: number) => {
        if (!token) return;

        setCityBeingRemoved(cityId);

        try {
            await api.delete(`/cities/${cityId}/save`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setFavoriteCities((currentCityList) => currentCityList.filter((city) => city.id !== cityId));
        } catch (error) {
            console.error('Error removing from favorites:', error);
            setFetchError('Could not remove city from favorites.');
        } finally {
            setCityBeingRemoved(null);
        }
    };

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px' }}>
                <Loader2 size={40} className="animate-spin" color="#3b82f6" />
            </div>
        );
    }

    if (fetchError) {
        return (
            <div style={{ color: '#dc2626', textAlign: 'center', padding: '40px' }}>
                {fetchError}
            </div>
        );
    }

    return (
        <div style={{ padding: '20px' }}>
            <h2 style={{ 
                marginBottom: '20px', 
                fontSize: '24px', 
                fontWeight: 'bold', 
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
            }}>
                ❤️ My Favorite Cities
            </h2>

            {citiesHavingAlerts.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#dc2626', fontWeight: 'bold', fontSize: '16px' }}>
                        <Bell size={20} />
                        Active alerts for your cities
                    </div>
                    {citiesHavingAlerts.map((city) =>
                        city.alerts.map((alert) => (
                            <AlertBanner
                                key={alert.id}
                                title={city.cityName}
                                message={`${alert.alert_message}${alert.recommendation ? ` — ${alert.recommendation}` : ''}`}
                                severity="warning"
                            />
                        ))
                    )}
                </div>
            )}

            {favoriteCities.length === 0 ? (
                <div style={{ 
                    textAlign: 'center', 
                    padding: '60px', 
                    backgroundColor: 'white', 
                    borderRadius: '12px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.05)'
                }}>
                    <HeartOff size={48} color="#9ca3af" style={{ marginBottom: '16px', margin: '0 auto' }} />
                    <p style={{ color: '#6b7280', fontSize: '18px' }}>
                        You have no saved locations.
                    </p>
                    <p style={{ color: '#9ca3af' }}>
                        Add cities from the map or search using the "Add to Favorites" button.
                    </p>
                </div>
            ) : (
                <>
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', 
                    gap: '24px' 
                }}>
                    {favoriteCities.map(city => (
                        <div key={city.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <WeatherCard city={city} />
                            <button
                                onClick={() => void handleRemoveFavorite(city.id)}
                                disabled={cityBeingRemoved === city.id}
                                style={{
                                    border: 'none',
                                    borderRadius: '10px',
                                    padding: '12px 14px',
                                    backgroundColor: '#fee2e2',
                                    color: '#b91c1c',
                                    fontWeight: 'bold',
                                    cursor: cityBeingRemoved === city.id ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
                                    width: '100%',
                                    fontSize: '15px',
                                }}
                            >
                                {cityBeingRemoved === city.id ? '...' : 'Remove from Favorites'}
                            </button>
                        </div>
                    ))}
                </div>
                </>
            )}
        </div>
    );
};

export default Favorites;