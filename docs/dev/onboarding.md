# 온보딩 컨셉 B, C 개발 메모

- 상태: 시안 비교 중 (2026-11-15). 글과 이미지는 임시이고, 모션의 느낌을 비교하는 단계입니다.
- 브랜치: `jimins-claude/feature-onboarding-c` → `jimins-claude/feature-onboarding-b` (B는 C 위에서 만들었습니다. B 브랜치에 C도 들어 있습니다)
- 머지 순서: C 먼저, 그다음 B
- 기획 근거: `docs/planning/08-design.md` §7-1 (최초 접속자 흐름 A1~A4, B1~B3)

## 화면

| 주소 | 흐름 |
|---|---|
| `/onboarding/c` | 어두운 화면 "Memories" → 창문 빛과 빈 2번 방 → 스크롤마다 글과 가구가 번갈아 떨어져 쌓임 → Ready to Start? → 방이 화면 가득 확대 → 방 안 둘러보기 |
| `/onboarding/b` | 책상 위 바인더 노트(링이 아래) → 스크롤하면 아랫장이 링을 지나 위로 넘어와 덮임(3D) → 하드보드 표지가 덮여 앨범 한 권이 되고 책 등이 보이게 세워짐 → 책상이 걷히고 2번 방이 보임 → 카메라가 책장으로 줌인, 앨범이 꽂힌 뒤 줌아웃 → Ready to Start? → 방 안 둘러보기 |
| `/plan` | 나만의 방 결제 안내. 가격이 정해지지 않아 결제 버튼은 비활성 |

방 안 둘러보기(B, C 공통): 아래 종이 안내 팝업, 둘러보기 진행 점(2번 방은 6곳), 3곳을 둘러보면 위에 내비게이션 바(로그인, 내 방 만들기, 쪽지 남기기). 로그인 전에는 세 아이콘 모두 로그인 팝업을 띄웁니다. 로그인하면 바에 닉네임이 보이고, 내 방 만들기는 `/plan`, 쪽지 남기기는 `/tree-mock/index.html`로 갑니다.

## 구조

| 영역 | 파일 | 내용 |
|---|---|---|
| 페이지 | `src/app/onboarding/[concept]/page.tsx` | B, C는 실제 2번 방(`dname`)을 읽어 화면 전체를 덮음 |
| 방 데이터 | `src/lib/heap/room-view.ts` | `loadRoomView`. `/room/[roomId]`에서 옮긴 변환 함수. 동작은 같음 |
| 컨셉 C | `src/components/onboarding-c/concept-c.tsx`, `story.ts` | 스크롤 시간표, 단계별 글, 둘러볼 곳 |
| 컨셉 B | `src/components/onboarding-b/concept-b.tsx`, `pages.tsx`, `doodles.tsx` | 3D 책(CSS 3D), 장 콜라주, 손그림 선 |
| 공통 | `src/components/onboarding-c/room-tour.tsx`, `paper.tsx`, `icons.tsx`, `login-popup.tsx` | 둘러보기, 종이 질감 판과 테이프, Pixelarticons, 로그인 팝업 |
| 엔진 훅 | `src/components/heap/engine/intro.js` | `heap:intro`, `heap:introquery` |
| 글꼴 | `src/app/fonts/` | 머니그라피 Pixel·Rounded, Pretendard Variable. 온보딩 화면에만 적용 |

## 변경 사항 (다른 작업자와 AI용 요약)

- 힙 엔진에 `intro.js`를 새로 넣었다.
- `index.js`에 `setupIntro(ctx)` 한 줄을 넣었다.
- `loop.js`의 `roomCam`이 `ctx.introView`(거리 배율, 회전, 책장 줌)를 읽는다.
- `heap:intro`를 보내지 않으면 `introView`는 거리 1, 회전 0, 줌 0이다. 기존 방은 전과 같다.
- `heap:intro` 값: `items`(가구별 0~1), `pile`(사진 더미 0~1), `dist`, `turn`, `focus`(책장 줌 0~1), `album`(책장에 앨범을 꽂을지).
- `heap:intro`에 `null`을 보내면 가구, 사진, 카메라가 제자리로 돌아간다. 꽂은 앨범은 남는다.
- `heap:introquery`는 앨범 자리의 화면 좌표 `{ x, y, h }`를 콜백으로 준다. 책장이 없으면 `null`이다.
- 앨범 자리는 책장 맨 윗칸 왼쪽 끝의 빈칸이다 (책장 지역 좌표 x -0.665).
- 둘러보기 수는 엔진을 읽기만 해서 센다: `heap:mode`(sit, watch, sort)와 창의 `hidden` 속성.
- `/room/[roomId]/page.tsx`의 변환 함수를 `src/lib/heap/room-view.ts`로 옮겼다. 결과는 같다.
- 새 라우트는 `/onboarding/b`, `/onboarding/c`, `/plan`이다.
- DB와 마이그레이션은 바뀌지 않았다. 새 npm 의존성은 없다.

## 로컬에서 보기

```
git fetch origin
git switch jimins-claude/feature-onboarding-b
npm install
npm run dev
```

- `http://localhost:3000/onboarding/b`, `http://localhost:3000/onboarding/c`
- 공유 DB의 2번 방을 읽으므로 `.env.local`의 `DATABASE_URL`이 있어야 합니다. 마이그레이션은 필요 없습니다.
- 로그인은 하지 않아도 됩니다. 로그인 팝업까지 보려면 기존 테스트 계정으로 로그인하세요.

## 알려진 점

- 이 PC에서는 메모리가 부족해 `npm run build`가 빌드 작업 단계에서 실패했습니다. 빌드 작업 수를 2로 줄이면 통과합니다 (`next.config.ts`의 `experimental.cpus`, 커밋하지 않음).
- dev 콘솔의 404 한 건은 2번 방의 유튜브 썸네일입니다. `/room/dname`에서도 같습니다.
