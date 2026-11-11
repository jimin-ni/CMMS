import { headers } from "next/headers";
import { auth } from "./auth";

export type Role = "admin" | "creator" | "public";

export type Viewer = {
  id: string;
  name: string;
  role: Role;
};

// 요청 시점의 세션을 읽는다. 호출하는 컴포넌트는 반드시 <Suspense> 안에 둔다.
export async function getViewer(): Promise<Viewer | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = session.user as { id: string; name: string; role?: string | null };
  const role: Role =
    user.role === "admin" || user.role === "creator" ? user.role : "public";
  return { id: user.id, name: user.name, role };
}
