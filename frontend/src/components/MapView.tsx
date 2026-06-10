import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { LatLngBounds } from 'leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { useState, useEffect } from 'react';
import type { CityWeatherCardData } from '../types/weather';
import api from '../services/api';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const customMarkerIcon = new L.Icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

function MapEvents({ onBoundsChange, onZoomChange }: {
    onBoundsChange: (bounds: LatLngBounds) => void;
    onZoomChange: (zoom: number) => void;
}) {
    const map = useMapEvents({
        moveend: () => onBoundsChange(map.getBounds()),
        zoomend: () => onZoomChange(map.getZoom())
    });

    useEffect(() => {
        onBoundsChange(map.getBounds());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}

function MapFlyTo({ target }: { target?: { lat: number; lng: number; zoom: number } | null }) {
    const map = useMapEvents({});
    useEffect(() => {
        if (target) {
            map.setView([target.lat, target.lng], target.zoom, { animate: false });
        }
    }, [target, map]);
    return null;
}

export type RawMapCity = CityWeatherCardData;

export interface ValidMapCity extends Omit<CityWeatherCardData, 'lat' | 'lng'> {
    lat: number;
    lng: number;
}

interface MapViewProps {
    onCitiesUpdate?: (cities: RawMapCity[]) => void;
    targetLocation?: { lat: number; lng: number; zoom: number } | null;
}

// State per popup — tracking loading și favorite per oraș
interface CityFavState {
    isFavorite: boolean;
    isLoading: boolean;
    showTooltip: boolean;
}

const MapView = ({ onCitiesUpdate, targetLocation }: MapViewProps) => {
    const [apiCities, setApiCities] = useState<RawMapCity[]>([]);
    const [currentZoom, setCurrentZoom] = useState(6);
    const [favStates, setFavStates] = useState<Record<number, CityFavState>>({});
    const ZOOM_THRESHOLD = 6;

    const token = localStorage.getItem('access_token');

    useEffect(() => {
        const syncFavorites = async () => {
            if (!token || apiCities.length === 0) return;

            try {
                const favoritesResponse = await api.get<Array<{ id: number }>>('/users/me/favorites', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const favoriteIds = new Set(favoritesResponse.data.map((favorite) => favorite.id));

                setFavStates(previousState => {
                    const next = { ...previousState };
                    for (const city of apiCities) {
                        next[city.id] = {
                            isFavorite: favoriteIds.has(city.id),
                            isLoading: previousState[city.id]?.isLoading ?? false,
                            showTooltip: false,
                        };
                    }
                    return next;
                });
            } catch (error) {
                console.error('Error syncing favorites on map:', error);
            }
        };

        void syncFavorites();
    }, [apiCities, token]);

    const handleBoundsChange = async (bounds: LatLngBounds) => {
        if (currentZoom < ZOOM_THRESHOLD) {
            setApiCities([]);
            if (onCitiesUpdate) onCitiesUpdate([]);
            return;
        }

        const min_lat = bounds.getSouth();
        const max_lat = bounds.getNorth();
        const min_lng = bounds.getWest();
        const max_lng = bounds.getEast();

        try {
            const citiesResponse = await api.get<RawMapCity[]>(
                `/cities/bounds?min_lat=${min_lat}&max_lat=${max_lat}&min_lng=${min_lng}&max_lng=${max_lng}`
            );
            setApiCities(citiesResponse.data);
            if (onCitiesUpdate) onCitiesUpdate(citiesResponse.data);
        } catch (error) {
            console.error("Error fetching cities on map:", error);
        }
    };

    const handleToggleFavorite = async (cityId: number) => {
        if (!token) {
            // Arată tooltip "Trebuie să fii logat"
            setFavStates(previousState => ({
                ...previousState,
                [cityId]: { ...previousState[cityId], showTooltip: true, isFavorite: false, isLoading: false }
            }));
            setTimeout(() => {
                setFavStates(previousState => ({
                    ...previousState,
                    [cityId]: { ...previousState[cityId], showTooltip: false }
                }));
            }, 2500);
            return;
        }

        const current = favStates[cityId];
        const isFav = current?.isFavorite ?? false;

        setFavStates(previousState => ({
            ...previousState,
            [cityId]: { ...previousState[cityId], isLoading: true, showTooltip: false, isFavorite: isFav }
        }));

        try {
            if (isFav) {
                await api.delete(`/cities/${cityId}/save`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                await api.post(`/cities/${cityId}/save`, {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            setFavStates(previousState => ({
                ...previousState,
                [cityId]: { isFavorite: !isFav, isLoading: false, showTooltip: false }
            }));
        } catch {
            setFavStates(previousState => ({
                ...previousState,
                [cityId]: { ...previousState[cityId], isLoading: false }
            }));
        }
    };

    const maxBounds: LatLngBoundsExpression = [[-90, -180], [90, 180]];

    const displayCities = apiCities.filter(
        (city): city is ValidMapCity =>
            typeof city.lat === 'number' && typeof city.lng === 'number'
    );

    return (
        <div style={{ height: '60vh', minHeight: '400px', width: '100%', borderRadius: '15px', overflow: 'hidden', border: '1px solid #ddd', position: 'relative', zIndex: 1 }}>
            <MapContainer
                center={[45.94, 24.96]}
                zoom={6}
                style={{ height: '100%', width: '100%' }}
                worldCopyJump={true}
                minZoom={3}
                maxBounds={maxBounds}
                maxBoundsViscosity={1.0}
            >
                <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    noWrap={false}
                />

                <MapEvents
                    onBoundsChange={handleBoundsChange}
                    onZoomChange={setCurrentZoom}
                />

                <MapFlyTo target={targetLocation} />

                {displayCities.map(city => {
                    const favState = favStates[city.id];
                    const isFav = favState?.isFavorite ?? false;
                    const isLoading = favState?.isLoading ?? false;
                    const showTooltip = favState?.showTooltip ?? false;

                    return (
                        <Marker
                            key={city.id}
                            position={[city.lat, city.lng]}
                            icon={customMarkerIcon}
                        >
                            <Popup>
                                <div style={{ padding: '5px', minWidth: '140px' }}>
                                    <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {city.name}
                                        {isFav && (
                                            <span style={{ fontSize: '12px', color: '#dc2626', backgroundColor: '#fee2e2', padding: '1px 6px', borderRadius: '10px' }}>
                                                ❤️Favorited
                                            </span>
                                        )}
                                    </h3>
                                    <div style={{ color: '#2563eb', fontWeight: 'bold' }}>
                                        Min: {city.temp_min ?? '--'}°C
                                    </div>
                                    <div style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                        Max: {city.temp_max ?? '--'}°C
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '5px' }}>
                                        Wind: {city.wind ?? '--'} km/h
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#0ea5e9', marginTop: '2px', fontWeight: 'bold' }}>
                                        Humidity: {city.humidity ?? '--'}%
                                    </div>

                                    {/* Buton Add / Remove Favorite */}
                                    <div style={{ marginTop: '10px', position: 'relative' }}>
                                        <button
                                            onClick={() => handleToggleFavorite(city.id)}
                                            disabled={isLoading}
                                            style={{
                                                width: '100%',
                                                padding: '6px 10px',
                                                backgroundColor: isFav ? '#fee2e2' : '#f0fdf4',
                                                color: isFav ? '#dc2626' : '#16a34a',
                                                border: `1px solid ${isFav ? '#fca5a5' : '#86efac'}`,
                                                borderRadius: '6px',
                                                cursor: isLoading ? 'wait' : 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '12px',
                                            }}
                                        >
                                            {isLoading ? '...' : isFav ? '💔 Remove Favorite' : '❤️ Add to Favorites'}
                                        </button>

                                        {/* Tooltip "Trebuie să fii logat" */}
                                        {showTooltip && (
                                            <div style={{
                                                position: 'absolute',
                                                bottom: '110%',
                                                left: '50%',
                                                transform: 'translateX(-50%)',
                                                backgroundColor: '#1f2937',
                                                color: 'white',
                                                padding: '6px 10px',
                                                borderRadius: '6px',
                                                fontSize: '12px',
                                                whiteSpace: 'nowrap',
                                                zIndex: 1000,
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                            }}>
                                                🔐 You must be logged in
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '100%',
                                                    left: '50%',
                                                    transform: 'translateX(-50%)',
                                                    width: 0,
                                                    height: 0,
                                                    borderLeft: '5px solid transparent',
                                                    borderRight: '5px solid transparent',
                                                    borderTop: '5px solid #1f2937',
                                                }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </div>
    );
};

export default MapView;