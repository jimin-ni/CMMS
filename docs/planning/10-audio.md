# 10. 배경음악·효과음 출처와 라이선스

작성: 2026-11-18. 고침: 2026-11-24 (배경음악 삭제, 걷기 효과음 적용, 영사기 효과음 저장소에서 뺌). 후보 목록은 팀 문서 "공모전 배경음악·효과음 출처 목록"(2026-11-18)을 기준으로 했습니다.

## 1. 공모전 규정 대조

출처: https://extriver.com/event1/ (2026-11-18 브라우저로 렌더링해 확인. "Read the official rules" 링크는 아직 비어 있음)

| 항목 | 원문 | CMMS에 주는 의미 |
|---|---|---|
| 음원 저작권 | "Do not use third-party trademarks, copyrighted music, or footage without permission." | [사실] 라이선스로 허락받은 음원만 씁니다. 라이선스 불명 파일은 넣지 않습니다 |
| 합법적 콘텐츠 사용 | "Technical feasibility, basic security, lawful use of content, and product stability are considered in the commercialization eligibility review." | [사실] 상용화 심사에서 콘텐츠 적법성을 봅니다. 수상 후 수익 배분(상업 이용)이 전제이므로 상업 이용 가능한 라이선스만 씁니다 |
| 저장소 제출 | "A GitHub repository with all source code, assets, and instructions needed to run the project. Public with an open-source license, or private and shared with the Extriver team." | [사실] 음원 파일도 저장소에 들어가야 합니다. 현재 저장소는 공개(PUBLIC)입니다. §3 참고 |
| AI 생성 콘텐츠 고지 | 공개된 페이지에 관련 조항 없음 | [미정] 공식 규정이 아직 공개되지 않았습니다. 공개되면 다시 확인합니다. BudgetPixel 곡은 AI 생성 음원입니다 |
| 지식재산권 | "Eligibility, schedule, detailed revenue-share terms, intellectual property, and commercialization contract conditions will be finalized in the official competition rules." | [미정] 공식 규정 공개 후 확인 |

## 2. 라이선스 요약

각 페이지는 2026-11-18에 확인했습니다. 법적 효력은 원문에 있습니다.

| 라이선스 | 상업 이용 | 출처 표기 | 공개 저장소에 원본 파일 포함 | 원문 |
|---|---|---|---|---|
| CC0 1.0 (Freesound, OpenGameArt) | 가능 | 불필요 | 가능 | https://creativecommons.org/publicdomain/zero/1.0/ |
| CC BY 4.0 (BudgetPixel 라이브러리) | 가능 | 필요. "BudgetPixel AI" 표기 | 가능. 출처 표기와 라이선스를 함께 전달 ("You may pass the files on, as long as the credit and the licence go with them.") | https://budgetpixel.com/audio-license |
| Mixkit Free License | 가능 | 불필요 | 위험. 이용약관 9.4가 아이템을 제3자에게 제공(make available)하는 것을 금지 | https://mixkit.co/license/ , https://mixkit.co/terms/ |
| Pixabay Content License | 가능 | 불필요 | 위험. 가공 없이 원본 형태로 배포(Standalone)하는 것을 금지 | https://pixabay.com/service/license-summary/ |

- [사실] BudgetPixel은 2026-09-23부터 라이브러리를 CC BY 4.0으로 바꿨습니다. 그 전에 받은 파일만 표기 불필요 조건입니다. 그래서 "표기 불필요" 문구와 CC BY 문구가 함께 보였습니다. 이후에 받은 파일은 모두 표기가 필요합니다.
- [사실] BudgetPixel은 라이브러리 음원을 Content ID에 등록하지 않는다고 밝힙니다.
- [사실] BudgetPixel에 로그인해 직접 생성한 음원은 요금제별로 상업 이용 범위가 다릅니다(무료 플랜은 비상업). 라이브러리 곡만 씁니다.
- [미정] Mixkit의 음원 종류별 라이선스 전문(Sound Effects Free License, Stock Music Free License)은 팝업으로만 열려 원문 문구를 받지 못했습니다. 위 판단은 이용약관(mixkit.co/terms)과 요약 페이지 기준입니다.

## 3. 공개 저장소 문제 [결정] (2026-11-18)

공모전은 음원을 포함한 전체 자산을 저장소에 넣으라고 합니다. Mixkit과 Pixabay 원본 파일을 공개 저장소에 그대로 올리면 두 사이트가 금지하는 원본 배포에 해당할 수 있습니다. 검토한 선택지는 다음과 같습니다.

1. 저장소를 비공개로 바꾸고 Extriver 팀과 공유한다 (공모전 규정이 허용).
2. Mixkit·Pixabay 파일은 저장소에서 빼고, CC0·CC BY 음원만 넣는다. **← 채택**
3. 공개 저장소를 유지하되 Mixkit·Pixabay 음원은 대체 음원(CC0 또는 CC BY)으로 바꾼다.

운영 방법:

- 파일 이름에 출처를 넣습니다(`-mixkit-`, `-pixabay-`). `.gitignore`가 `public/audio/` 아래의 이 두 이름을 커밋에서 뺍니다.
- 이 파일들은 각자 로컬에서만 씁니다. 저장소와 Render 배포본에는 들어가지 않으므로, 앱 코드는 파일이 없어도 오류 없이 넘어가야 합니다.
- 배포본에서도 소리가 나야 하는 항목은 CC0 또는 CC BY 음원으로 바꿉니다.

## 4. 받은 파일

경로는 `public/audio/` 기준입니다.

| 파일 | 항목 | 원본 | 길이 | 라이선스 | 출처 표기 | 커밋 |
|---|---|---|---|---|---|---|
| ~~`bgm/bgm-warm-retro-soul-backbeat-budgetpixel.mp3`~~ | 배경음악 1 (방의 기본 배경음악). 2026-11-24 지움 | [Warm Retro Soul Backbeat](https://budgetpixel.com/background-music/warm-retro-soul-backbeat-13196076) | 45.1초 | CC BY 4.0 | 필요 | 지움 |
| `sfx/floor-walk-freesound-543685.mp3` | 마룻바닥 걷기 1 (방의 발소리로 씀) | [Freesound 543685](https://freesound.org/s/543685/) (미리듣기 MP3) | 0:24 | CC0 | 불필요 | 함 |
| `sfx/floor-creak-freesound-347851.mp3` | 마룻바닥 걷기 2 | [Freesound 347851](https://freesound.org/s/347851/) (미리듣기 MP3) | 약 1:21 | CC0 | 불필요 | 함 |
| `sfx/floor-walk-oga-83765.wav` | 마룻바닥 걷기 3 | [OpenGameArt: Steps in wood floor](https://opengameart.org/node/83765) | 약 3.5초 | CC0 | 불필요 | 함 |
| `sfx/projector-start-stop-mixkit-3013.mp3` | 영사기 켜기 1 | Mixkit 3013 (Bell & Howell start/stop) | 0:29 | Mixkit Free | 불필요 | 안 함 (§3) |
| `sfx/projector-working-mixkit-1441.mp3` | 영사기 켜기 2 | Mixkit 1441 (Vintage film projector working) | 0:24 | Mixkit Free | 불필요 | 안 함 (§3) |
| `sfx/projector-hum-mixkit-1443.mp3` | 영사기 켜기 3 | Mixkit 1443 (Antique movie projector hum) | 0:30 | Mixkit Free | 불필요 | 안 함 (§3) |
| `bgm/carol-christmas-lullaby-mixkit-985.mp3` | 잔잔한 캐롤 1 (쪽지 트리 모드 배경음악이었음. 지금은 쓰지 않고 로컬에 둠) | Mixkit 985 (Christmas Lullaby, Michael Ramir C.) | 1:46 | Mixkit Free | 불필요 | 안 함 (§3) |
| `sfx/walk01.mp3` | `floor-walk-freesound-543685.mp3`와 같은 파일 (내용이 같음) | Freesound 543685 | 약 22초 | CC0 | 불필요 | 함 |
| `sfx/walk-carpet01.wav` | `floor-walk-oga-83765.wav`와 같은 파일. 이름은 카펫이지만 나무 바닥 소리 | OpenGameArt 83765 | 약 3.5초 | CC0 | 불필요 | 함 |
| `sfx/projector01.mp3` ~ `projector03.mp3` | 영사기 소리 | [미정] 출처 모름. 길이가 위 Mixkit 영사기 파일(24~30초)과 다름 | 약 61~67초 | [미정] | [미정] | 2026-11-18에 커밋됐다가 2026-11-24에 뺌 |

Freesound 원본 파일(WAV 등)은 로그인해야 받을 수 있어 미리듣기 MP3(128kbps)를 받았습니다. 음질이 부족하면 로그인 후 원본으로 바꿉니다.

A Christmas Carol(Mixkit 896)은 2026-11-18에 쓰지 않기로 하고 지웠습니다.

- [결정] (2026-11-24) 영사기 파일 3개는 출처를 모릅니다. 공개 저장소에서 빼고(`git rm --cached`), `.gitignore`에 넣어 각자 로컬에만 둡니다. 예전 커밋 기록에는 남아 있습니다. 출처와 라이선스를 확인하면 다시 넣거나 CC0 음원으로 바꿉니다.
- `walk01.mp3`와 `walk-carpet01.wav`는 다른 파일과 내용이 같아 쓰지 않습니다.

### 배경음악 삭제 [결정] (2026-11-24)

- 방 배경음악(`room-bgm.tsx`)과 기본 곡 파일, 설정의 소리 크기(재생 영상, 배경음악, 효과음)를 지웠습니다. 예전에 저장된 소리 크기 값은 읽을 때 버립니다.
- 캐롤 파일은 로컬에 그대로 둡니다. 지금은 어디에서도 틀지 않습니다.

### 쓰는 곳: 걷기 효과음 (`src/components/heap/engine/sfx.js`)

- 내 캐릭터가 방 모드에서 걷는 동안 `floor-walk-freesound-543685.mp3`를 반복 재생하고, 멈추면 0.06초 안에 줄여 끕니다. 1.5초 이상 서 있으면 오디오를 멈춰 둡니다. 다른 사람 캐릭터의 발소리는 내지 않습니다.
- 러그 위에서는 같은 소리를 저역 필터(500Hz)로 먹먹하게 냅니다. 러그는 카탈로그의 `rug` 가구와 좌식 탁자에 딸린 러그입니다. 카펫 발소리 음원을 받으면 그 파일로 바꿉니다(§5).
- 브라우저는 사용자 동작 전에 소리를 막으므로, 방에서 첫 클릭이나 키 입력 때 파일을 받아 오디오를 켭니다. 파일이 없으면 소리 없이 걷습니다.
- 소리 크기 설정은 없습니다. 값은 `sfx.js`의 `LEVEL`에서 바꿉니다.

## 5. 받지 못한 파일

| 항목 | 이유 | 다음 할 일 |
|---|---|---|
| Pixabay 곡과 효과음 (배경음악 4·5, 동물의 숲 감성 2곡, 버튼 클릭 3개, 방 문 열기 3개) | 사이트가 자동 접속을 막음 | 브라우저에서 직접 받기. 파일 이름에 `-pixabay-`를 넣어 커밋에서 빼기 (§3) |
| BudgetPixel: Dusty Porch Memories, "lofi, nostalgic, mellow, warm, piano, wobbly", Christmas Morning Warmth | 라이브러리에서 같은 이름의 곡을 찾지 못함 | 원래 곡 주소 확인. 비슷한 곡: [Nostalgic Tape Lofi Piano](https://budgetpixel.com/background-music/nostalgic-tape-lofi-piano-985a8df4), [Fireside Lofi Christmas](https://budgetpixel.com/background-music/fireside-lofi-christmas-fc1dfad4) |
| ElevenLabs Book page turning | 로그인 필요. 무료 플랜 조건 미확인 | 무료 플랜 상업 이용 조건 확인 후 받기 |
| 카펫 걷기, 책장에서 책 꺼내기 | 무료 음원 없음. 카펫은 지금 마룻바닥 발소리에 저역 필터를 걸어 대신함 | Freesound에서 CC0 필터로 재검색 |
| 영사기 소리 (출처가 확인된 것) | `projector01~03.mp3`의 출처를 모름 (§4) | 출처 확인 또는 CC0 음원 찾기 |
| 방 문 열기 3번 (Bedroom Door Opens 1) | 파일별 라이선스 미확인 | Pixabay 파일 페이지에서 확인 |

## 6. 출처 표기 (앱 크레딧 화면용)

CC BY 4.0 음원은 앱 안의 크레딧(예: 설정 또는 마이페이지 하단)에 아래 문구를 그대로 넣습니다. 2026-11-24에 아래 곡을 지워서, 지금은 넣을 문구가 없습니다. 다시 쓰면 넣습니다.

- (지움) "Warm Retro Soul Backbeat" by BudgetPixel AI (https://budgetpixel.com/background-music/warm-retro-soul-backbeat-13196076) — CC BY 4.0
