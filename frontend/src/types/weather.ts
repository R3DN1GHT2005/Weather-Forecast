export interface City {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
}

export interface Forecast {
    id: number;
    city_id: number;
    forecast_date: string;
    forecasts_date?: string;
    temp_min: number;
    temp_max: number;
    wind_speed?: number;
    humidity?: number;
    uv_index?: string | null;
}

export interface CityWeatherCardData {
    id: number;
    name: string;
    lat: number | null;
    lng: number | null;
    temp_min: number | null;
    temp_max: number | null;
    wind: number | null;
    humidity: number | null;
    forecast_date: string | null;
    icon_type?: string | null;
    uv_index?: string | null;
}

export interface CommentData {
    id: number;
    city_id?: number;
    user_name: string;
    content: string;
    votes?: number;
    created_at?: string;
    comments_text?: string;
    username?: string;
    like_count?: number;
    dislike_count?: number;
    user_reaction?: string | null;
}