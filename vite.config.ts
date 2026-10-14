import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const apiPort = process.env.PORT ?? "3000";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: { alias: { "~": "/app" } },
  server: {
    port: 5173,
    // Dev only: forward API calls to the Elysia server (which enforces the session check).
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
});
