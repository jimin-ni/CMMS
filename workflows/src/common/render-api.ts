// Render API로 웹 서비스 로그와 배포를 읽는다.
import { requireEnv } from "./config";
import { maskSecrets } from "./report";

const BASE = "https://api.render.com/v1";

async function renderGet<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${requireEnv("RENDER_API_KEY")}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Render API ${path} 실패: ${res.status} ${maskSecrets((await res.text()).slice(0, 300))}`);
  }
  return (await res.json()) as T;
}

export interface LogLine {
  timestamp: string;
  level?: string;
  type?: string;
  message: string;
}

interface RawLog {
  timestamp: string;
  message: string;
  labels?: { name: string; value: string }[];
}

export interface LogQuery {
  type?: "app" | "request" | "build";
  level?: string;
  text?: string;
  // ISO 시각. 없으면 최근 1시간
  startTime?: string;
  endTime?: string;
  // 최대 100
  limit?: number;
}

// 웹 서비스 로그. 비밀값은 가려서 돌려준다.
export async function getWebLogs(q: LogQuery = {}): Promise<{ lines: LogLine[]; hasMore: boolean }> {
  const body = await renderGet<{ logs?: RawLog[]; hasMore?: boolean }>("/logs", {
    ownerId: requireEnv("RENDER_OWNER_ID"),
    resource: requireEnv("RENDER_WEB_SERVICE_ID"),
    type: q.type,
    level: q.level,
    text: q.text,
    startTime: q.startTime,
    endTime: q.endTime,
    limit: Math.min(q.limit ?? 20, 100),
  });
  const lines = (body.logs ?? []).map((log) => {
    const label = (name: string) => log.labels?.find((l) => l.name === name)?.value;
    return { timestamp: log.timestamp, level: label("level"), type: label("type"), message: maskSecrets(log.message) };
  });
  return { lines, hasMore: body.hasMore ?? false };
}

export interface DeployInfo {
  id: string;
  status: string;
  commit?: string;
  createdAt: string;
}

export async function getRecentDeploys(limit = 5): Promise<DeployInfo[]> {
  const rows = await renderGet<{ deploy: { id: string; status: string; commit?: { id: string }; createdAt: string } }[]>(
    `/services/${requireEnv("RENDER_WEB_SERVICE_ID")}/deploys`,
    { limit },
  );
  return rows.map(({ deploy }) => ({
    id: deploy.id,
    status: deploy.status,
    commit: deploy.commit?.id?.slice(0, 7),
    createdAt: deploy.createdAt,
  }));
}
