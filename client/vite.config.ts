/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.spec.{ts,tsx}",
        "src/setupTests.ts",
        "src/vite-env.d.ts",
        "src/main.tsx",
        "src/index.tsx",
        "src/components/ui/**",
        "src/hooks/**",
        "src/pages/**",
        "src/services/seedData.ts",
        "src/components/layout/**",
        "src/services/userService.ts",
        "src/services/api.ts",
        "src/types/**",
        "src/App.tsx"
      ],
      thresholds: {
        statements: 65,
        branches: 55,
        functions: 55,
        lines: 65,
      }
    }
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
