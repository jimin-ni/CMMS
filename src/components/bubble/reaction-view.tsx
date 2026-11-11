import type { Reaction } from "@/lib/bubble/reactions";

// 반응 하나를 그린다. 지금은 이모지, 나중에는 이미지 파일(png, jpg, gif, svg)도 같은 자리에 그린다.
export function ReactionView({ reaction, size = 32 }: { reaction: Reaction; size?: number }) {
  if (reaction.kind === "image") {
    // 크리에이터가 올린 파일은 크기와 출처가 제각각이라 next/image 대신 img를 쓴다.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={reaction.src} alt={reaction.label} width={size} height={size} />;
  }
  return (
    <span role="img" aria-label={reaction.label} style={{ fontSize: size, lineHeight: 1 }}>
      {reaction.value}
    </span>
  );
}
