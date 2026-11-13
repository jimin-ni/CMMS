// 공식 유튜브 플레이어: 영사기 옆 플레이어와 오른쪽 위 음악 플레이어.

export function setupPlayers(ctx) {
  const { $, root, on, canvas, opts } = ctx;

  // official YouTube embed, flat and unobstructed; if this host forbids embeds, fall back to the link out
  ctx.embedBlocked = false;
  const player = $('player'), frameBox = $('player-frame'), note = $('player-note');
  // One official player at a time: the projector's and the music dock's share these two helpers, and opening either closes the other.
  const embedSrc = ({ video, list }) => `https://www.youtube-nocookie.com/embed/${video ?? 'videoseries'}?${new URLSearchParams({ autoplay: '1', playsinline: '1', rel: '0', ...(list ? { list } : {}) })}`;
  function makeFrame(src, title) {
    const f = document.createElement('iframe');
    f.src = src; f.title = title;
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    return f;
  }
  function openPlayer(reel) {
    closeMusic(); // the projector takes over: only one YouTube player plays at a time
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

  // music: the docked player at the room's top right, opposite the room name (item.fn kind "music" on a radio, speaker or TV).
  // A visible official embed of 200 px or more with nothing laid over it: heap-room.css keeps the overlays and the 꾸미기 panel out of its corner (--music-w).
  // It starts only from the visitor's click on the carrier, which is the gesture the browser wants before it lets a video play with sound.
  const dock = $('music'), dockFrame = $('music-frame'), dockNote = $('music-note'), dockLink = $('music-link');
  ctx.musicUrl = null; ctx.musicParsed = null;
  // The dock sits at the canvas's top right: 16 px from its edge, 8 px of padding, then the video. The canvas is what the 꾸미기 panel leaves of the room,
  // so the width the video may take is measured from it (not from the room): 16 + 8 + 8 + 16 px of room around it, and the room's name (top left) keeps its own width.
  const musicFit = () => Math.min(380, Math.floor(canvas.clientWidth - 48 - $('cname').getBoundingClientRect().width - 16));
  function openMusic(fn) {
    const p = opts.parseMusic(fn.url); // checked again here: the layout in the database is not trusted
    if (!p || !player.hidden || (ctx.musicUrl === fn.url && !dock.hidden)) return;
    closeMusic(); ctx.musicUrl = fn.url; ctx.musicParsed = p;
    dock.hidden = false;
    if (!ctx.embedBlocked && musicFit() >= 200) dockFrame.appendChild(makeFrame(embedSrc(p), '음악 플레이어')); // only a click gets here, and only a video 200 px wide or more is embedded
    layoutMusic();
  }
  // Sizes the dock to the room as it is now (also after a resize or the panel opening): a video that no longer fits 200 x 200 gives way to a link out,
  // and --music-w tells the CSS how much of the corner the overlays and the room-name line must leave free.
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
