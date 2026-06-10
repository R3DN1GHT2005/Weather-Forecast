import { Thermometer, Wind, Droplets, MapPin, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import type { CityWeatherCardData } from '../types/weather';
import api from '../services/api';

interface PredictionData {
    avg_temp_min: number;
    avg_temp_max: number;
    avg_wind_speed: number;
    avg_humidity: number;
    icon_type?: string | null;
    uv_index?: string | null;
}

interface WeatherCardProps {
    city: CityWeatherCardData;
}

const WeatherCard = ({ city }: WeatherCardProps) => {
    const navigate = useNavigate();
    const [predictionData, setPredictionData] = useState<PredictionData | null>(null);
    const hasFetchedPrediction = useRef(false);

    useEffect(() => {
        if (city.temp_min == null && !hasFetchedPrediction.current) {
            hasFetchedPrediction.current = true;
            api.get<PredictionData>(`/forecasts/${city.id}/prediction?target_date=${new Date().toISOString().slice(0, 10)}`)
                .then((response) => setPredictionData(response.data))
                .catch(() => {});
        }
    }, [city.id, city.temp_min]);

    const tempMin = city.temp_min ?? predictionData?.avg_temp_min ?? null;
    const tempMax = city.temp_max ?? predictionData?.avg_temp_max ?? null;
    const windSpeed = city.wind ?? predictionData?.avg_wind_speed ?? null;
    const humidity = city.humidity ?? (predictionData ? Math.round(predictionData.avg_humidity) : null);
    const iconType = city.icon_type ?? predictionData?.icon_type ?? null;
    const uvIndex = city.uv_index ?? predictionData?.uv_index ?? null;

    return (
        <div 
            onClick={() => navigate(`/city/${city.id}`)}
            style={{
                backgroundColor: 'white', padding: '20px', borderRadius: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb',
                transition: 'transform 0.2s', cursor: 'pointer'
            }}
            onMouseOver={(event) => event.currentTarget.style.transform = 'translateY(-5px)'}
            onMouseOut={(event) => event.currentTarget.style.transform = 'translateY(0)'}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #f3f4f6', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={20} color="#3b82f6" />
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#1f2937' }}>{city.name}</h3>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6b7280', backgroundColor: '#f3f4f6', padding: '4px 8px', borderRadius: '12px' }}>
                    <Calendar size={12} />
                    <span>{city.forecast_date ?? (predictionData ? new Date().toISOString().slice(0, 10) : '—')}</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#2563eb' }}>
                    <Thermometer size={18} />
                    <strong>{tempMin != null ? `Min: ${tempMin}°C` : 'Min: —'}</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#dc2626' }}>
                    <Thermometer size={18} />
                    <strong>{tempMax != null ? `Max: ${tempMax}°C` : 'Max: —'}</strong>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#6b7280' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Wind size={16} /><span>{windSpeed != null ? `${windSpeed} km/h` : '—'}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Droplets size={16} /><span>{humidity != null ? `${humidity}%` : '—'}</span></div>
            </div>

            {iconType && (
                <div style={{ marginTop: '12px', padding: '8px 10px', borderRadius: '10px', backgroundColor: '#f3e8ff', color: '#7c3aed', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>
                    {iconType}
                </div>
            )}

            {uvIndex && (
                <div style={{ marginTop: '12px', padding: '8px 10px', borderRadius: '10px', backgroundColor: '#fef3c7', color: '#92400e', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>
                    UV Index: {uvIndex}
                </div>
            )}
        </div>
    );
};

export default WeatherCard;