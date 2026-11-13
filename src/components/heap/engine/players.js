// 공식 플레이어: 영사기 옆 플레이어(유튜브·인스타그램·틱톡·X)와 오른쪽 위 음악 플레이어(유튜브).
// 플랫폼이 주는 임베드 주소만 쓴다. 내려받기, 재호스팅, 스트림 추출은 하지 않는다.

import { platformOf } from './format.js';

export function setupPlayers(ctx) {
  const { $, root, on, canvas, opts } = ctx;

  // 공식 유튜브 임베드: 평평하게, 가리는 것 없이. 이 호스트가 임베드를 막으면 링크로 바꾼다
  ctx.embedBlocked = false;
  const player = $('player'), frameBox = $('player-frame'), note = $('player-note');
  // 공식 플레이어는 한 번에 하나: 영사기와 음악 독이 이 두 함수를 나눠 쓰고, 하나가 열리면 다른 하나는 닫힌다.
  const embedSrc = ({ video, list }) => `https://www.youtube-nocookie.com/embed/${video ?? 'videoseries'}?${new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', ...(list ? { list } : {}) })}`;
  // 남의 집 플레이어라서 틀을 가둔다. allow-top-navigation 을 주지 않으므로 임베드가 우리 쪽 주소를 바꿔치기할 수 없다 (codex).
  // allow-popups 는 "앱에서 보기", 게시물 링크처럼 플레이어가 새 창을 여는 데 필요하다.
  const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation';
  function makeFrame(src, title, allow) {
    const f = document.createElement('iframe');
    f.src = src; f.title = title;
    f.allow = allow ?? 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.setAttribute('sandbox', SANDBOX);
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    return f;
  }

  // 카드 하나를 여는 공식 임베드. src 는 플랫폼이 쓰라고 한 주소 그대로이고, ratio 는 틀의 가로/세로다.
  //   youtube    youtube-nocookie 임베드 (지금까지와 같다)
  //   instagram  게시물의 공식 임베드 쪽. 릴스도 /p/<코드> 로 열린다. 자동 재생은 없다 (방문자가 누른다)
  //   tiktok     틱톡 임베드 플레이어. oEmbed(https://www.tiktok.com/oembed?url=…)가 돌려주는 주소·변수 그대로다 (325 x 578, 소리 없이 시작)
  //   x          게시물 임베드. 추적을 끈다 (dnt)
  const EMBED = {
    youtube: r => ({ src: embedSrc({ video: r.id, list: null }), ratio: r.wide ? 16 / 9 : 9 / 16, max: r.wide ? 720 : 420 }),
    instagram: r => ({
      src: `https://www.instagram.com/p/${encodeURIComponent(r.id)}/embed/captioned/`,
      ratio: 400 / 680, max: 400, allow: 'encrypted-media; picture-in-picture; fullscreen',
    }),
    tiktok: r => ({
      src: `https://www.tiktok.com/player/v1/${encodeURIComponent(r.id)}?embed_from=oembed&music_info=1&description=1&autoplay=1&muted=1`,
      ratio: 325 / 578, max: 360,
      // 재생에 필요한 것만 준다: 복사, 공유, 기울기 센서는 뺐다 (codex)
      allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture',
    }),
    x: r => ({
      src: `https://platform.twitter.com/embed/Tweet.html?id=${encodeURIComponent(r.id)}&dnt=true`,
      ratio: 550 / 620, max: 550, allow: 'encrypted-media; fullscreen',
    }),
  };
  function openPlayer(reel) {
    closeMusic(); // 영사기가 넘겨받는다: 플레이어는 한 번에 하나만 재생한다
    $('player-title').textContent = reel.title || '';
    frameBox.innerHTML = '';
    note.hidden = !ctx.embedBlocked;
    if (!ctx.embedBlocked) {
      const platform = platformOf(reel);
      const spec = (EMBED[platform] || EMBED.youtube)(reel);
      const avail = Math.max(220, root.clientHeight - 230);
      // 틀은 ratio(가로/세로)를 지키며 방에 맞게 줄어든다. 가로가 먼저 걸리면 세로를 따라 줄인다.
      let w = Math.min(root.clientWidth - 32, spec.max, avail * spec.ratio);
      let h = w / spec.ratio;
      w = Math.max(200, Math.round(w)); h = Math.max(200, Math.round(h));
      frameBox.style.width = w + 'px'; frameBox.style.height = h + 'px';
      frameBox.appendChild(makeFrame(spec.src, reel.title || PLAYER_TITLE[platform] || '영상', spec.allow));
    } else { frameBox.style.width = frameBox.style.height = '0px'; }
    player.hidden = false;
  }
  const PLAYER_TITLE = { youtube: 'YouTube 영상', instagram: 'Instagram 게시물', tiktok: 'TikTok 영상', x: 'X 게시물' };
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
  // 이 호스트가 임베드를 막으면(CSP) 틀을 거두고 원본 링크로 물러선다. 임베드를 쓰는 모든 플랫폼을 함께 본다.
  const EMBED_HOST = /youtube|instagram|tiktok|twitter|x\.com/;
  on(document, 'securitypolicyviolation', e => {
    if (!EMBED_HOST.test(e.blockedURI || '')) return;
    ctx.embedBlocked = true;
    if (!player.hidden) { frameBox.innerHTML = ''; frameBox.style.width = frameBox.style.height = '0px'; note.hidden = false; }
    if (!dock.hidden) { dockFrame.replaceChildren(); layoutMusic(); }
  });

  Object.assign(ctx, { closeMusic, openPlayer, closePlayer, openMusic, player, layoutMusic });
}
