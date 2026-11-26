// Render Workflows 진입점. 이 파일에서 정의한 task가 배포 때 Render에 등록된다.
// Render 안에서 실행되면(RENDER_SDK_SOCKET_PATH가 있으면) SDK가 task 등록이 끝난 뒤 task 서버를 자동으로 띄운다.
// 웹 서비스에서는 '<workflow 슬러그>/hello' 같은 식별자로 실행한다.
import { task } from "@renderinc/sdk/workflows";

// 가장 작은 task. 연결 확인용.
export const hello = task({ name: "hello" }, function hello(_ctx, name: string = "CMMS"): string {
  return `Hello, ${name}!`;
});

// 여러 이름에 hello를 병렬로 실행하고 결과를 모은다. ctx.run은 각 실행을 별도 인스턴스에서 돌린다.
// 이후 에이전트 task도 이 모양(나누기 → 병렬 실행 → 모으기)으로 만든다.
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

// AI 스크리닝 사후 재판정 (docs/planning/16-render-workflows.md)
export { recheck, sweep } from "./moderation/tasks";
