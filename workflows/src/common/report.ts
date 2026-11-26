// 에이전트 결과 모양과 비밀값 가리기

export interface Finding {
  file?: string;
  line?: number;
  severity: "info" | "low" | "medium" | "high";
  title: string;
  detail: string;
}

export interface AgentResult {
  agent: string;
  status: "ok" | "partial" | "failed";
  summary: string;
  findings: Finding[];
  links: string[];
  cost: { calls: number; costUsd: number; inputTokens: number; outputTokens: number };
}

const MASKS: [RegExp, string][] = [
  // 접속 주소 (계정과 비밀번호 포함)
  [/\b(postgres(?:ql)?|redis|mysql):\/\/[^\s"'`]+/gi, "$1://[가림]"],
  // Anthropic, OpenAI, GitHub, Render 키 모양
  [/\b(sk-ant-[\w-]{10,}|sk-[\w-]{20,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|rnd_[\w]{16,})\b/g, "[키 가림]"],
  [/\b(Bearer)\s+[\w.~+/=-]{16,}/gi, "$1 [가림]"],
  // 이메일
  [/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, "[이메일 가림]"],
  // 세션 토큰, 해시처럼 보이는 긴 문자열
  [/\b[A-Za-z0-9_-]{40,}\b/g, "[긴 값 가림]"],
];

export function maskSecrets(text: string): string {
  return MASKS.reduce((acc, [re, to]) => acc.replace(re, to), text);
}
