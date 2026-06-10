import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { ArrowLeft, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { type CommentData } from '../types/weather';
import axios from 'axios';

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const GUEST_VOTE_TOKEN_KEY = 'guest_vote_token';

const getGuestVoteToken = () => {
    try {
        const existingToken = localStorage.getItem(GUEST_VOTE_TOKEN_KEY);
        if (existingToken) {
            return existingToken;
        }

        const nextToken = typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        localStorage.setItem(GUEST_VOTE_TOKEN_KEY, nextToken);
        return nextToken;
    } catch {
        return null;
    }
};

const getVoteHeaders = (token: string | null) => {
    if (token) {
        return { Authorization: `Bearer ${token}` };
    }

    const guestToken = getGuestVoteToken();
    return guestToken ? { 'x-guest-token': guestToken } : {};
};

type ChartRange = '5days' | '7days' | '10days' | '1month' | '1year' | 'all';

interface ChartForecast {
    id: number;
    forecast_date: string;
    date: string;
    temp_min: number;
    temp_max: number;
    wind_speed: number;
    humidity: number;
}

interface ForecastHistoryRow {
    id: number;
    date?: string;
    forecast_date?: string;
    forecasts_date?: string;
    temp_min: number;
    temp_max: number;
    wind_speed: number;
    humidity?: number | null;
}

interface PredictionResponse {
    avg_temp_min: number;
    avg_temp_max: number;
    avg_wind_speed: number;
    avg_humidity: number;
    icon_type: string;
    uv_index: string;
}

interface BulkPredictionResponse extends PredictionResponse {
    forecast_date: string;
}

interface OptimisticComment extends CommentData {
    optimistic?: boolean;
}

const HISTORY_WINDOWS: Record<'5days' | '1month' | '1year', number> = {
    '5days': 5,
    '1month': 30,
    '1year': 365,
};

const formatDateLabel = (dateValue: string) =>
    new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(
        new Date(`${dateValue}T00:00:00`)
    );

const CityDetails = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth();
    
    const [cityName, setCityName] = useState<string>(`Loading...`); 
    const [isCityFavorite, setIsCityFavorite] = useState(false);
    const [isCityFavoriteLoading, setIsFavoriteLoading] = useState(false);
    const [comments, setComments] = useState<OptimisticComment[]>([]);
    const [isInitialLoading, setIsInitialLoading] = useState(true);
    const [forecastHistory, setForecastHistory] = useState<ChartForecast[]>([]);
    const [isForecastLoading, setIsForecastLoading] = useState(false);
    const [hasForecastLoaded, setHasForecastLoaded] = useState(false); 
    const [cityError, setCityError] = useState<string | null>(null);
    const [commentInputValue, setCommentInputValue] = useState('');
    const [selectedTimeRange, setSelectedTimeRange] = useState<ChartRange>('5days');
    const [predictionDate, setPredictionDate] = useState(todayIsoDate());
    const [singleDayForecast, setSingleDayForecast] = useState<PredictionResponse | null>(null);
    const [isPredictionLoading, setIsPredictionLoading] = useState(false);

    useEffect(() => {
        const syncFavoriteState = async () => {
            if (!id || !token) {
                setIsCityFavorite(false);
                return;
            }

            try {
                const favoritesResponse = await api.get<Array<{ id: number }>>('/users/me/favorites', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setIsCityFavorite(favoritesResponse.data.some((favorite) => favorite.id === Number(id)));
            } catch (error) {
                console.error('Error syncing favorite state:', error);
            }
        };

        void syncFavoriteState();
    }, [id, token]);

    const buildOptimisticComment = (): OptimisticComment => ({
        id: Date.now(),
        city_id: Number(id ?? 0),
        user_name: 'Tu',
        content: commentInputValue.trim(),
        votes: 0,
        created_at: new Date().toISOString(),
        optimistic: true,
        comments_text: commentInputValue.trim(),
        username: 'Tu',
    });

    function getExpectedDates(range: ChartRange): string[] {
        const today = new Date();
        const dates: string[] = [];
        const days = range === 'all' ? 365 : HISTORY_WINDOWS[range as Exclude<ChartRange, '7days' | '10days' | 'all'>];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().slice(0, 10));
        }
        return dates;
    }

    const loadForecasts = useCallback(async (range: ChartRange = '5days') => {
        if (!id) return;

        try {
            setIsForecastLoading(true);
            setCityError(null);

            const headers = token ? { Authorization: `Bearer ${token}` } : {};

            if (range === '7days' || range === '10days') {
                const days = range === '7days' ? 7 : 10;
                const bulkResponse = await api.get<BulkPredictionResponse[]>(
                    `/forecasts/${id}/prediction/bulk?start_date=${todayIsoDate()}&days=${days}`,
                    { headers }
                );

                const bulkChartData: ChartForecast[] = bulkResponse.data.map((forecastDataPoint) => ({
                    id: 0,
                    forecast_date: forecastDataPoint.forecast_date,
                    date: formatDateLabel(forecastDataPoint.forecast_date),
                    temp_min: forecastDataPoint.avg_temp_min,
                    temp_max: forecastDataPoint.avg_temp_max,
                    wind_speed: forecastDataPoint.avg_wind_speed,
                    humidity: Math.round(forecastDataPoint.avg_humidity),
                }));

                bulkChartData.sort((firstEntry, secondEntry) => firstEntry.forecast_date.localeCompare(secondEntry.forecast_date));
                setForecastHistory(bulkChartData);
                setSelectedTimeRange(range);
                setHasForecastLoaded(true);
                return;
            }

            const endpoint = range === 'all'
                ? `/forecasts/${id}`
                : `/weather/history/${id}?days=${HISTORY_WINDOWS[range]}`;

            const forecastsRes = await api.get<ForecastHistoryRow[]>(endpoint, { headers });

            const formattedChartData: ChartForecast[] = forecastsRes.data.map((forecastDataPoint) => {
                const rowDate = forecastDataPoint.forecast_date ?? forecastDataPoint.forecasts_date ?? forecastDataPoint.date ?? new Date().toISOString().slice(0, 10);

                return {
                    id: forecastDataPoint.id,
                    forecast_date: rowDate,
                    date: formatDateLabel(rowDate),
                    temp_min: forecastDataPoint.temp_min,
                    temp_max: forecastDataPoint.temp_max,
                    wind_speed: forecastDataPoint.wind_speed,
                    humidity: forecastDataPoint.humidity ?? 0,
                };
            });

            const existingForecastDates = new Set(formattedChartData.map((forecast) => forecast.forecast_date));
            const expectedDates = getExpectedDates(range);

            const missingForecastDates = expectedDates.filter((date) => !existingForecastDates.has(date));

            if (missingForecastDates.length > 0) {
                const MAX_PREDICTIONS = range === 'all' ? 30 : missingForecastDates.length;
                const predictionBatch = missingForecastDates.slice(0, MAX_PREDICTIONS);

                const fetchPredictionsInBatches = async (dates: string[], concurrency = 6) => {
                    const results: Array<ChartForecast | null> = [];
                    for (let i = 0; i < dates.length; i += concurrency) {
                        const dateChunk = dates.slice(i, i + concurrency);
                        const chunkForecasts = await Promise.all(dateChunk.map(async (forecastTargetDate) => {
                            try {
                                const predictionResponse = await api.get<PredictionResponse>(
                                    `/forecasts/${id}/prediction?target_date=${forecastTargetDate}`,
                                    { headers }
                                );
                                return {
                                    id: 0,
                                    forecast_date: forecastTargetDate,
                                    date: formatDateLabel(forecastTargetDate),
                                    temp_min: predictionResponse.data.avg_temp_min,
                                    temp_max: predictionResponse.data.avg_temp_max,
                                    wind_speed: predictionResponse.data.avg_wind_speed,
                                    humidity: Math.round(predictionResponse.data.avg_humidity),
                                } as ChartForecast;
                            } catch {
                                return null;
                            }
                        }));
                        results.push(...chunkForecasts);
                    }
                    return results;
                };

                const predictionResults = await fetchPredictionsInBatches(predictionBatch, 6);
                for (const forecastPrediction of predictionResults) {
                    if (forecastPrediction) formattedChartData.push(forecastPrediction);
                }
            }

            formattedChartData.sort((firstEntry, secondEntry) => firstEntry.forecast_date.localeCompare(secondEntry.forecast_date));

            setForecastHistory(formattedChartData);
            setSelectedTimeRange(range);
            setHasForecastLoaded(true);
        } catch (error: unknown) {
            console.error("Error fetching predictions:", error);

            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    setCityError("You must be logged in to view predictions.");
                } else {
                    setCityError("Could not load weather predictions.");
                }
            } else {
                setCityError("An unexpected error occurred while loading country statistics.");
            }
        } finally {
            setIsForecastLoading(false);
        }
    }, [id, token]);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                setIsInitialLoading(true);
                const [cityResponse, commentsResponse] = await Promise.all([
                    api.get(`/cities/${id}`),
                    api.get<CommentData[]>(`/cities/${id}/comments`, { headers: getVoteHeaders(token) })
                ]);
                
                setCityName(cityResponse.data.name);
                setComments(commentsResponse.data);
                setCityError(null);
                await loadForecasts('5days');

                // Auto-load today's prediction
                try {
                    const predictionResponse = await api.get<PredictionResponse>(`/forecasts/${id}/prediction?target_date=${todayIsoDate()}`);
                    setSingleDayForecast(predictionResponse.data);
                } catch {
                    // prediction not available, leave as null (user can click generate)
                }
            } catch (error) {
                console.error("Error fetching initial data:", error);
                setCityError("Could not load city data.");
            } finally {
                setIsInitialLoading(false);
            }
        };

        if (id) fetchInitialData();
    }, [id, token, loadForecasts]);

    const handleRemoveFavorite = async () => {
        if (!token || !id) return;

        await api.delete(`/cities/${id}/save`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        setIsCityFavorite(false);
    };

    const handleToggleFavorite = async () => {
        if (!token || !id) return;

        setIsFavoriteLoading(true);
        try {
            if (isCityFavorite) {
                await handleRemoveFavorite();
            } else {
                await api.post(`/cities/${id}/save`, {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setIsCityFavorite(true);
            }
        } catch (error) {
            console.error('Error toggling favorite:', error);
        } finally {
            setIsFavoriteLoading(false);
        }
    };

    const handleAddComment = async () => {
        if (commentInputValue.trim() === '') return;
        
        if (!token) {
            alert("You must be logged in to leave a comment!");
            return;
        }

        const pendingOptimisticComment = buildOptimisticComment();
        setComments((currentCommentList) => [pendingOptimisticComment, ...currentCommentList]);
        const originalCommentContent = commentInputValue.trim();
        setCommentInputValue('');

        try {
            const commentResponse = await api.post(`/cities/${id}/comments`, {
                content: originalCommentContent
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setComments((currentCommentList) =>
                currentCommentList.map((comment) =>
                    comment.id === pendingOptimisticComment.id
                        ? {
                            ...comment,
                            id: commentResponse.data.id,
                            optimistic: false,
                            username: commentResponse.data.username ?? comment.username,
                            comments_text: commentResponse.data.comments_text ?? comment.comments_text,
                            content: commentResponse.data.comments_text ?? comment.content,
                            user_name: commentResponse.data.username ?? comment.user_name,
                        }
                        : comment
                )
            );
        } catch (error) {
            setComments((currentCommentList) => currentCommentList.filter((comment) => comment.id !== pendingOptimisticComment.id));
            setCommentInputValue(originalCommentContent);
            console.error("Error adding comment:", error);
            alert("An error occurred.");
            return;
        }
    };

    const handleReact = async (commentId: number, reactionType: 'like' | 'dislike') => {
        try {
            const authHeaders = getVoteHeaders(token);
            const targetComment = comments.find((comment) => comment.id === commentId);
            const userPreviousReaction = targetComment?.user_reaction;

            if (userPreviousReaction) {
                return;
            }

            setComments((currentCommentList) =>
                currentCommentList.map((comment) =>
                    comment.id === commentId
                        ? {
                            ...comment,
                            user_reaction: reactionType,
                            like_count: reactionType === 'like' ? (comment.like_count ?? 0) + 1 : comment.like_count ?? 0,
                            dislike_count: reactionType === 'dislike' ? (comment.dislike_count ?? 0) + 1 : comment.dislike_count ?? 0,
                        }
                        : comment
                )
            );

            await api.post(`/comments/${commentId}/react`, { reaction_type: reactionType }, {
                headers: authHeaders
            });
        } catch (error: unknown) {
            const preEditComment = comments.find((comment) => comment.id === commentId);
            setComments((currentCommentList) =>
                currentCommentList.map((currentComment) =>
                    currentComment.id === commentId && preEditComment
                        ? { ...currentComment, user_reaction: preEditComment.user_reaction, like_count: preEditComment.like_count, dislike_count: preEditComment.dislike_count }
                        : currentComment
                )
            );
            if (axios.isAxiosError(error) && error.response?.status === 429) {
                alert("You must wait 3 seconds between reactions.");
            } else if (axios.isAxiosError(error) && error.response?.status === 409) {
                alert("Already voted on this comment.");
            }
        }
    };

    const handleGenerateSinglePrediction = async () => {
        if (!id || !predictionDate) return;

        setIsPredictionLoading(true);
        try {
            const predictionResponse = await api.get<PredictionResponse>(`/forecasts/${id}/prediction?target_date=${predictionDate}`);
            setSingleDayForecast(predictionResponse.data);
        } catch (error) {
            console.error('Error generating single prediction:', error);
            alert('Could not generate the selected prediction.');
        } finally {
            setIsPredictionLoading(false);
        }
    };

    const getButtonStyle = (range: string): CSSProperties => ({
        padding: '6px 12px',
        borderRadius: '20px',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '13px',
        backgroundColor: selectedTimeRange === range ? '#2563eb' : '#e5e7eb',
        color: selectedTimeRange === range ? 'white' : '#4b5563',
        transition: 'all 0.2s'
    });

    if (isInitialLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh', color: '#3b82f6' }}>
                <Loader2 size={40} className="animate-spin" /> 
                <span style={{ marginLeft: '10px', fontSize: '18px' }}>Loading city details...</span>
            </div>
        );
    }

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <button 
                    onClick={() => navigate('/')}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '16px', padding: 0 }}
                >
                    <ArrowLeft size={20} /> Back to Dashboard
                </button>
                {token && (
                    <button
                        onClick={handleToggleFavorite}
                        disabled={isCityFavoriteLoading}
                        style={{
                            padding: '8px 14px',
                            backgroundColor: isCityFavorite ? '#fee2e2' : '#f0fdf4',
                            color: isCityFavorite ? '#dc2626' : '#16a34a',
                            border: `1px solid ${isCityFavorite ? '#fca5a5' : '#86efac'}`,
                            borderRadius: '8px',
                            cursor: isCityFavoriteLoading ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold',
                            fontSize: '14px'
                        }}
                    >
                        {isCityFavoriteLoading ? '...' : isCityFavorite ? '💔 Remove from Favorites' : '❤️ Add to Favorites'}
                    </button>
                )}
            </div>
            
            <h1 style={{ color: '#1f2937', marginBottom: '30px' }}>City Details: {cityName}</h1>

            {cityError && (
                <div style={{ padding: '15px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '8px', marginBottom: '20px' }}>
                    ⚠️ {cityError}
                </div>
            )}

            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                    <h2 style={{ color: '#374151', margin: 0, fontSize: '18px' }}>📈 Temperature Evolution</h2>
                    
                    {hasForecastLoaded && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button style={getButtonStyle('5days')} onClick={() => void loadForecasts('5days')}>5 Days</button>
                            <button style={getButtonStyle('7days')} onClick={() => void loadForecasts('7days')}>7 Days</button>
                            <button style={getButtonStyle('10days')} onClick={() => void loadForecasts('10days')}>10 Days</button>
                            <button style={getButtonStyle('1month')} onClick={() => void loadForecasts('1month')}>1 Month</button>
                            <button style={getButtonStyle('1year')} onClick={() => void loadForecasts('1year')}>1 Year</button>
                        </div>
                    )}
                </div>

                {!hasForecastLoaded ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <button 
                            onClick={() => void loadForecasts('5days')}
                            disabled={isForecastLoading}
                            style={{ padding: '12px 24px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '10px' }}
                        >
                            {isForecastLoading ? <Loader2 className="animate-spin" size={20} /> : '📊'}
                            {isForecastLoading ? 'Processing...' : 'Generate Weather Prediction'}
                        </button>
                        <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '15px' }}>
                            *Detailed predictions load on request only.
                        </p>
                    </div>
                ) : (
                    <div style={{ width: '100%', height: 350, minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={forecastHistory}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                <XAxis dataKey="date" stroke="#6b7280" />
                                <YAxis stroke="#6b7280" />
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                                <Legend />
                                <Line type="monotone" dataKey="temp_max" name="Temp Max (°C)" stroke="#dc2626" strokeWidth={2} />
                                <Line type="monotone" dataKey="temp_min" name="Temp Min (°C)" stroke="#2563eb" strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '40px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <h2 style={{ color: '#374151', margin: 0, fontSize: '18px' }}>🗓️ Single-Day Prediction</h2>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                            type="date"
                            value={predictionDate}
                            onChange={(event) => setPredictionDate(event.target.value)}
                            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                        />
                        <button
                            onClick={() => void handleGenerateSinglePrediction()}
                            disabled={isPredictionLoading}
                            style={{ padding: '10px 16px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: isPredictionLoading ? 'wait' : 'pointer', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                        >
                            {isPredictionLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                            Generate Forecast
                        </button>
                    </div>
                </div>

                {singleDayForecast ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                        <div style={{ padding: '14px', backgroundColor: '#eff6ff', borderRadius: '10px' }}>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>Temp Min</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#2563eb' }}>{singleDayForecast.avg_temp_min.toFixed(1)}°C</div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#fef2f2', borderRadius: '10px' }}>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>Temp Max</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#dc2626' }}>{singleDayForecast.avg_temp_max.toFixed(1)}°C</div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#f0fdf4', borderRadius: '10px' }}>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>Wind</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#16a34a' }}>{singleDayForecast.avg_wind_speed.toFixed(1)} km/h</div>
                        </div>
                        <div style={{ padding: '14px', backgroundColor: '#fefce8', borderRadius: '10px' }}>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>Humidity</div>
                            <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#ca8a04' }}>{Math.round(singleDayForecast.avg_humidity)}%</div>
                        </div>
                        <div style={{ gridColumn: '1 / -1', padding: '14px', backgroundColor: '#f3e8ff', borderRadius: '10px', textAlign: 'center', color: '#7c3aed', fontWeight: 'bold' }}>
                            {singleDayForecast.icon_type}
                        </div>
                        <div style={{ gridColumn: '1 / -1', padding: '14px', backgroundColor: '#fef3c7', borderRadius: '10px', textAlign: 'center', color: '#92400e', fontWeight: 'bold' }}>
                            UV Index: {singleDayForecast.uv_index}
                        </div>
                    </div>
                ) : (
                    <div style={{ color: '#6b7280', fontStyle: 'italic' }}>Choose a date and generate a forecast for that day.</div>
                )}
            </div>

            <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                <h2 style={{ color: '#374151', margin: '0 0 20px 0', fontSize: '18px' }}>💬 Community Feedback</h2>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
                    <input 
                        type="text" 
                        placeholder="How was the weather? Help the community..." 
                        value={commentInputValue}
                        onChange={(event) => setCommentInputValue(event.target.value)}
                        style={{ flex: 1, minWidth: '200px', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db', outline: 'none' }}
                    />
                    <button onClick={handleAddComment} style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                        Send
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                    {comments.length === 0 ? (
                        <p style={{ color: '#6b7280', fontStyle: 'italic' }}>Be the first to leave a comment!</p>
                    ) : (
                        comments.map((comment) => (
                            <div key={comment.id} style={{ padding: '15px', backgroundColor: comment.optimistic ? '#eff6ff' : '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', opacity: comment.optimistic ? 0.8 : 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <div style={{ fontWeight: 'bold', color: '#4b5563' }}>{comment.username ?? comment.user_name}</div>
                                        {!comment.optimistic && (
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <button
                                                onClick={() => void handleReact(comment.id, 'like')}
                                                    disabled={Boolean(comment.user_reaction)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                    border: 'none', background: 'none',
                                                    padding: '4px 8px', borderRadius: '6px', fontSize: '13px',
                                                    backgroundColor: comment.user_reaction === 'like' ? '#dbeafe' : '#f3f4f6',
                                                    color: comment.user_reaction === 'like' ? '#2563eb' : '#6b7280',
                                                    fontWeight: comment.user_reaction === 'like' ? 'bold' : 'normal',
                                                    opacity: comment.user_reaction && comment.user_reaction !== 'like' ? 0.55 : 1,
                                                    cursor: comment.user_reaction ? 'not-allowed' : 'pointer',
                                                }}
                                            >
                                                <ThumbsUp size={14} /> {comment.like_count ?? 0}
                                            </button>
                                            <button
                                                onClick={() => void handleReact(comment.id, 'dislike')}
                                                    disabled={Boolean(comment.user_reaction)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                    border: 'none', background: 'none',
                                                    padding: '4px 8px', borderRadius: '6px', fontSize: '13px',
                                                    backgroundColor: comment.user_reaction === 'dislike' ? '#fee2e2' : '#f3f4f6',
                                                    color: comment.user_reaction === 'dislike' ? '#dc2626' : '#6b7280',
                                                    fontWeight: comment.user_reaction === 'dislike' ? 'bold' : 'normal',
                                                    opacity: comment.user_reaction && comment.user_reaction !== 'dislike' ? 0.55 : 1,
                                                    cursor: comment.user_reaction ? 'not-allowed' : 'pointer',
                                                }}
                                            >
                                                <ThumbsDown size={14} /> {comment.dislike_count ?? 0}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <p style={{ margin: '0', color: '#1f2937', lineHeight: '1.5' }}>{comment.comments_text ?? comment.content}</p>
                                {comment.optimistic && (
                                    <div style={{ marginTop: '8px', fontSize: '12px', color: '#2563eb' }}>Sending...</div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default CityDetails;