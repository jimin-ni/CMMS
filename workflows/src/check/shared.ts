// 묶음 빌드(build.mjs)가 앱 코드와 그 의존성(drizzle-orm)을 제대로 담는지 확인하는 task. DB에는 접속하지 않는다.
// 확인이 끝나면 지운다 (docs/dev/render-workflows.md 6단계).
import { task } from "@renderinc/sdk/workflows";
import { getTableName } from "drizzle-orm";
import { bubbleMessages, moderationEvents } from "../../../src/lib/schema";
import { planScreen, recordScreenEvent, loadScreenLists } from "../../../src/lib/moderation/persist";
import { normalize } from "../../../src/lib/moderation/normalize";

export const checkShared = task({ name: "check.shared", timeoutSeconds: 60 }, function checkShared() {
  return {
    tables: [getTableName(bubbleMessages), getTableName(moderationEvents)],
    functions: [planScreen, recordScreenEvent, loadScreenLists].map((f) => typeof f),
    normalized: normalize("ㅅ ㅂ 테스트").text,
  };
});
