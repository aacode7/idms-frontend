import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";

const runtime = process.env.IDMS_E8_RUNTIME_FILE
  ? JSON.parse(readFileSync(process.env.IDMS_E8_RUNTIME_FILE, "utf8"))
  : null;
const webOrigin = process.env.IDMS_E8_WEB_ORIGIN;
export default defineConfig({
  testDir: "./tests",
  workers: 2,
  timeout: 30000,
  use: {
    baseURL: webOrigin ?? "http://127.0.0.1:3138",
    browserName: "chromium",
    trace: "retain-on-failure",
  },
  webServer: webOrigin
    ? undefined
    : {
        command: "npm run start -- --hostname 127.0.0.1 --port 3138",
        url: "http://127.0.0.1:3138",
        reuseExistingServer: false,
        env: { IDMS_API_INTERNAL_URL: runtime?.origin ?? "http://127.0.0.1:9" },
      },
});
