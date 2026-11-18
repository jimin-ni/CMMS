# 힙 방 모델 라이브러리 (Blender 확인용)

힙 엔진이 실제로 짓는 방과 가구를 glTF 바이너리(`.glb`)로 내보낸 것이에요. Blender에서 `File > Import > glTF 2.0 (.glb/.gltf)`로 엽니다.
앱이 이 파일을 읽지는 않아요. 엔진에서 모양이나 크기를 확인할 때 보는 참고 자료입니다.

## 들어 있는 것

- `rooms/dname.glb`: 온보딩 C의 방(2번 방, `/room/dname`) 장면 전체.
- `rooms/lovesoo.glb`: 러브쑤 방(`/room/lovesoo`) 장면 전체.
  - 벽, 창(하늘 상자), 문, 바닥, 가구, 사진 탁자, 사진 더미, 조명 위치까지 엔진이 지은 그대로예요.
  - 가구 묶음의 이름은 `item<번호>-<종류>`입니다. 번호는 그 방 `layout.items`의 순서예요.
- `models/*.glb`: 두 방에 놓인 가구를 하나씩 원점에 놓고 내보낸 것.
  - Kenney 모델(`kitchenStove` 등)은 엔진의 크기 배율을 적용한 뒤의 모양이에요. 원본은 `public/heap/models/kenney-furniture/`에 있습니다.
  - 엔진이 코드로 짓는 가구(`shelf`, `bed`, `plant-s<크기>`, `snake`, `lamp`, `books`, `speaker`, `frame`)는 이 파일로만 볼 수 있어요.
  - `shelf`와 `books`는 방마다 내용(앨범, 책 색)이 달라요. 여기 있는 것은 러브쑤 방의 것입니다.

내보낸 날: 2026-11-18. 방은 공유 DB의 배치를 읽으므로 `public/heap/rooms/*/layout.json`과 다를 수 있어요.
Kenney 모델은 CC0입니다 (`public/heap/models/kenney-furniture/License.txt`).

## 다시 만들기

개발 서버(`npm run dev`, 3000번)에서만 됩니다. 엔진의 개발 전용 훅 `heap:dev`(`src/components/heap/engine/dev.js`)를 써요.
방을 열고 사진 더미가 다 내려앉은 뒤, 브라우저 개발자 도구의 콘솔에서 아래를 실행하면 파일이 내려받아집니다.

```js
(() => {
  const root = document.querySelector('.heap-room');
  const id = location.pathname.split('/').pop();
  const save = (name, buf) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = name; a.click(); };
  root.dispatchEvent(new CustomEvent('heap:dev', { detail: { cmd: 'export', cb: buf => save(`${id}.glb`, buf) } }));
  root.dispatchEvent(new CustomEvent('heap:dev', { detail: { cmd: 'exportItems', cb: list => list.forEach(x => save(`${x.name}.glb`, x.buf)) } }));
})();
```

같은 훅의 `cmd: 'audit'`은 같은 평면에 겹친 면(깜빡임) 목록을 돌려줍니다. 껍데기(`shell.js`)를 고친 뒤 확인할 때 써요.
