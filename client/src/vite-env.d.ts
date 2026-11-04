/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** JSON array of {x, y} Healthcare Authority public keys (offline Tier 2 trust anchors). */
  readonly VITE_AUTHORITY_PUBLIC_KEYS?: string;
}

interface Window {
  NDEFReader?: any;
}

declare class NDEFReader {
  constructor();
  scan(options?: { signal?: AbortSignal }): Promise<void>;
  write(message: any, options?: { signal?: AbortSignal }): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void): void;
}
