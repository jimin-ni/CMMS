import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { Pool } from "pg";
import { ac, roles } from "./access";
import { NICKNAME_TEXT } from "./nickname";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 닉네임을 새로 정하거나 바꿀 때 길이와 AI 스크리닝을 서버에서 다시 본다.
// 가입 화면의 확인은 안내용이고, 실제로 막는 곳은 여기다.
// 판정 모듈은 server-only라 auth:migrate(CLI)에서 읽히지 않도록 쓸 때만 불러온다.
async function assertNickname(name: unknown, headers: Headers | undefined): Promise<string> {
  const { checkNickname, clientKey } = await import("./moderation/nickname");
  const value = typeof name === "string" ? name.trim() : "";
  const status = await checkNickname(value, clientKey(headers));
  if (status !== "ok") {
    throw APIError.from("BAD_REQUEST", { message: NICKNAME_TEXT.ko[status], code: `NICKNAME_${status.toUpperCase()}` });
  }
  return value;
}

export const auth = betterAuth({
  database: pool,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  databaseHooks: {
    user: {
      create: {
        async before(user, context) {
          const name = await assertNickname(user.name, context?.headers ?? context?.request?.headers);
          return { data: { ...user, name } };
        },
      },
      update: {
        // 이름을 바꾸는 요청에만 검사한다. 기존 계정의 긴 닉네임은 이름을 바꾸지 않는 한 그대로 둔다.
        async before(data, context) {
          if (data.name === undefined) return;
          const name = await assertNickname(data.name, context?.headers ?? context?.request?.headers);
          return { data: { ...data, name } };
        },
      },
    },
  },
  plugins: [
    admin({
      ac,
      roles,
      defaultRole: "public",
      adminRoles: ["admin"],
    }),
  ],
});
