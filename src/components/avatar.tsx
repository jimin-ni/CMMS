// 프로필 사진. 사진이 없으면 이름 첫 글자를 보여준다. (사진은 크리에이터만 등록할 수 있다.)
export function Avatar({
  name,
  url,
  size,
  className = "",
}: {
  name: string;
  url: string | null;
  size: number;
  className?: string;
}) {
  const shape = `shrink-0 overflow-hidden rounded-[38%] ${className}`;
  if (url) {
    // DB에 저장한 사진을 API 주소로 바로 보여준다. next/image 최적화 대상이 아니다.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className={`${shape} object-cover`} style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className={`${shape} flex items-center justify-center bg-key-blue/40 font-semibold text-key-brown`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {Array.from(name)[0] ?? "?"}
    </span>
  );
}
