// 환경 변수를 읽는다. 없으면 바로 실패한다.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 ${name}가 없습니다 (Render Workflow 서비스 > Environment)`);
  return value;
}
