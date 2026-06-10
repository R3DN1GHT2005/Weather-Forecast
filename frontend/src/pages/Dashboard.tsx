import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Globe } from 'lucide-react';
import MapView from '../components/MapView';
import WeatherCard from '../components/WeatherCard';
import api from '../services/api';
import type { CityWeatherCardData } from '../types/weather';
import { useAuth } from '../hooks/useAuth';
import axios from 'axios';

interface SearchedCity extends CityWeatherCardData {
    forecast_date: string | null;
}

interface PredictionResponse {
    avg_temp_min: number;
    avg_temp_max: number;
    avg_wind_speed: number;
    avg_humidity: number;
    icon_type: string;
    uv_index: string;
}

interface SuggestionCity {
    id: number;
    name: string;
    lat?: number;
    latitude?: number;
    lng?: number;
    longitude?: number;
    temp_min?: number | null;
    temp_max?: number | null;
    wind?: number | null;
    humidity?: number | null;
    forecast_date?: string | null;
    country_name?: string;
}

const todayFormattedDate = () => new Date().toISOString().slice(0, 10);

const mapToSearchedCity = (city: SuggestionCity, predictionDate: string) => ({
    id: city.id,
    name: city.name,
    lat: city.lat ?? city.latitude ?? 0,
    lng: city.lng ?? city.longitude ?? 0,
    temp_min: city.temp_min ?? null,
    temp_max: city.temp_max ?? null,
    wind: city.wind ?? null,
    humidity: city.humidity ?? null,
    forecast_date: city.forecast_date ?? predictionDate,
});

const Dashboard = () => {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [visibleCities, setVisibleCities] = useState<CityWeatherCardData[]>([]);
    const [countries, setCountries] = useState<{ id: number; name: string }[]>([]);
    const [mapTargetLocation, setMapTargetLocation] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
    const [searchInputValue, setSearchInputValue] = useState('');
    const [citySuggestions, setCitySuggestions] = useState<SuggestionCity[]>([]);
    const [isShowingSuggestions, setIsShowingSuggestions] = useState(false);
    const [selectedCity, setSelectedCity] = useState<SearchedCity | null>(null);
    const [citySearchError, setCitySearchError] = useState<string | null>(null);
    const [selectedForecastDate, setSelectedForecastDate] = useState('');
    const [isPredictionLoading, setIsPredictionLoading] = useState(false);
    const [isCityFavorite, setIsCityFavorite] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
    const latestSearchQuery = useRef('');

    useEffect(() => {
        const syncFavoriteState = async () => {
            if (!token || !selectedCity) {
                setIsCityFavorite(false);
                return;
            }

            try {
                const favoritesResponse = await api.get<Array<{ id: number }>>('/users/me/favorites', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setIsCityFavorite(favoritesResponse.data.some((favorite) => favorite.id === selectedCity.id));
            } catch (error) {
                console.error('Error syncing favorite state:', error);
            }
        };

        void syncFavoriteState();
    }, [selectedCity, token]);

    useEffect(() => {
        api.get('/countries')
            .then(response => setCountries(response.data))
            .catch(error => console.error("Error loading countries:", error));
    }, []);

    const handleCountryChange = async (countryId: string) => {
        if (!countryId) return;
        try {
            const citiesResponse = await api.get(`/countries/${countryId}/cities`);
            if (citiesResponse.data && citiesResponse.data.length > 0) {
                const firstCity = citiesResponse.data[0];
                const targetLat = firstCity.lat ?? firstCity.latitude;
                const targetLng = firstCity.lng ?? firstCity.longitude;
                if (targetLat !== undefined && targetLat !== null && targetLng !== undefined && targetLng !== null) {
                    setMapTargetLocation({ lat: targetLat, lng: targetLng, zoom: 6 });
                }
            }
        } catch (error) {
            console.error("Error loading cities by country:", error);
        }
    };

    const handleCitySearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const searchQuery = latestSearchQuery.current || searchInputValue;
        if (!searchQuery.trim()) return;
        setCitySearchError(null);
        setIsShowingSuggestions(false);

        try {
            const searchResponse = await api.get(`/cities/search?q=${searchQuery}`);
            if (searchResponse.data && searchResponse.data.length > 0) {
                const city = searchResponse.data[0];
                const currentDate = todayFormattedDate();
                const targetLat = city.lat ?? city.latitude;
                const targetLng = city.lng ?? city.longitude;
                if (targetLat !== undefined && targetLat !== null && targetLng !== undefined && targetLng !== null) {
                    setMapTargetLocation({ lat: targetLat, lng: targetLng, zoom: 10 });
                }
                setSelectedCity(mapToSearchedCity(city, currentDate));
                setSelectedForecastDate(currentDate);
                setIsCityFavorite(false);

                // Auto-load prediction for today
                try {
                    setIsPredictionLoading(true);
                    const predictionData = await loadPrediction(city.id, currentDate);
                    setSelectedCity(previousState => previousState ? {
                        ...previousState,
                        temp_min: predictionData.temp_min,
                        temp_max: predictionData.temp_max,
                        wind: predictionData.wind,
                        humidity: predictionData.humidity,
                        icon_type: predictionData.icon_type,
                        uv_index: predictionData.uv_index,
                        forecast_date: currentDate,
                    } : previousState);
                } catch {
                    // prediction not available, show N/A
                } finally {
                    setIsPredictionLoading(false);
                }
            } else {
                setCitySearchError("No city found with this name.");
            }
        } catch {
            setCitySearchError("Search error. Try again.");
        }
    };

    const handleSearchInputChange = async (value: string) => {
        setSearchInputValue(value);
        latestSearchQuery.current = value;
        if (value.length < 2) {
            setCitySuggestions([]);
            setIsShowingSuggestions(false);
            return;
        }

        try {
            const searchResponse = await api.get(`/cities/search?q=${value}`);
            setCitySuggestions(searchResponse.data || []);
            setIsShowingSuggestions(true);
        } catch {
            setCitySuggestions([]);
        }
    };

    const loadPrediction = async (cityId: number, targetDate: string) => {
        const predictionResponse = await api.get<PredictionResponse>(
            `/forecasts/${cityId}/prediction?target_date=${targetDate}`
        );

        return {
            temp_min: predictionResponse.data.avg_temp_min,
            temp_max: predictionResponse.data.avg_temp_max,
            wind: predictionResponse.data.avg_wind_speed,
            humidity: Math.round(predictionResponse.data.avg_humidity),
            icon_type: predictionResponse.data.icon_type,
            uv_index: predictionResponse.data.uv_index,
        };
    };

    const handleSelectSuggestion = async (city: SuggestionCity) => {
        const currentDate = todayFormattedDate();
        setSearchInputValue(city.name);
        const targetLat: number | undefined = city.lat ?? city.latitude ?? undefined;
        const targetLng: number | undefined = city.lng ?? city.longitude ?? undefined;
        if (targetLat !== undefined && targetLat !== null && targetLng !== undefined && targetLng !== null) {
            setMapTargetLocation({ lat: targetLat, lng: targetLng, zoom: 10 });
        }
        setSelectedCity(mapToSearchedCity(city, currentDate));
        setSelectedForecastDate(currentDate);
        setIsShowingSuggestions(false);
        setIsCityFavorite(false);
        setCitySearchError(null);

        // Auto-load prediction for today
        try {
            setIsPredictionLoading(true);
            const predictionResult = await loadPrediction(city.id, currentDate);
            setSelectedCity(previousState => previousState ? {
                ...previousState,
                temp_min: predictionResult.temp_min,
                temp_max: predictionResult.temp_max,
                wind: predictionResult.wind,
                humidity: predictionResult.humidity,
                icon_type: predictionResult.icon_type,
                uv_index: predictionResult.uv_index,
                forecast_date: currentDate,
            } : previousState);
        } catch (error) {
            console.error('Error auto-loading prediction:', error);
        } finally {
            setIsPredictionLoading(false);
        }
    };

    const handleGetPrediction = async () => {
        if (!selectedCity || !selectedForecastDate) return;
        setIsPredictionLoading(true);
        try {
            const predictionResult = await loadPrediction(selectedCity.id, selectedForecastDate);

            setSelectedCity(previousState => previousState ? {
                ...previousState,
                temp_min: predictionResult.temp_min,
                temp_max: predictionResult.temp_max,
                wind: predictionResult.wind,
                humidity: predictionResult.humidity,
                icon_type: predictionResult.icon_type,
                uv_index: predictionResult.uv_index,
                forecast_date: selectedForecastDate,
            } : previousState);
        } catch {
            alert("Error loading prediction.");
        } finally {
            setIsPredictionLoading(false);
        }
    };

    const handleToggleFavorite = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedCity) return;
        if (!token) return;
        setIsFavoriteLoading(true);
        try {
            if (isCityFavorite) {
                await api.delete(`/cities/${selectedCity.id}/save`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setIsCityFavorite(false);
            } else {
                await api.post(`/cities/${selectedCity.id}/save`, {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setIsCityFavorite(true);
            }
        } catch (error: unknown) {
            if (axios.isAxiosError(error) && error.response?.status === 409) {
                alert('This city is already in your favorites!');
            } else {
                alert("Error saving the city.");
            }
        } finally {
            setIsFavoriteLoading(false);
        }
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <h2 style={{ color: '#1f2937', marginBottom: '5px' }}>🗺️ National Weather Map</h2>
            <p style={{ color: '#6b7280', marginBottom: '20px' }}>
                Navigate the globe using the search below, or zoom manually.
            </p>

            {/* CONTROALE */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', minWidth: '200px' }}>
                    <Globe size={18} color="#2563eb" style={{ marginRight: '8px' }} />
                    <select
                        onChange={(event) => handleCountryChange(event.target.value)}
                        style={{ border: 'none', outline: 'none', width: '100%', fontSize: '15px', backgroundColor: 'transparent', cursor: 'pointer' }}
                    >
                        <option value="">Choose a country...</option>
                        {countries.map(country => (
                            <option key={country.id} value={country.id}>{country.name}</option>
                        ))}
                    </select>
                </div>

                <form onSubmit={handleCitySearch} style={{ display: 'flex', alignItems: 'center', backgroundColor: 'white', padding: '8px 12px', borderRadius: '8px', border: '1px solid #d1d5db', flex: 1, minWidth: '250px', position: 'relative' }}>
                    <MapPin size={18} color="#ef4444" style={{ marginRight: '8px' }} />
                    <div style={{ position: 'relative', width: '100%' }}>
                        <input
                            type="text"
                            placeholder="Search a city..."
                            value={searchInputValue}
                            onChange={(event) => handleSearchInputChange(event.target.value)}
                            onFocus={() => citySuggestions.length > 0 && setIsShowingSuggestions(true)}
                            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '15px' }}
                        />
                        {isShowingSuggestions && citySuggestions.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '300px', overflowY: 'auto', zIndex: 10 }}>
                                {citySuggestions.map((city: SuggestionCity) => (
                                    <div
                                        key={city.id}
                                        onClick={() => handleSelectSuggestion(city)}
                                        onMouseEnter={(event) => (event.currentTarget.style.backgroundColor = '#f9fafb')}
                                        onMouseLeave={(event) => (event.currentTarget.style.backgroundColor = 'transparent')}
                                        style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                                    >
                                        <div style={{ fontSize: '15px', fontWeight: 'bold', color: '#1f2937' }}>{city.name}</div>
                                        {city.country_name && <div style={{ fontSize: '12px', color: '#9ca3af' }}>{city.country_name}</div>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <button type="submit" style={{ padding: '6px 14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', marginLeft: '8px' }}>
                        <Search size={14} />
                    </button>
                </form>
            </div>

            {/* CARD ORAȘ CĂUTAT */}
            {citySearchError && (
                <div style={{ padding: '12px 16px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '8px', marginBottom: '15px' }}>
                    {citySearchError}
                </div>
            )}

            {selectedCity && (
                <div style={{ backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '20px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
                    {/* Info vreme */}
                    <div style={{ flex: 1, minWidth: '220px' }}>
                        <h3 style={{ margin: '0 0 12px 0', color: '#1f2937', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            📍 {selectedCity.name}
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div style={{ backgroundColor: '#eff6ff', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>Min Temp</div>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#2563eb' }}>
                                    {selectedCity.temp_min != null ? `${selectedCity.temp_min}°C` : 'N/A'}
                                </div>
                            </div>
                            <div style={{ backgroundColor: '#fef2f2', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>Max Temp</div>
                                <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#dc2626' }}>
                                    {selectedCity.temp_max != null ? `${selectedCity.temp_max}°C` : 'N/A'}
                                </div>
                            </div>
                            <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>Wind</div>
                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#16a34a' }}>
                                    {selectedCity.wind != null ? `${selectedCity.wind} km/h` : 'N/A'}
                                </div>
                            </div>
                            <div style={{ backgroundColor: '#fefce8', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>Humidity</div>
                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ca8a04' }}>
                                    {selectedCity.humidity != null ? `${selectedCity.humidity}%` : 'N/A'}
                                </div>
                            </div>
                            {selectedCity.icon_type && (
                                <div style={{ gridColumn: '1 / -1', backgroundColor: '#f3e8ff', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#7c3aed' }}>
                                        {selectedCity.icon_type}
                                    </div>
                                </div>
                            )}
                            {selectedCity.uv_index && (
                                <div style={{ gridColumn: '1 / -1', backgroundColor: '#fef3c7', borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#92400e' }}>
                                        UV Index: {selectedCity.uv_index}
                                    </div>
                                </div>
                            )}
                        </div>
                        {selectedCity.forecast_date && (
                            <div style={{ marginTop: '8px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>
                                Forecast date: {selectedCity.forecast_date}
                            </div>
                        )}
                    </div>

                    {/* Predicție + Favorite */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '220px' }}>
                        <div style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '14px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#374151', marginBottom: '8px' }}>
                                📅 Forecast for Date
                            </div>
                            <input
                                type="date"
                                value={selectedForecastDate}
                                onChange={(event) => setSelectedForecastDate(event.target.value)}
                                style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '14px', marginBottom: '8px', boxSizing: 'border-box' }}
                            />
                            <button
                                onClick={handleGetPrediction}
                                disabled={!selectedForecastDate}
                                style={{ width: '100%', padding: '8px', backgroundColor: selectedForecastDate ? '#2563eb' : '#e5e7eb', color: selectedForecastDate ? 'white' : '#9ca3af', border: 'none', borderRadius: '6px', cursor: selectedForecastDate ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '14px', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                            >
                                {isPredictionLoading ? 'Generating...' : 'Generate Forecast'}
                            </button>
                        </div>

                        <button
                            onClick={() => navigate(`/city/${selectedCity.id}`)}
                            style={{ padding: '10px', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                        >
                            City Statistics
                        </button>

                        {/* Buton Favorite */}
                        {token ? (
                            <button
                                onClick={handleToggleFavorite}
                                disabled={isFavoriteLoading}
                                style={{ padding: '10px', backgroundColor: isCityFavorite ? '#fee2e2' : '#f0fdf4', color: isCityFavorite ? '#dc2626' : '#16a34a', border: `1px solid ${isCityFavorite ? '#fca5a5' : '#86efac'}`, borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
                            >
                                {isFavoriteLoading ? '...' : isCityFavorite ? '💔 Remove from Favorites' : '❤️ Add to Favorites'}
                            </button>
                        ) : (
                            <div style={{ padding: '10px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>
                                🔒 Log in to save favorites
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* HARTA */}
            <div style={{ marginBottom: '40px' }}>
                <MapView onCitiesUpdate={setVisibleCities} targetLocation={mapTargetLocation} />
            </div>

            {/* PROGNOZA ZILEI — fără filtre */}
            <h2 style={{ color: '#1f2937', marginBottom: '15px' }}>📋 Daily Forecast (Visible Cities on Map)</h2>

            {visibleCities.length > 0 ? (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
                        {visibleCities.slice(0, 12).map(city => (
                            <WeatherCard key={city.id} city={city} />
                        ))}
                    </div>
                    {visibleCities.length > 12 && (
                        <p style={{ textAlign: 'center', color: '#6b7280', marginTop: '20px' }}>
                            Showing first 12 of {visibleCities.length} results. Zoom in more on the map.
                        </p>
                    )}
                </>
            ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280', backgroundColor: 'white', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
                    Zoom in more (level 5+) on the map to see weather data.
                </div>
            )}
        </div>
    );
};

export default Dashboard;