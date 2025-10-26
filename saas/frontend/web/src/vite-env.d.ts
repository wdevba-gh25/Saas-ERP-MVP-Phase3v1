/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string
  readonly VITE_API_BASE_PROJECTS: string;
  // add more env vars as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}