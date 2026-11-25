import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // presence 워커는 자기 tsconfig와 테스트로 검사한다 (workers/presence).
    "workers/**",
    // Render Workflows는 자기 package.json과 tsconfig로 검사한다 (workflows).
    "workflows/**",
  ]),
]);

export default eslintConfig;
