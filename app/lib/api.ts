import { treaty } from "@elysiajs/eden";
import type { App } from "../../server/index";

// Same-origin: the browser re-sends the cached Basic Auth credentials automatically.
export const api = treaty<App>(typeof window === "undefined" ? "http://localhost:3000" : window.location.origin);
