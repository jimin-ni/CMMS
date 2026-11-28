import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

// 역할 3종: admin(관리자), creator(크리에이터), public(구독자 / 일반 사용자)
export const statement = { ...defaultStatements } as const;
export const ac = createAccessControl(statement);

export const roles = {
  admin: ac.newRole({ ...adminAc.statements }),
  creator: ac.newRole({}),
  public: ac.newRole({}),
};
