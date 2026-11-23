import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // 테스트 전용 값. 실제 비밀값이 아니다.
      miniflare: { bindings: { PRESENCE_TICKET_SECRET: "test-secret-not-real", ALLOWED_ORIGINS: "http://localhost:3000", PRESENCE_STALE_MS: "600" } },
    }),
  ],
});
