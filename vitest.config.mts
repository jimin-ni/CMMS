import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

// workers/presence 는 자기 vitest 설정(Workers 런타임)으로 따로 돈다.
// .claude 아래 작업 폴더(worktree)의 테스트도 여기서 돌리지 않는다.
export default defineConfig({
  // tsconfig 의 "@/..." 와 같다 (src/lib 의 모듈이 서로 이렇게 부른다)
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    exclude: [...configDefaults.exclude, "workers/**", ".claude/**"],
  },
});
