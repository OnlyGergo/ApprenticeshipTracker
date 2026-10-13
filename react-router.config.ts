import type { Config } from "@react-router/dev/config";

// SPA mode: the Elysia server serves build/client and handles /api.
export default {
  appDirectory: "app",
  ssr: false,
} satisfies Config;
