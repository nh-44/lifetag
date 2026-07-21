/// <reference types="vite/client" />

interface Window {
  NDEFReader?: any;
}

declare class NDEFReader {
  constructor();
  scan(): Promise<void>;
  write(message: any): Promise<void>;
  addEventListener(type: string, listener: (event: any) => void): void;
}
