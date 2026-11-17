import "./loading-screen.css";

// 온보딩 대기 화면. 뒤에 큰 소문자 "memories", 그 위에서 덮인 책이 펼쳐졌다 덮이는 3D 로우폴리 아이콘.
// 서버에서 그릴 수 있게 상태 없이 CSS 애니메이션만 쓴다: 페이지의 Suspense 대기 화면과,
// 방(힙 엔진)이 뜨기 전까지 컨셉 C 위에 덮는 화면에 함께 쓴다.
// leaving: 준비가 끝나 사라지는 중 (투명해진 뒤 누를 수 없다)
export function LoadingScreen({ leaving = false }: { leaving?: boolean }) {
  return (
    <div className={leaving ? "ol-root leaving" : "ol-root"} role="status" aria-live="polite" aria-busy={!leaving}>
      <p className="ol-word" aria-hidden="true">
        memories
      </p>
      <div className="ol-book" aria-hidden="true">
        <div className="ol-book-3d">
          <div className="ol-shadow" />
          <div className="ol-back" />
          <div className="ol-block">
            <span className="ol-block-top" />
            <span className="ol-block-side" />
            <span className="ol-block-front" />
          </div>
          <div className="ol-leaf ol-leaf-1">
            <span className="ol-face" />
            <span className="ol-face ol-face-back" />
          </div>
          <div className="ol-leaf ol-leaf-2">
            <span className="ol-face" />
            <span className="ol-face ol-face-back" />
          </div>
          <div className="ol-cover">
            <span className="ol-face ol-cover-out">
              <i />
              <i />
            </span>
            <span className="ol-face ol-face-back ol-cover-in" />
          </div>
        </div>
      </div>
      <span className="ol-sr">Loading</span>
    </div>
  );
}
