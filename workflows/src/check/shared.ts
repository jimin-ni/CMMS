// Root Directory(workflows) 밖의 앱 코드를 Workflow가 읽을 수 있는지 확인하는 task.
// AI 스크리닝 재판정은 src/lib/moderation/의 순수 모듈을 그대로 쓰므로 배포 환경에서 이 import가 되어야 한다.
// 확인이 끝나면 지운다 (docs/dev/render-workflows.md 1단계).
import { task } from "@renderinc/sdk/workflows";
import { normalize } from "../../../src/lib/moderation/normalize";

export const checkNormalize = task(
  { name: "check.normalize", timeoutSeconds: 60 },
  function checkNormalize(_ctx, text: string = "ㅅ ㅂ 테스트") {
    return normalize(text);
  },
);
