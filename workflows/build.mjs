// Workflow 코드를 dist/index.js 한 파일로 묶는다.
// ../src 앱 코드가 workflows/node_modules의 패키지를 찾게 하려고 묶는다.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

await build({
  entryPoints: [`${here}src/index.ts`],
  outfile: `${here}dist/index.js`,
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: true,
  nodePaths: [`${here}node_modules`],
  // 설치하지 않는 선택 모듈(pg-native)과 큰 패키지(typescript)는 묶지 않는다.
  external: ["pg-native", "typescript"],
  // 묶은 CommonJS 패키지(pg 등)가 require를 쓸 수 있게 한다.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
