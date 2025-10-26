// src/api/client.ts
import axios from "axios";
import { useAuthStore } from "../store/auth.store"; //Fix import

// ---- Assert env presence to avoid silent fallbacks ----
const API_BASE = import.meta.env.VITE_API_BASE;
const API_BASE_PROJECTS = import.meta.env.VITE_API_BASE_PROJECTS;

export const client = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // allow cookies if needed
});

// Attach Authorization header from Zustand on every request
client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token; //Fix: useAuthStore
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401s globally (logout + redirect if you want)
client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().logout?.(); // safe call if logout exists
    }
    return Promise.reject(error);
  }
);

/*************************************************************** */
// ---- Dedicated client for ProjectService (separate base URL) ----
export const projectsClient = axios.create({
  baseURL: API_BASE_PROJECTS,
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

projectsClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

projectsClient.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      useAuthStore.getState().logout?.();
    }
    return Promise.reject(error);
  }
);