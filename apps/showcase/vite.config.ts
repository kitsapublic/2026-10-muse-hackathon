import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

/**
 * In development the page is served from 127.0.0.1:5173 and `/v1` is proxied to the service on 127.0.0.1:8765. The
 * proxy rewrites Host to the service's loopback address and leaves Origin as the development page's, so the service
 * must be started with `--allow-origin http://127.0.0.1:5173`; changes still need the session's action token.
 * Production builds are served by the service itself, on one origin.
 */
const service = process.env.ELIGIBILITY_LAB_SERVICE ?? "http://127.0.0.1:8765";

export default defineConfig({
  plugins: [react()],
  resolve: { conditions: ["source", ...defaultClientConditions] },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/v1": { target: service, changeOrigin: true } },
  },
  build: { outDir: "dist", sourcemap: false, assetsInlineLimit: 0 },
});
