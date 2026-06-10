import { useEffect, useState, useRef } from 'react';
import './Statistics.css';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import axios from 'axios';
import type { CSSProperties } from 'react';

type ActiveTab = 'country' | 'city';

interface CountryOption {
  id: number;
  name: string;
}

interface CountryStats {
  p_avg_temp: number | null;
  p_alert_count: number | null;
  p_hotspot_city: string;
}

interface CountrySeriesPoint {
  label: string;
  value: number;
}

interface CountryRangePoint {
  label: string;
  min_temp: number;
  max_temp: number;
}

interface CountryCityRank {
  name: string;
  temp: number;
}

interface CountryClimateAlert {
  alert_type: string;
  severity: string;
  message: string;
}

interface CountryDashboard {
  p_avg_temp: number | null;
  p_avg_humidity: number | null;
  p_avg_wind: number | null;
  p_avg_uv_index: string | null;
  p_alert_count: number | null;
  p_hotspot_city: string;
  latest_date: string | null;
  monthly_avg_temps: CountrySeriesPoint[];
  historic_extremes: CountryRangePoint[];
  yearly_evolution: CountrySeriesPoint[];
  hottest_cities_today: CountryCityRank[];
  coldest_cities_today: CountryCityRank[];
  alerts: CountryClimateAlert[];
  db_alerts: CountryClimateAlert[];
}

interface CityRisk {
  p_risk_level: string;
}

interface CityAnomaly {
  p_is_anomaly: boolean;
  p_deviation: number;
}

interface CityTrust {
  p_trust_score: number | null;
  p_audit_label: string;
}

interface CitySeasonalComparisonRow {
  comparison_label: string;
  current_avg_temp: number | null;
  reference_avg_temp: number | null;
  current_avg_wind: number | null;
  reference_avg_wind: number | null;
  current_avg_humidity: number | null;
  reference_avg_humidity: number | null;
  delta_score: number | null;
}

interface CountrySeasonAverage {
  season: string;
  average_temp: number;
}

interface CountryCityClusterRow {
  city_name: string;
  cluster_label: string;
  avg_temp: number;
  avg_humidity: number;
  avg_wind: number;
  similarity_score: number;
  cluster_size: number;
}

interface CountryCityLeaderboardRow {
  rank_position: number;
  city_name: string;
  forecast_score: number;
  avg_temp: number;
  avg_humidity: number;
  avg_wind: number;
}

interface ForecastScoreboardRow {
  rank_position: number;
  city_name: string;
  forecast_date: string;
  forecast_score: number;
  weighted_accuracy: number | null;
  comment_count: number;
  reputation_score: number;
}

interface CitySearchResult {
  id: number;
  name: string;
}

interface AlertItem {
  id: number;
  forecast_id: number;
  alert_message: string;
  recommendation: string | null;
  created_at: string | null;
}

interface PredictionResponse {
  avg_temp_min: number;
  avg_temp_max: number;
  avg_wind_speed: number;
  avg_humidity: number;
  icon_type: string;
  uv_index: string;
}

type AlertBucket = 'Extreme Heat' | 'Extreme Cold' | 'Strong Wind' | 'High Humidity' | 'Other';

interface AlertTypeData {
  name: AlertBucket;
  count: number;
}

interface CityAlertData {
  name: string;
  count: number;
}

const ALERT_COLORS = ['#dc2626', '#2563eb', '#f59e0b', '#10b981', '#6b7280'];

const classifyAlert = (message: string): AlertBucket => {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('heat')) return 'Extreme Heat';
  if (normalizedMessage.includes('cold')) return 'Extreme Cold';
  if (normalizedMessage.includes('wind')) return 'Strong Wind';
  if (normalizedMessage.includes('humidity')) return 'High Humidity';

  return 'Other';
};

const summaryCardStyle = (backgroundColor: string, accentColor: string): CSSProperties => ({
  backgroundColor: 'white',
  borderRadius: '14px',
  padding: '18px',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
  borderLeft: `5px solid ${accentColor}`,
  backgroundImage: `linear-gradient(135deg, ${backgroundColor}, white 70%)`,
});

const summaryLabelStyle: CSSProperties = {
  color: '#6b7280',
  fontSize: '13px',
  marginBottom: '8px',
};

const summaryValueStyle: CSSProperties = {
  color: '#111827',
  fontSize: '22px',
  fontWeight: 800,
};

const chartCardStyle: CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '14px',
  padding: '20px',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
  border: '1px solid #e5e7eb',
};

const chartTitleStyle: CSSProperties = {
  margin: '0 0 16px 0',
  color: '#111827',
  fontSize: '18px',
};

const miniStatStyle: CSSProperties = {
  padding: '14px',
  backgroundColor: '#f9fafb',
  borderRadius: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  border: '1px solid #e5e7eb',
};

const iconButtonStyle: CSSProperties = {
  padding: '10px 14px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: '#2563eb',
  color: 'white',
  cursor: 'pointer',
};

const monthToSeason = (label: string) => {
  const normalized = label.toLowerCase();
  if (['dec', 'jan', 'feb'].includes(normalized)) return 'Winter';
  if (['mar', 'apr', 'may'].includes(normalized)) return 'Spring';
  if (['jun', 'jul', 'aug'].includes(normalized)) return 'Summer';
  return 'Autumn';
};

const formatSeasonalComparisonTitle = (label: string) => {
  if (label === 'same_day_previous_years') return 'Same day, previous years';
  if (label === 'seasonal_average') return 'Seasonal baseline';
  return label.replace(/_/g, ' ');
};

const Statistics = () => {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ActiveTab>('country');

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption | null>(null);
  const [countryStats, setCountryStats] = useState<CountryStats | null>(null);
  const [countryDashboard, setCountryDashboard] = useState<CountryDashboard | null>(null);
  const [countryAlertTypes, setCountryAlertTypes] = useState<AlertTypeData[]>([]);
  const [countryCityAlerts, setCountryCityAlerts] = useState<CityAlertData[]>([]);
  const [countryClusters, setCountryClusters] = useState<CountryCityClusterRow[]>([]);
  const [countryLeaderboard, setCountryLeaderboard] = useState<CountryCityLeaderboardRow[]>([]);
  const [countryForecastRanking, setCountryForecastRanking] = useState<ForecastScoreboardRow[]>([]);
  const [countryError, setCountryError] = useState<string | null>(null);
  const [isLoadingCountry, setIsLoadingCountry] = useState(false);

  const [cityInput, setCityInput] = useState('');
  const [citySearchResults, setCitySearchResults] = useState<CitySearchResult[]>([]);
  const [citySearchSuggestions, setCitySearchSuggestions] = useState<CitySearchResult[]>([]);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [selectedCity, setSelectedCity] = useState<CitySearchResult | null>(null);
  const [cityRisk, setCityRisk] = useState<CityRisk | null>(null);
  const [cityAnomaly, setCityAnomaly] = useState<CityAnomaly | null>(null);
  const [cityTrust, setCityTrust] = useState<CityTrust | null>(null);
  const [cityAlerts, setCityAlerts] = useState<AlertItem[]>([]);
  const [citySeasonalComparison, setCitySeasonalComparison] = useState<CitySeasonalComparisonRow[]>([]);
  const [cityPredictionDate, setCityPredictionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cityPrediction, setCityPrediction] = useState<PredictionResponse | null>(null);
  const [isLoadingCityPrediction, setIsLoadingCityPrediction] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);
  const [isLoadingCity, setIsLoadingCity] = useState(false);
  const [showAllDbAlerts, setShowAllDbAlerts] = useState(false);
  const activeControllers = useRef<AbortController[]>([] as AbortController[]);

  useEffect(() => {
    return () => {
      activeControllers.current.forEach((controller) => controller.abort());
      activeControllers.current = [];
    };
  }, []);

  const tabStyle = (tab: ActiveTab): CSSProperties => ({
    padding: '10px 24px',
    border: 'none',
    borderBottom: activeTab === tab ? '3px solid #2563eb' : '3px solid transparent',
    background: 'transparent',
    color: activeTab === tab ? '#2563eb' : '#6b7280',
    fontWeight: activeTab === tab ? 'bold' : 'normal',
    cursor: 'pointer',
  });

  const loadCountryAnalytics = async (country: CountryOption) => {
    const controller = new AbortController();
    activeControllers.current.push(controller);
    const signal = controller.signal;
    setSelectedCountry(country);
    setIsLoadingCountry(true);
    setCountryError(null);
    setCountryStats(null);
    setCountryDashboard(null);
    setCountryAlertTypes([]);
    setCountryCityAlerts([]);
    setCountryClusters([]);
    setCountryLeaderboard([]);
    setCountryForecastRanking([]);
    setShowAllDbAlerts(false);

    try {
      const [dashboardResponse, citiesResponse] = await Promise.all([
        api.get<CountryDashboard>(`/stats/country/${encodeURIComponent(country.name)}/dashboard`, { signal }),
        api.get<CitySearchResult[]>(`/countries/${country.id}/cities`, { signal }),
      ]);

      setCountryDashboard(dashboardResponse.data);
      setCountryStats({
        p_avg_temp: dashboardResponse.data.p_avg_temp,
        p_alert_count: dashboardResponse.data.p_alert_count,
        p_hotspot_city: dashboardResponse.data.p_hotspot_city,
      });

      const analysisDate = dashboardResponse.data.latest_date ?? new Date().toISOString().slice(0, 10);
      const [clustersResponse, leaderboardResponse, forecastRankingResponse] = await Promise.all([
        api.get<CountryCityClusterRow[]>(`/stats/country/${encodeURIComponent(country.name)}/clusters?target_date=${analysisDate}`, { signal }),
        api.get<CountryCityLeaderboardRow[]>(`/stats/country/${encodeURIComponent(country.name)}/leaderboard?target_date=${analysisDate}&limit=10`, { signal }),
        api.get<ForecastScoreboardRow[]>(`/stats/country/${encodeURIComponent(country.name)}/forecast-ranking?limit=10`, { signal }),
      ]);

      setCountryClusters(clustersResponse.data);
      setCountryLeaderboard(leaderboardResponse.data);
      setCountryForecastRanking(forecastRankingResponse.data);

      const cityAlertResults = await Promise.all(
        citiesResponse.data.map(async (city) => {
          try {
            const response = await api.get<AlertItem[]>(`/cities/${city.id}/alerts`, { signal });
            return { city, alerts: response.data };
          } catch (error) {
            if (axios.isAxiosError(error) && axios.isCancel(error)) return { city, alerts: [] };
            return { city, alerts: [] };
          }
        })
      );

      const alertBucketCounts: Record<AlertBucket, number> = {
        'Extreme Heat': 0,
        'Extreme Cold': 0,
        'Strong Wind': 0,
        'High Humidity': 0,
        'Other': 0,
      };

      const cityCounts: CityAlertData[] = [];

      cityAlertResults.forEach(({ city, alerts }) => {
        if (alerts.length > 0) {
          cityCounts.push({ name: city.name, count: alerts.length });
        }

        alerts.forEach((alert) => {
          const bucket = classifyAlert(alert.alert_message);
          alertBucketCounts[bucket] += 1;
        });
      });

      setCountryAlertTypes(
        (Object.entries(alertBucketCounts) as Array<[AlertBucket, number]>)
          .map(([name, count]) => ({ name, count }))
          .filter((alertType) => alertType.count > 0)
      );
      setCountryCityAlerts(cityCounts.sort((left, right) => right.count - left.count).slice(0, 8));
    } catch (error: unknown) {
      console.error('Error loading country statistics:', error);
      // Ignore cancellations caused by component unmount
      if (axios.isAxiosError(error) && axios.isCancel(error)) return;
      if (axios.isAxiosError(error)) {
        setCountryError(error.response?.data?.message ?? 'Error processing country statistics.');
      } else {
        setCountryError('An unknown error occurred.');
      }
    } finally {
      setIsLoadingCountry(false);
      // remove controller
      activeControllers.current = activeControllers.current.filter((activeController) => activeController !== controller);
    }
  };

  useEffect(() => {
    const loadCountries = async () => {
      try {
        const response = await api.get<CountryOption[]>('/countries');
        setCountries(response.data);

        const defaultCountry =
          response.data.find((country) => country.name.toLowerCase() === 'romania') ??
          response.data[0];

        if (defaultCountry) {
          void loadCountryAnalytics(defaultCountry);
        }
      } catch (error) {
        console.error('Error loading countries:', error);
        setCountryError('Could not load country list.');
      }
    };

    void loadCountries();
  }, []);

  const handleCitySearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cityInput.trim()) return;

    setCitySearchResults([]);
    setSelectedCity(null);
    setCityRisk(null);
    setCityAnomaly(null);
    setCityTrust(null);
    setCityError(null);

    try {
      const response = await api.get<CitySearchResult[]>(`/cities/search?q=${cityInput}`);
      if (response.data.length > 0) {
        setCitySearchResults(response.data.slice(0, 5));
      } else {
        setCityError('No city found.');
      }
    } catch {
      setCityError('Error searching for city.');
    }
  };

  const handleCityInputChange = async (value: string) => {
    setCityInput(value);
    if (value.length < 2) {
      setCitySearchSuggestions([]);
      setShowCitySuggestions(false);
      return;
    }

    try {
      const response = await api.get<CitySearchResult[]>(`/cities/search?q=${value}`);
      setCitySearchSuggestions(response.data || []);
      setShowCitySuggestions(true);
    } catch {
      setCitySearchSuggestions([]);
    }
  };

  const handleSelectCity = async (city: CitySearchResult) => {
    setCityInput(city.name);
    setCitySearchSuggestions([]);
    setShowCitySuggestions(false);
    setCitySearchResults([]);
    await fetchCityStats(city);
  };

  const fetchCityStats = async (city: CitySearchResult) => {
    const controller = new AbortController();
    activeControllers.current.push(controller);
    const signal = controller.signal;
    setSelectedCity(city);
    setCitySearchResults([]);
    setIsLoadingCity(true);
    setCityError(null);
    setCityRisk(null);
    setCityAnomaly(null);
    setCityTrust(null);
    setCityAlerts([]);
    setCitySeasonalComparison([]);
    setCityPrediction(null);
    setCityPredictionDate(new Date().toISOString().slice(0, 10));

    try {
      const [riskRes, anomalyRes, trustRes, alertsRes] = await Promise.all([
        api.get<CityRisk>(`/stats/city/${city.id}/risk`, { signal }),
        api.get<CityAnomaly>(`/stats/city/${city.id}/anomaly`, { signal }),
        api.get<CityTrust>(`/stats/city/${city.id}/trust`, { signal }),
        api.get<AlertItem[]>(`/cities/${city.id}/alerts`, { signal }),
      ]);

      setCityRisk(riskRes.data);
      setCityAnomaly(anomalyRes.data);
      setCityTrust(trustRes.data);
      setCityAlerts(alertsRes.data);

      try {
        const seasonalResponse = await api.get<CitySeasonalComparisonRow[]>(
          `/stats/city/${city.id}/seasonal?target_date=${new Date().toISOString().slice(0, 10)}`,
          { signal }
        );
        setCitySeasonalComparison(seasonalResponse.data);
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && axios.isCancel(error)) return;
        setCitySeasonalComparison([]);
      }
    } catch (error: unknown) {
      console.error('Error processing city statistics:', error);
      if (axios.isAxiosError(error) && axios.isCancel(error)) return;
      if (axios.isAxiosError(error)) {
        setCityError(error.response?.data?.message ?? 'Error processing city statistics.');
      } else {
        setCityError('An unknown error occurred.');
      }
    } finally {
      setIsLoadingCity(false);
      activeControllers.current = activeControllers.current.filter((activeController) => activeController.signal !== signal);
    }
  };

  const handleGenerateCityPrediction = async () => {
    if (!selectedCity || !cityPredictionDate) return;

    setIsLoadingCityPrediction(true);
    setCityError(null);

    try {
      const predictionResponse = await api.get<PredictionResponse>(`/forecasts/${selectedCity.id}/prediction?target_date=${cityPredictionDate}`);
      setCityPrediction(predictionResponse.data);

      const seasonalResponse = await api.get<CitySeasonalComparisonRow[]>(`/stats/city/${selectedCity.id}/seasonal?target_date=${cityPredictionDate}`);
      setCitySeasonalComparison(seasonalResponse.data);
    } catch (error: unknown) {
      console.error('Error generating city prediction:', error);
      if (axios.isAxiosError(error) && axios.isCancel(error)) return;
      if (axios.isAxiosError(error)) {
        setCityError(error.response?.data?.message ?? 'Error generating city forecast.');
      } else {
        setCityError('An error occurred while generating the city forecast.');
      }
    } finally {
      setIsLoadingCityPrediction(false);
    }
  };

  const totalAlertCount = countryAlertTypes.reduce((sum, item) => sum + item.count, 0);
  const countrySeasonAverages = countryDashboard?.monthly_avg_temps.reduce<Record<string, { total: number; count: number }>>(
    (accumulator, entry) => {
      const bucket = monthToSeason(entry.label);
      if (!accumulator[bucket]) {
        accumulator[bucket] = { total: 0, count: 0 };
      }

      accumulator[bucket].total += entry.value;
      accumulator[bucket].count += 1;
      return accumulator;
    },
    {}
  ) ?? {};

  const countrySeasonalSummary: CountrySeasonAverage[] = Object.entries(countrySeasonAverages).map(([season, stats]) => ({
    season,
    average_temp: stats.count > 0 ? stats.total / stats.count : 0,
  }));

  const clusteredCountryCities = countryClusters.reduce<Record<string, CountryCityClusterRow[]>>((groups, entry) => {
    if (!groups[entry.cluster_label]) {
      groups[entry.cluster_label] = [];
    }

    groups[entry.cluster_label].push(entry);
    return groups;
  }, {});

  return (
    <div className="stats-root">
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
          background: 'none',
          border: 'none',
          color: '#2563eb',
          cursor: 'pointer',
          marginBottom: '20px',
        }}
      >
        <ArrowLeft size={18} />
        Back
      </button>

      <h1>📊 Statistics & Alerts</h1>
      <p style={{ color: '#6b7280' }}>Country summary, plus classification of generated alerts from the database.</p>

      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginTop: '20px', marginBottom: '24px' }}>
        <button style={tabStyle('country')} onClick={() => setActiveTab('country')}>
          🌍 Country
        </button>
        <button style={tabStyle('city')} onClick={() => setActiveTab('city')}>
          📍 City
        </button>
      </div>

      {activeTab === 'country' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              flexWrap: 'wrap',
              backgroundColor: 'white',
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
            }}
          >
            <label style={{ fontWeight: 'bold', color: '#374151' }}>Country</label>
            <select
              value={selectedCountry?.id ?? ''}
              onChange={(event) => {
                const selected = countries.find((country) => country.id === Number(event.target.value));
                if (selected) {
                  void loadCountryAnalytics(selected);
                }
              }}
              style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db', minWidth: '220px' }}
            >
              {countries.map((country) => (
                <option key={country.id} value={country.id}>
                  {country.name}
                </option>
              ))}
            </select>

            {isLoadingCountry && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', color: '#2563eb' }}>
                <Loader2 className="animate-spin" size={18} />
                Loading statistics...
              </div>
            )}
          </div>

          {countryError && <p style={{ color: '#dc2626' }}>{countryError}</p>}

          {countryStats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              <div style={summaryCardStyle('#eff6ff', '#2563eb')}>
                <div style={summaryLabelStyle}>Average Temperature</div>
                <div style={summaryValueStyle}>{countryStats.p_avg_temp?.toFixed(1) ?? 'N/A'} °C</div>
              </div>
              <div style={summaryCardStyle('#f0f9ff', '#0ea5e9')}>
                <div style={summaryLabelStyle}>Average Humidity</div>
                <div style={summaryValueStyle}>{countryDashboard?.p_avg_humidity?.toFixed(1) ?? 'N/A'} %</div>
              </div>
              <div style={summaryCardStyle('#f0fdf4', '#16a34a')}>
                <div style={summaryLabelStyle}>Average Wind</div>
                <div style={summaryValueStyle}>{countryDashboard?.p_avg_wind?.toFixed(1) ?? 'N/A'} km/h</div>
              </div>
              <div style={summaryCardStyle('#fef2f2', '#dc2626')}>
                <div style={summaryLabelStyle}>Total Alerts</div>
                <div style={summaryValueStyle}>{countryStats.p_alert_count ?? 0}</div>
              </div>
              <div style={summaryCardStyle('#f0fdf4', '#16a34a')}>
                <div style={summaryLabelStyle}>Alert Hotspot</div>
                <div style={summaryValueStyle}>{countryStats.p_hotspot_city}</div>
              </div>
              <div style={summaryCardStyle('#fef3c7', '#d97706')}>
                <div style={summaryLabelStyle}>UV Index</div>
                <div style={summaryValueStyle}>{countryDashboard?.p_avg_uv_index ?? 'N/A'}</div>
              </div>
              <div style={summaryCardStyle('#fff7ed', '#ea580c')}>
                <div style={summaryLabelStyle}>Alert Categories</div>
                <div style={summaryValueStyle}>{countryAlertTypes.length || 0}</div>
              </div>
              <div style={summaryCardStyle('#eef2ff', '#4f46e5')}>
                <div style={summaryLabelStyle}>Reference Date</div>
                <div style={summaryValueStyle}>{countryDashboard?.latest_date ?? 'N/A'}</div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
            <div style={chartCardStyle}>
              <h3 style={chartTitleStyle}>Alert Distribution by Type</h3>
              {countryAlertTypes.length > 0 ? (
                <div style={{ minWidth: 0, width: '100%' }}>
                  <div className="resp-wrap chart-card" style={{ minWidth: 0, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={countryAlertTypes} dataKey="count" nameKey="name" outerRadius={110} label>
                          {countryAlertTypes.map((entry, index) => (
                            <Cell key={entry.name} fill={ALERT_COLORS[index % ALERT_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p style={{ color: '#6b7280' }}>No alerts for selected country.</p>
              )}
            </div>

            <div style={chartCardStyle}>
              <h3 style={chartTitleStyle}>Cities with Most Alerts</h3>
              {countryCityAlerts.length > 0 ? (
                <div style={{ minWidth: 0, width: '100%' }}>
                  <div className="resp-wrap chart-card" style={{ minWidth: 0, width: '100%' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={countryCityAlerts}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="name" angle={-20} textAnchor="end" height={80} interval={0} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#2563eb" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p style={{ color: '#6b7280' }}>No cities with alerts in selected country.</p>
              )}
            </div>
          </div>

          {countryDashboard && (
            <div style={{ display: 'grid', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                <div style={chartCardStyle}>
                  <h3 style={chartTitleStyle}>National Average Temperature by Month</h3>
                  {countryDashboard.monthly_avg_temps.length > 0 ? (
                    <div className="resp-wrap chart-card">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={countryDashboard.monthly_avg_temps}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="label" />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280' }}>Not enough data for monthly chart.</p>
                  )}
                </div>

                <div style={chartCardStyle}>
                  <h3 style={chartTitleStyle}>Historic National Temperature Extremes</h3>
                  {countryDashboard.historic_extremes.length > 0 ? (
                    <div className="resp-wrap chart-card">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={countryDashboard.historic_extremes}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="label" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="min_temp" name="Min" fill="#2563eb" radius={[8, 8, 0, 0]} />
                          <Bar dataKey="max_temp" name="Max" fill="#dc2626" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280' }}>Not enough historic data.</p>
                  )}
                </div>
              </div>

              {countrySeasonalSummary.length > 0 && (
                <div style={chartCardStyle}>
                  <h3 style={chartTitleStyle}>Country Seasonal Averages</h3>
                  <p style={{ color: '#6b7280', marginTop: 0 }}>
                    Average temperature grouped by meteorological season for the selected country.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    {countrySeasonalSummary.map((season) => (
                      <div key={season.season} style={miniStatStyle}>
                        <strong>{season.season}</strong>
                        <span>{season.average_temp.toFixed(1)} °C</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                <div style={chartCardStyle}>
                  <h3 style={chartTitleStyle}>Evolution Last Years</h3>
                  {countryDashboard.yearly_evolution.length > 0 ? (
                    <div className="resp-wrap chart-card">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={countryDashboard.yearly_evolution}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                          <XAxis dataKey="label" />
                          <YAxis />
                          <Tooltip />
                          <Line type="monotone" dataKey="value" stroke="#ea580c" strokeWidth={3} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280' }}>No data for yearly evolution.</p>
                  )}
                </div>

                <div style={chartCardStyle}>
                  <h3 style={chartTitleStyle}>Climate Alerts</h3>
                  {countryDashboard.alerts.length > 0 ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {countryDashboard.alerts.map((alert) => (
                        <div
                          key={`${alert.alert_type}-${alert.message}`}
                          style={{
                            padding: '14px',
                            borderRadius: '12px',
                            border: '1px solid #e5e7eb',
                            backgroundColor: alert.severity === 'high' ? '#fef2f2' : '#fff7ed',
                          }}
                        >
                          <div style={{ fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}>{alert.alert_type}</div>
                          <div style={{ fontSize: '13px', color: '#4b5563' }}>{alert.message}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280' }}>No climate alerts generated for selected country.</p>
                  )}
                </div>

                <div style={chartCardStyle}>
                  <h3 style={chartTitleStyle}>Database Alerts</h3>
                  {countryDashboard.db_alerts.length > 0 ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {countryDashboard.db_alerts.slice(0, showAllDbAlerts ? countryDashboard.db_alerts.length : 10).map((alert, index) => (
                        <div
                          key={`db-${index}`}
                          style={{
                            padding: '14px',
                            borderRadius: '12px',
                            border: '1px solid #e5e7eb',
                            backgroundColor: '#fefce8',
                          }}
                        >
                          <div style={{ fontWeight: 'bold', color: '#92400e', marginBottom: '4px' }}>{alert.alert_type}</div>
                          <div style={{ fontSize: '13px', color: '#4b5563' }}>{alert.message}</div>
                        </div>
                      ))}
                      {countryDashboard.db_alerts.length > 10 && (
                        <button
                          onClick={() => setShowAllDbAlerts(!showAllDbAlerts)}
                          style={{
                            padding: '8px 16px',
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            border: '1px solid #d1d5db',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '13px',
                          }}
                        >
                          {showAllDbAlerts ? 'Show Less' : `Show More (${countryDashboard.db_alerts.length})`}
                        </button>
                      )}
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280' }}>No database alerts for selected country.</p>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                <div style={chartCardStyle}>
                  <h3 style={chartTitleStyle}>Hottest Cities Today</h3>
                  {countryDashboard.hottest_cities_today.length > 0 ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {countryDashboard.hottest_cities_today.map((city, index) => (
                        <div key={`${city.name}-${index}`} style={miniStatStyle}>
                          <strong>{index + 1}. {city.name}</strong>
                          <span>{city.temp.toFixed(1)} °C</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280' }}>No data available for today.</p>
                  )}
                </div>

                <div style={chartCardStyle}>
                  <h3 style={chartTitleStyle}>Coldest Cities Today</h3>
                  {countryDashboard.coldest_cities_today.length > 0 ? (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {countryDashboard.coldest_cities_today.map((city, index) => (
                        <div key={`${city.name}-${index}`} style={miniStatStyle}>
                          <strong>{index + 1}. {city.name}</strong>
                          <span>{city.temp.toFixed(1)} °C</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280' }}>No data available for today.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={chartCardStyle}>
            <h3 style={chartTitleStyle}>Quick Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div style={miniStatStyle}>
                <strong>{totalAlertCount}</strong>
                <span>Classified Alerts</span>
              </div>
              <div style={miniStatStyle}>
                <strong>{countryCityAlerts.length}</strong>
                <span>Affected Cities</span>
              </div>
              <div style={miniStatStyle}>
                <strong>{selectedCountry?.name ?? 'N/A'}</strong>
                <span>Selected Country</span>
              </div>
            </div>
          </div>

          {(countryClusters.length > 0 || countryLeaderboard.length > 0 || countryForecastRanking.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              <div style={chartCardStyle}>
                <h3 style={chartTitleStyle}>Weather Clusters</h3>
                {Object.entries(clusteredCountryCities).length > 0 ? (
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {Object.entries(clusteredCountryCities).map(([clusterLabel, cities]) => (
                      <div key={clusterLabel} style={miniStatStyle}>
                        <strong>{clusterLabel}</strong>
                        <span>{cities.length} cities in cluster</span>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>
                          {cities.slice(0, 3).map((city) => city.city_name).join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#6b7280' }}>No cluster data available.</p>
                )}
              </div>

              <div style={chartCardStyle}>
                <h3 style={chartTitleStyle}>City Forecast Leaderboard</h3>
                {countryLeaderboard.length > 0 ? (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {countryLeaderboard.map((entry) => (
                      <div key={`${entry.rank_position}-${entry.city_name}`} style={miniStatStyle}>
                        <strong>{entry.rank_position}. {entry.city_name}</strong>
                        <span>Score: {entry.forecast_score.toFixed(2)}</span>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>
                          Temp {entry.avg_temp.toFixed(1)}°C · Wind {entry.avg_wind.toFixed(1)} km/h · Humidity {entry.avg_humidity.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#6b7280' }}>No leaderboard data available.</p>
                )}
              </div>

              <div style={chartCardStyle}>
                <h3 style={chartTitleStyle}>Forecast Scoreboard</h3>
                {countryForecastRanking.length > 0 ? (
                  <div style={{ display: 'grid', gap: '10px' }}>
                    {countryForecastRanking.map((entry) => (
                      <div key={`${entry.rank_position}-${entry.city_name}-${entry.forecast_date}`} style={miniStatStyle}>
                        <strong>{entry.rank_position}. {entry.city_name}</strong>
                        <span>{entry.forecast_date}</span>
                        <span>Score: {entry.forecast_score.toFixed(2)}</span>
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>
                          Comments {entry.comment_count} · Reputation {entry.reputation_score.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: '#6b7280' }}>No forecast ranking data available.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'city' && (
        <>
          <form onSubmit={handleCitySearch} style={{ display: 'flex', gap: '10px', marginBottom: '16px', position: 'relative' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                value={cityInput}
                onChange={(event) => handleCityInputChange(event.target.value)}
                onFocus={() => citySearchSuggestions.length > 0 && setShowCitySuggestions(true)}
                placeholder="Search city (e.g., Cluj, Bucharest)..."
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db' }}
              />
              {showCitySuggestions && citySearchSuggestions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: 'white', border: '1px solid #d1d5db', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: '300px', overflowY: 'auto', zIndex: 10, marginTop: '4px' }}>
                  {citySearchSuggestions.map((city) => (
                    <button
                      key={city.id}
                      type="button"
                      onClick={() => void handleSelectCity(city)}
                      onMouseEnter={(event) => (event.currentTarget.style.backgroundColor = '#f9fafb')}
                      onMouseLeave={(event) => (event.currentTarget.style.backgroundColor = 'transparent')}
                      style={{ display: 'block', width: '100%', padding: '10px 12px', border: 'none', borderBottom: '1px solid #f0f0f0', backgroundColor: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '14px' }}
                    >
                      {city.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="submit" style={iconButtonStyle}>
              <Search size={16} />
            </button>
          </form>

          {citySearchResults.map((city) => (
            <button
              key={city.id}
              onClick={() => void fetchCityStats(city)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '10px',
                padding: '10px 14px',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                backgroundColor: 'white',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              {city.name}
            </button>
          ))}

          {cityError && <p style={{ color: '#dc2626' }}>{cityError}</p>}
          {isLoadingCity && <p>Loading city...</p>}

          {!isLoadingCity && selectedCity && cityAnomaly && (
            <div style={{ marginTop: '20px', display: 'grid', gap: '20px' }}>
              <div style={chartCardStyle}>
                <h3 style={chartTitleStyle}>{selectedCity.name}</h3>
                <p>Risk: {cityRisk?.p_risk_level}</p>
                <p>Trust: {cityTrust?.p_trust_score}</p>
                <p>Audit: {cityTrust?.p_audit_label}</p>
              </div>

              <div style={chartCardStyle}>
                <h3 style={chartTitleStyle}>Forecast for Selected Date</h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
                  <input
                    type="date"
                    value={cityPredictionDate}
                    onChange={(event) => setCityPredictionDate(event.target.value)}
                    style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #d1d5db' }}
                  />
                  <button
                    onClick={() => void handleGenerateCityPrediction()}
                    disabled={isLoadingCityPrediction}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: isLoadingCityPrediction ? 'wait' : 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    {isLoadingCityPrediction ? 'Generating...' : 'Generate Forecast'}
                  </button>
                </div>

                {cityPrediction ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <div style={miniStatStyle}>
                      <strong>Min Temp</strong>
                      <span>{cityPrediction.avg_temp_min.toFixed(1)} °C</span>
                    </div>
                    <div style={miniStatStyle}>
                      <strong>Max Temp</strong>
                      <span>{cityPrediction.avg_temp_max.toFixed(1)} °C</span>
                    </div>
                    <div style={miniStatStyle}>
                      <strong>Wind</strong>
                      <span>{cityPrediction.avg_wind_speed.toFixed(1)} km/h</span>
                    </div>
                    <div style={miniStatStyle}>
                      <strong>Humidity</strong>
                      <span>{Math.round(cityPrediction.avg_humidity)}%</span>
                    </div>
                    <div style={{ gridColumn: '1 / -1', padding: '14px', borderRadius: '12px', backgroundColor: '#f3e8ff', color: '#7c3aed', fontWeight: 'bold', textAlign: 'center' }}>
                      {cityPrediction.icon_type}
                    </div>
                    <div style={{ gridColumn: '1 / -1', padding: '14px', borderRadius: '12px', backgroundColor: '#fef3c7', color: '#92400e', fontWeight: 'bold', textAlign: 'center' }}>
                      UV Index: {cityPrediction?.uv_index ?? 'N/A'}
                    </div>
                  </div>
                ) : (
                  <p style={{ color: '#6b7280', margin: 0 }}>Select a date and click to generate the forecast.</p>
                )}
              </div>

              {citySeasonalComparison.length > 0 && (
                <div style={chartCardStyle}>
                  <h3 style={chartTitleStyle}>Seasonal Comparison</h3>
                  <p style={{ color: '#6b7280', marginTop: 0 }}>
                    The first card compares the selected city with the same date across prior years; the second compares it with the city&apos;s seasonal baseline.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                    {citySeasonalComparison.map((item) => (
                      <div key={item.comparison_label} style={miniStatStyle}>
                          <strong>{formatSeasonalComparisonTitle(item.comparison_label)}</strong>
                        <span>
                          Temp: {item.current_avg_temp?.toFixed(1) ?? 'N/A'}°C vs {item.reference_avg_temp?.toFixed(1) ?? 'N/A'}°C
                        </span>
                        <span>
                          Wind: {item.current_avg_wind?.toFixed(1) ?? 'N/A'} vs {item.reference_avg_wind?.toFixed(1) ?? 'N/A'} km/h
                        </span>
                        <span>
                          Humidity: {item.current_avg_humidity?.toFixed(1) ?? 'N/A'}% vs {item.reference_avg_humidity?.toFixed(1) ?? 'N/A'}%
                        </span>
                        <strong>Delta: {item.delta_score?.toFixed(2) ?? 'N/A'}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={chartCardStyle}>
                <h3 style={chartTitleStyle}>Deviație temperatură</h3>
                <div style={{ minWidth: 0, width: '100%' }}>
                  <div className="resp-wrap chart-card">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[{ name: 'Deviația curentă', deviation: cityAnomaly.p_deviation }]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="deviation" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {cityAlerts.length > 0 && (
                <div style={chartCardStyle}>
                  <h3 style={chartTitleStyle}>Alerts for {selectedCity.name}</h3>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb', textAlign: 'left' }}>
                          <th style={{ padding: '10px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>Mesaj</th>
                          <th style={{ padding: '10px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>Recomandare</th>
                          <th style={{ padding: '10px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151' }}>Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cityAlerts.map((alert) => (
                          <tr key={alert.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '10px 12px', color: '#1f2937' }}>{alert.alert_message}</td>
                            <td style={{ padding: '10px 12px', color: '#6b7280' }}>{alert.recommendation ?? '—'}</td>
                            <td style={{ padding: '10px 12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                              {alert.created_at ? new Date(alert.created_at).toLocaleDateString('ro-RO') : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Statistics;