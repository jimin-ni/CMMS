// 공식 유튜브 플레이어: 영사기 옆 플레이어와 오른쪽 위 음악 플레이어.

export function setupPlayers(ctx) {
  const { $, root, on, canvas, opts } = ctx;

  // 공식 유튜브 임베드: 평평하게, 가리는 것 없이. 이 호스트가 임베드를 막으면 링크로 바꾼다
  ctx.embedBlocked = false;
  const player = $('player'), frameBox = $('player-frame'), note = $('player-note');
  // 공식 플레이어는 한 번에 하나: 영사기와 음악 독이 이 두 함수를 나눠 쓰고, 하나가 열리면 다른 하나는 닫힌다.
  const embedSrc = ({ video, list }) => `https://www.youtube-nocookie.com/embed/${video ?? 'videoseries'}?${new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', ...(list ? { list } : {}) })}`;
  function makeFrame(src, title) {
    const f = document.createElement('iframe');
    f.src = src; f.title = title;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    return f;
  }
  function openPlayer(reel) {
    closeMusic(); // 영사기가 넘겨받는다: 유튜브 플레이어는 한 번에 하나만 재생한다
    $('player-title').textContent = reel.title || '';
    frameBox.innerHTML = '';
    note.hidden = !ctx.embedBlocked;
    if (!ctx.embedBlocked) {
      const avail = Math.max(220, root.clientHeight - 230);
      let w, h;
      if (reel.wide) { w = Math.min(root.clientWidth - 32, 720, avail * 16 / 9); h = w * 9 / 16; }
      else { h = Math.min(avail, 640); w = h * 9 / 16; }
      w = Math.max(200, Math.round(w)); h = Math.max(200, Math.round(h));
      frameBox.style.width = w + 'px'; frameBox.style.height = h + 'px';
      frameBox.appendChild(makeFrame(embedSrc({ video: reel.id, list: null }), reel.title || 'YouTube video'));
    } else { frameBox.style.width = frameBox.style.height = '0px'; }
    player.hidden = false;
  }
  function closePlayer() { frameBox.innerHTML = ''; player.hidden = true; }
  on($('player-close'), 'click', closePlayer);

  // 음악: 방 오른쪽 위에 붙는 독 플레이어, 방 이름의 반대편 (라디오, 스피커, TV 에 단 item.fn kind "music").
  // A visible official embed of 200 px or more with nothing laid over it: heap-room.css keeps the overlays and the 꾸미기 panel out of its corner (--music-w).
  // 방문자가 운반체를 누를 때만 시작한다. 브라우저가 소리 있는 영상을 틀게 해 주는 동작이 그 클릭이다.
  const dock = $('music'), dockFrame = $('music-frame'), dockNote = $('music-note'), dockLink = $('music-link');
  ctx.musicUrl = null; ctx.musicParsed = null;
  // The dock sits at the canvas's top right: 16 px from its edge, 8 px of padding, then the video. The canvas is what the 꾸미기 panel leaves of the room,
  // 그러니 영상이 쓸 수 있는 폭은 방이 아니라 캔버스에서 잰다: 둘레 16 + 8 + 8 + 16 px 가 남고, 방 이름(왼쪽 위)은 자기 폭을 지킨다.
  const musicFit = () => Math.min(380, Math.floor(canvas.clientWidth - 48 - $('cname').getBoundingClientRect().width - 16));
  function openMusic(fn) {
    const p = opts.parseMusic(fn.url); // 여기서 다시 검사한다: DB 의 레이아웃은 믿지 않는다
    if (!p || !player.hidden || (ctx.musicUrl === fn.url && !dock.hidden)) return;
    closeMusic(); ctx.musicUrl = fn.url; ctx.musicParsed = p;
    dock.hidden = false;
    if (!ctx.embedBlocked && musicFit() >= 200) dockFrame.appendChild(makeFrame(embedSrc(p), '음악 플레이어')); // only a click gets here, and only a video 200 px wide or more is embedded
    layoutMusic();
  }
  // 독을 지금의 방 크기에 맞춘다 (창 크기 변경이나 패널이 열릴 때도): 200 x 200 이 안 되는 영상은 링크로 물러서고,
  // --music-w 는 창들과 방 이름 줄이 모서리를 얼마나 비워 둬야 하는지 CSS 에 알린다.
  function layoutMusic() {
    if (dock.hidden || !ctx.musicParsed) return;
    const fit = musicFit();
    if (dockFrame.firstChild && fit >= 200) {
      dockFrame.style.width = fit + 'px'; dockFrame.style.height = Math.max(200, Math.round(fit * 9 / 16)) + 'px';
      dockNote.hidden = dockLink.hidden = true;
      root.style.setProperty('--music-w', fit + 'px');
    } else {
      dockFrame.replaceChildren(); dockFrame.style.width = dockFrame.style.height = '0px';
      dockNote.hidden = dockLink.hidden = false; dockLink.href = ctx.musicUrl;
      const w = Math.max(120, Math.min(300, fit));
      dockNote.style.maxWidth = w + 'px'; root.style.setProperty('--music-w', w + 'px');
    }
  }
  function closeMusic() { dockFrame.replaceChildren(); dock.hidden = true; ctx.musicUrl = null; ctx.musicParsed = null; root.style.removeProperty('--music-w'); }
  on($('music-close'), 'click', closeMusic);
  on(document, 'securitypolicyviolation', e => {
    if (!/youtube/.test(e.blockedURI || '')) return;
    ctx.embedBlocked = true;
    if (!player.hidden) { frameBox.innerHTML = ''; frameBox.style.width = frameBox.style.height = '0px'; note.hidden = false; }
    if (!dock.hidden) { dockFrame.replaceChildren(); layoutMusic(); }
  });

  Object.assign(ctx, { closeMusic, openPlayer, closePlayer, openMusic, player, layoutMusic });
}
