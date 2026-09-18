/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_IDLE_TIMEOUT_MIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
