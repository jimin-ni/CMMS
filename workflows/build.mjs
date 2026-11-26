// Workflow 코드를 dist/index.js 한 파일로 묶는다.
// 이유: 재판정 task는 ../src/lib/moderation/의 앱 코드를 그대로 쓰는데, 그 코드가 import하는 drizzle-orm 등은
// Render에서 workflows/node_modules에만 설치된다(Root Directory가 workflows). Node는 ../src 위치에서 위로만
// node_modules를 찾으므로 그대로 실행하면 못 찾는다. 묶을 때 nodePaths로 workflows/node_modules를 보게 한다.
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
  // pg가 선택적으로 찾는 네이티브 모듈. 설치하지 않으므로 묶지 않는다.
  external: ["pg-native"],
  // 묶은 CommonJS 패키지(pg 등)가 require를 쓸 수 있게 한다.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  logLevel: "info",
});
