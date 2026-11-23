import { configDefaults, defineConfig } from "vitest/config";

// workers/presence 는 자기 vitest 설정(Workers 런타임)으로 따로 돈다.
// .claude 아래 작업 폴더(worktree)의 테스트도 여기서 돌리지 않는다.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "workers/**", ".claude/**"],
  },
});
