# 버블, 크리에이터 톡, AI 반응 미리보기 개발 메모

- 상태: 1차 개발이 main에 머지됨 (PR #16, #23, #24). 이슈 #4 닫음. 크리에이터 톡과 프로필 사진은 PR #27 (`jimins-claude/feature-main1-creator-talk`, 머지 전). 남은 작업은 #19, #21, #22 (2026-11-12)
- 기획 근거: `docs/planning/02-features.md` 3-1~3-4절
- 버전: Next.js 16.4.6, `drizzle-orm` 0.45.4, PostgreSQL 16.15, Jev `jev-latest` (전체 표는 `docs/planning/03-tech-stack.md` 1-1절)

## 구조

| 영역 | 파일 | 내용 |
|---|---|---|
| 규칙 값 | `src/lib/bubble/policy.ts` | 글자 수, 삭제 시간, 전송 제한, 미리보기 디바운스. 숫자는 이 파일에서만 바꿈 |
| DB 접근 | `src/lib/bubble/repo.ts`, `src/lib/schema.ts` | Drizzle 쿼리. DB 접근은 `repo` 계층에만 둠 |
| 쓰기 | `src/lib/bubble/actions.ts` | Server Actions: 방 열기, 참여, 전송, 삭제, 방 닫기 |
| 실시간 읽기 | `src/app/api/bubble/rooms/[roomId]/messages/route.ts` | `?since=` 이후 바뀐 메시지, 다음 기준점, 방 상태, 참여 인원 |
| 대화 화면 | `src/components/bubble/room-chat.tsx`, `composer.tsx`, `room-controls.tsx` | 버블과 크리에이터 톡이 함께 씀. 읽기 주소, 보내기·삭제 동작, 대상 id를 props로 받음. 5초 폴링, id 기준으로 메시지 합침. 방이 닫히거나 인원이 바뀌면 머리글을 다시 그림 |
| 채팅 탭 | `src/components/bubble/chat-tabs.tsx` | 크리에이터에게만 "구독자" / "크리에이터 톡" 탭 |
| 크리에이터 톡 | `src/lib/bubble/talk-repo.ts`, `talk-actions.ts`, `src/app/bubble/talk/`, `src/app/api/bubble/talk/[chatId]/messages/route.ts`, `src/components/bubble/creator-picker.tsx` | 크리에이터끼리 1:1·그룹 대화. 역할과 참여 여부를 서버에서 매번 확인 |
| 프로필 사진 | `src/lib/creator/avatar.ts`, `src/app/api/creator/avatar/[userId]/route.ts`, `src/components/avatar.tsx`, `src/components/creator/avatar-form.tsx` | 크리에이터만 등록. 사진이 없으면 이름 첫 글자 |
| AI 미리보기 | `src/lib/bubble/ai-preview.ts`, `src/app/api/bubble/preview/route.ts` | Jev 호출. 구독자만 사용 |
| 반응 목록 | `src/lib/bubble/reactions.ts` | 얼굴 이모지 14개. `kind`로 이모지와 이미지를 구분 |
| 크리에이터 성격 | `src/lib/creator/`, `src/components/creator/persona-form.tsx` | `/creator`에서 저장. 다른 사람에게 보이지 않음 |

## 규칙 값 (`policy.ts`)

| 항목 | 값 |
|---|---|
| 글자 수 | 구독자 200자, 크리에이터 500자 |
| 본인 메시지 삭제 | 보낸 뒤 10분 안 |
| 전송 제한 | 10초 간격, 10분에 15건 |
| 미리보기 | 입력이 3초 동안 바뀌지 않으면 요청. 최근 대화 10개, 메시지당 200자까지 문맥으로 사용 |
| 크리에이터 톡 | 대화 하나에 나 포함 최대 20명, 크리에이터 목록 최대 50명. 글자 수·삭제·전송 제한은 크리에이터 값과 같음 |

## 보이는 범위

- 크리에이터(방 주인)와 관리자: 방의 모든 메시지와 참여 인원
- 구독자: 자신과 크리에이터의 메시지만. AI 미리보기 문맥도 같은 범위로 만듦
- 크리에이터 톡: 그 대화에 참여한 크리에이터만. 관리자와 구독자는 볼 수 없음
- 다른 크리에이터의 정보: 프로필 사진과 닉네임만. 성격은 본인과 AI 미리보기(서버)만 씀

## DB 테이블

| 마이그레이션 | 내용 |
|---|---|
| `0001_bubble.sql` | 1:1 테이블 (0002에서 삭제됨) |
| `0002_bubble_rooms.sql` | `bubble_rooms`, `bubble_members`, `bubble_messages`. 크리에이터당 열린 방 1개 |
| `0003_creator_profiles.sql` | `creator_profiles.persona` (1000자 이내) |
| `0004_creator_talk.sql` | `creator_chats`, `creator_chat_members`, `creator_chat_messages`. 1:1은 `direct_key`로 하나만 |
| `0005_sicham.sql` | 시참(팀원 담당, #25). 이 저장소의 버블 쪽 파일이 아님 |
| `0006_creator_avatars.sql` | `creator_avatars` (512KB 이하 PNG·JPEG·WebP·GIF). 처음 `0005`로 적용했다가 번호를 바로잡음 |

- 실행: `npm run db:bubble` (적용하지 않은 파일만 실행, 기록은 `bubble_migrations`)
- 스키마를 바꿀 때는 새 번호 파일을 추가하고 `src/lib/schema.ts`도 맞춥니다. 공유 DB라 번호를 쓰기 전에 이슈로 알리고 `bubble_migrations`를 확인합니다. 다음 번호는 `0007`입니다.

## 환경 변수

| 이름 | 필수 | 내용 |
|---|---|---|
| `TYPESAFE_API_KEY` | 선택 | Jev 키. 비워 두면 미리보기가 꺼짐 |
| `BUBBLE_PREVIEW_MODEL` | 선택 | 기본값 `jev-latest` |

## 확인한 동작 (2026-11-11~12, Edge + Playwright, 크리에이터 1명 + 구독자 2명)

- 가입, 성격 저장, 방 열기, 목록에서 참여
- 크리에이터 메시지가 구독자에게 0.8~5.4초 안에 도착
- 미리보기 응답 HTTP 200, 3.7~4.4초 (디바운스 3초 포함). 농담 초안은 😆, 지친 초안은 🤗
- 구독자끼리 서로의 메시지가 보이지 않음
- 크리에이터 화면을 연 채로 구독자가 참여하면 5.4초 뒤 참여 인원이 바뀜
- Jev 직접 호출: 약 0.3초 (2026-11-11)

크리에이터 톡과 프로필 사진 (2026-11-12, 크리에이터 3명 + 구독자 1명)

- 크리에이터에게만 탭 2개, 목록에 본인과 구독자는 없음, 닉네임 검색(`%`도 글자 그대로)
- 폼에 구독자 id를 끼워 넣으면 "크리에이터만 초대할 수 있어요."로 거부
- 1:1 열기, 같은 상대와 다시 열면 같은 대화, 그룹(3명) 열기, 상대 화면에 2.4~3.4초 안에 도착
- 대화를 연 뒤 뒤로 링크, 브라우저 뒤로 가기, 탭 이동으로 목록에 돌아와 다른 크리에이터와 새 대화 열기
- 구독자는 `/bubble/talk`와 대화 화면에서 `/bubble`로 이동, 읽기 API 403. 참여하지 않은 크리에이터도 403
- 프로필 사진: SVG를 PNG로 바꾼 파일 거부, 512KB 초과는 저장 버튼 꺼짐, 저장 후 카드·1:1 목록·버블 목록·메시지에 표시, 로그아웃 상태 401, 카드와 페이지에 성격 없음

테스트 팁: Playwright의 브라우저 컨텍스트를 계정마다 따로 만들면 쿠키가 분리되어 한 브라우저에서 세 계정을 함께 쓸 수 있습니다.

## 남은 작업

- 실시간 전달: 브랜치 통합 때 SSE + PG LISTEN/NOTIFY로 바꿈. 쓰기는 Server Action 유지. 배포 환경 확인은 나중 (#19, `docs/planning/03-tech-stack.md` 2절)
- 읽음 표시 (#20은 닫혔지만 코드에는 없음)
- 크리에이터 답장 큐, 중요도 정렬 (#21)
- AI 미리보기 결과 캐시, 사용자별 호출 제한 (#22)
- 구독 결제 흐름이 생기면 참여 조건을 "누구나"에서 구독자로 바꿈
