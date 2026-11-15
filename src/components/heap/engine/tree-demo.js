// DEMO_NOTES: 쪽지 트리의 더미 쪽지. DB 를 잇는 단계에서 이 파일째 지운다 (tree.js 의 DEMO_NOTES 참조 두 줄도).
// public/tree-mock/index.html 의 예시 데이터(synthetic)를 {id, name, date, msg, reply?, kind} 로 옮겼다. y, angle 은 없다:
// 트리가 선 뒤 tree.js 가 목업의 자리 채우기(planSpot 의 fill 순서)로 정한다.
export const DEMO_NOTES = [
  { id: 'demo-01', kind: 'gift', name: '솜사탕구름', date: '2026-12-01', msg: '메리 크리스마스!\n올해도 방송 덕분에 버텼어요', reply: '구름님 올해도 고마워요\n내년에도 같이 놀아요' },
  { id: 'demo-02', kind: 'bauble', name: '밤하늘고래', date: '2026-12-02', msg: '첫 방송 때부터 봤어요.\n그때 그 노래 또 불러 주세요!!' },
  { id: 'demo-03', kind: 'mitten', name: null, date: '2026-12-02', msg: '힘내요' },
  { id: 'demo-04', kind: 'bauble', name: '귤껍질', date: '2026-12-03', msg: '겨울엔 귤이죠 🍊 귤 먹으면서 방송 보는 게 제 낙이에요' },
  { id: 'demo-05', kind: 'gift', name: '솜사탕구름', date: '2026-12-04', msg: '또 왔어요 ㅎㅎ\n한 장으로는 모자라서' },
  { id: 'demo-06', kind: 'mitten', name: '새벽세시', date: '2026-12-04', msg: '새벽 방송 너무 좋아요. 시험 기간에 같이 깨어 있는 기분이라 덜 외로웠어요', reply: '시험 잘 봤어요?\n새벽 방송 계속할게요' },
  { id: 'demo-07', kind: 'bauble', name: '도토리묵', date: '2026-12-05', msg: 'ㅋㅋㅋㅋㅋㅋㅋ' },
  { id: 'demo-08', kind: 'gift', name: '파란우산', date: '2026-12-06', msg: '작년 겨울 합방\n다시 보고 싶어요' },
  { id: 'demo-09', kind: 'mitten', name: '밤하늘고래', date: '2026-12-07', msg: '두 번째 쪽지!\n감기 조심하세요\n목 아끼시고요' },
  { id: 'demo-10', kind: 'gift', name: '말랑콩떡', date: '2026-12-08', msg: '우리 가족 👨‍👩‍👧 다 같이 보고 있어요' },
  { id: 'demo-11', kind: 'bauble', name: '귤껍질', date: '2026-12-09', msg: '오늘 방송에서 웃다가 귤 떨어뜨림', reply: '귤 무사한가요 ㅋㅋ' },
  { id: 'demo-12', kind: 'mitten', name: null, date: '2026-12-10', msg: '이름은 비밀이지만 늘 응원하고 있어요.\n무리하지 마세요' },
  { id: 'demo-13', kind: 'bauble', name: '도토리묵', date: '2026-12-16', msg: '진지하게 써 볼게요.\n올해 이사하고 회사도 옮기느라 정신없었는데 퇴근하고 방송 켜 두면 그게 하루 중 제일 편한 시간이었어요. 정말 고마워요!!' },
  { id: 'demo-14', kind: 'gift', name: '고양이발', date: '2026-12-20', msg: '우리 집 고양이도\n방송 소리 나면\n화면 앞에 앉아요', reply: '고양이 시청자님 환영합니다 🐾' },
];
