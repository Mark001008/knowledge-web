export const appConfig = {
  apiBaseUrl: window.KB_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "http://localhost:8080" : "")
};
