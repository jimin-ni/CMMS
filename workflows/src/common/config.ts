// 환경 변수 읽기. 값이 없으면 task를 시작하자마자 이유를 밝히고 실패한다. 값 자체는 로그에 남기지 않는다.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 ${name}가 없습니다 (Render Workflow 서비스 > Environment)`);
  return value;
}
