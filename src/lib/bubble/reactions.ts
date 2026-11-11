// AI 반응 미리보기에서 고를 수 있는 크리에이터 반응 목록.
// 지금은 얼굴 이모지만 쓰고, 나중에 크리에이터별 이미지(png, jpg, gif, svg)로 바꿀 수 있게
// kind로 구분한다. description은 AI가 반응을 고를 때 기준으로 읽는다(영어가 정확도가 높다).

export type Reaction =
  | { id: string; kind: "emoji"; value: string; label: string; description: string }
  | { id: string; kind: "image"; src: string; label: string; description: string };

export const FACE_REACTIONS: Reaction[] = [
  { id: "grinning", kind: "emoji", value: "😀", label: "활짝 웃음", description: "Happy and pleased in a simple, cheerful way." },
  { id: "beaming", kind: "emoji", value: "😁", label: "환하게 웃음", description: "Beaming with excitement or pride; very glad to hear it." },
  { id: "joy", kind: "emoji", value: "😂", label: "웃겨서 눈물", description: "Finds the message hilarious; laughing to tears at a joke or funny story." },
  { id: "smiley", kind: "emoji", value: "😃", label: "반가움", description: "Glad and energetic; a bright greeting or happy agreement." },
  { id: "blush", kind: "emoji", value: "😊", label: "수줍은 미소", description: "Warm, touched, or shyly happy; receiving thanks or a compliment." },
  { id: "laughing", kind: "emoji", value: "😆", label: "깔깔", description: "Laughing playfully; amused by teasing or a light, silly remark." },
  { id: "kiss", kind: "emoji", value: "😘", label: "뽀뽀", description: "Sending love back; an affectionate reply to love, support, or cheering." },
  { id: "heart_eyes", kind: "emoji", value: "😍", label: "하트 눈", description: "Adores something; delighted by something cute, beautiful, or lovely." },
  { id: "hugging", kind: "emoji", value: "🤗", label: "포옹", description: "Wants to comfort or embrace; reply to a fan who is tired, sad, or needs support." },
  { id: "star_struck", kind: "emoji", value: "🤩", label: "감탄", description: "Amazed and thrilled; reacting to big news, an achievement, or a great idea." },
  { id: "thinking", kind: "emoji", value: "🤔", label: "생각 중", description: "Curious or pondering; a question that needs thought or an unclear message." },
  { id: "surprised", kind: "emoji", value: "😮", label: "놀람", description: "Surprised by unexpected news or a surprising fact." },
  { id: "pleading", kind: "emoji", value: "🥺", label: "뭉클", description: "Moved or sympathetic; a heartfelt, emotional, or sad message." },
  { id: "sweat", kind: "emoji", value: "😅", label: "멋쩍은 웃음", description: "Awkward or embarrassed laugh; mild teasing, an awkward request, or an off-topic remark." },
];

export function findReaction(id: string): Reaction | undefined {
  return FACE_REACTIONS.find((r) => r.id === id);
}
