// Render Workflows 진입점. 여기서 export한 task가 배포 때 등록된다.
import { task } from "@renderinc/sdk/workflows";

// 연결 확인용 인사 task
export const hello = task({ name: "hello" }, function hello(_ctx, name: string = "CMMS"): string {
  return `Hello, ${name}!`;
});

// 이름마다 hello를 병렬로 실행하고 결과를 모은다.
export const helloMany = task(
  {
    name: "helloMany",
    retry: { maxRetries: 2, waitDurationMs: 1000, backoffScaling: 2 },
    timeoutSeconds: 300,
  },
  async function helloMany(ctx, names: string[]): Promise<string[]> {
    return Promise.all(names.map((name) => ctx.run(hello, name)));
  },
);

export { recheck, sweep } from "./moderation/tasks";
export { checkDb, checkLogs, checkLlm } from "./agent-check/tasks";
