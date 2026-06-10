import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

interface FailedRequest {
    onSuccess: (token: string) => void;
    onError: (error: AxiosError) => void;
}

interface CustomRequestConfig extends AxiosRequestConfig {
    _retry?: boolean;
}

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

let isTokenRefreshing = false;
let pendingRequestQueue: FailedRequest[] = [];

const processPendingQueue = (error: AxiosError | null, token: string | null = null) => {
    pendingRequestQueue.forEach(pendingRequest => {
        if (error) {
            pendingRequest.onError(error);
        } else if (token) {
            pendingRequest.onSuccess(token);
        }
    });
    pendingRequestQueue = [];
};

api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const failedRequest = error.config as CustomRequestConfig | undefined;

        if (!failedRequest) {
            return Promise.reject(error);
        }

        if (error.response?.status === 401 && !failedRequest._retry) {
            if (isTokenRefreshing) {
                return new Promise<string>((resolve, reject) => {
                    pendingRequestQueue.push({ onSuccess: resolve, onError: reject });
                }).then((newToken) => {
                        failedRequest.headers = {
                            ...(failedRequest.headers ?? {}),
                            Authorization: `Bearer ${newToken}`,
                        };
                        return api(failedRequest);
                });
            }

            failedRequest._retry = true;
            isTokenRefreshing = true;

            const storedRefreshToken = localStorage.getItem('refresh_token');
            if (!storedRefreshToken) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
                return Promise.reject(error);
            }

            try {
                const refreshResponse = await axios.post(
                    `${import.meta.env.VITE_API_URL}/auth/refresh`,
                    { refresh_token: storedRefreshToken }
                );

                const { access_token } = refreshResponse.data;
                localStorage.setItem('access_token', access_token);

                api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
                failedRequest.headers = {
                    ...(failedRequest.headers ?? {}),
                    Authorization: `Bearer ${access_token}`,
                };

                processPendingQueue(null, access_token);
                return api(failedRequest);
            } catch (refreshError) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
                processPendingQueue(refreshError as AxiosError, null);
                return Promise.reject(refreshError);
            } finally {
                isTokenRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default api;