// Rex homepage: one whiteboard the camera flies across as you scroll.
// A marker line leads the way: it draws itself from stop to stop with the scroll, the camera follows its tip, and each
// stop's words, arrows and cards are drawn in by the scroll too (scroll back and they come off again). Nothing is on a
// timer, so the page is exactly as far along as your scroll. Progress eases toward the scroll position every frame.
(function () {
  'use strict';

  var STOPS = [
    // w = how much of the board (px) must fit across the screen at this stop.
    { x: 700, y: 600, s: 1, r: 0, t: 14, w: 900 },
    { x: 1860, y: 660, s: 0.95, r: -3, t: 26, w: 900 },
    { x: 2520, y: 1650, s: 0.85, r: 3, t: 22, w: 980 },
    { x: 1000, y: 1600, s: 0.9, r: -2, t: 28, w: 1300 },
    { x: 1640, y: 1130, s: 0.4, r: 0, t: 30, w: 3300 }
  ];
  var LAST = STOPS.length - 1;

  var tour = document.getElementById('rex-tour');
  var vp = tour.querySelector('.vp');
  var board = document.getElementById('board');
  var icPlay = document.getElementById('ic-play');
  var icPause = document.getElementById('ic-pause');
  var toggleBtn = document.getElementById('toggle');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- the trail: one marker line through every stop
  var path = document.getElementById('trail-path');
  var pen = document.getElementById('pen');
  var LEN = path.getTotalLength();
  // where along the line each stop is reached: the line's own curve segments end at the stops
  var segEnds = (function () {
    var parts = path.getAttribute('d').trim().split(/(?=[MC])/).filter(Boolean);
    var acc = [0], tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path'), sofar = parts[0];
    for (var i = 1; i < parts.length; i++) { sofar += ' ' + parts[i]; tmp.setAttribute('d', sofar); acc.push(tmp.getTotalLength()); }
    return acc;                                          // [0, to stop 1, to stop 2, to stop 3, to the end]
  })();
  path.style.setProperty('--len', LEN.toFixed(1));

  // ---- the parts each stop draws in, in order
  var stops = [].slice.call(document.querySelectorAll('section.st[data-stop]')).map(function (sec) {
    return { n: Number(sec.getAttribute('data-stop')), parts: [].slice.call(sec.querySelectorAll('.hand, .mk, .tile, .up')) };
  });
  stops.forEach(function (s) {
    s.parts.forEach(function (el) {
      if (el.classList.contains('mk')) {
        var l = 600; try { l = el.getTotalLength(); } catch (e) {}
        el.style.strokeDasharray = l.toFixed(1); el.dataset.len = l;
      }
    });
  });

  var target = 0, p = 0, playing = false;
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(u) { return u * u * (3 - 2 * u); }
  function span() { return Math.max(1, tour.offsetHeight - vp.offsetHeight); }
  function readScroll() { target = clamp(-tour.getBoundingClientRect().top / span()) * LAST; }

  function camera() {
    var k = Math.min(LAST - 1, Math.floor(p)), f = p - k;
    var e = ease(clamp((f - 0.12) / 0.76));
    var a = STOPS[k], b = STOPS[k + 1];
    var room = vp.clientWidth - 32;
    var fit = function (st) { return Math.min(st.s, room / st.w); };
    var mix = function (m, n) { return m + (n - m) * e; };
    var dip = Math.min(a.s, b.s) > 0.5 ? 1 - 0.3 * Math.sin(Math.PI * e) : 1;
    var x = mix(a.x, b.x), y = mix(a.y, b.y), s = mix(fit(a), fit(b)) * dip, r = mix(a.r, b.r);
    var tilt = mix(a.t, b.t) + 10 * Math.sin(Math.PI * e);
    board.style.transform = 'rotateX(' + tilt.toFixed(2) + 'deg) rotate(' + r.toFixed(2) + 'deg) scale(' + s.toFixed(4) +
      ') translate(' + (-x).toFixed(1) + 'px, ' + (-y).toFixed(1) + 'px)';
    // the line is drawn as far as the camera has travelled; the marker tip rides its end
    var dist = segEnds[k] + (segEnds[k + 1] - segEnds[k]) * e;
    path.style.setProperty('--off', (LEN - dist).toFixed(1));
    var pt = path.getPointAtLength(Math.max(0.01, dist));
    pen.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
  }

  function draw() {
    stops.forEach(function (s) {
      // a stop draws in over the last stretch of the approach and is complete on arrival
      var t = reduce ? 1 : clamp((p - s.n + 0.75) / 0.7);
      var n = s.parts.length || 1;
      s.parts.forEach(function (el, i) {
        var u = clamp((t - (i / n) * 0.45) / 0.55);
        if (el.classList.contains('mk')) el.style.strokeDashoffset = (Number(el.dataset.len) * (1 - u)).toFixed(1);
        else if (el.classList.contains('hand')) el.style.clipPath = 'inset(-10% ' + ((1 - u) * 100).toFixed(1) + '% -10% 0)';
        else { el.style.opacity = u.toFixed(3); el.style.setProperty('--dy', ((1 - ease(u)) * -40).toFixed(1) + 'px'); }
      });
    });
  }

  function frame() {
    readScroll();
    var d = target - p;
    p = (Math.abs(d) < 0.0005 || reduce) ? target : p + d * 0.12;      // ease toward the scroll: smooth, never laggy
    camera(); draw();
    requestAnimationFrame(frame);
  }

  // ---- controls
  function goTo(n) {
    var k = Math.max(0, Math.min(LAST, n));
    window.scrollBy({ top: k * span() / LAST + tour.getBoundingClientRect().top, behavior: reduce ? 'auto' : 'smooth' });
  }
  function setPlaying(on) {
    playing = on; icPlay.hidden = on; icPause.hidden = !on;
    toggleBtn.setAttribute('aria-label', on ? 'Pause the tour' : 'Play the tour');
  }
  document.getElementById('prev').addEventListener('click', function () { setPlaying(false); goTo(Math.ceil(target - 0.05) - 1); });
  document.getElementById('next').addEventListener('click', function () { setPlaying(false); goTo(Math.floor(target + 0.05) + 1); });
  toggleBtn.addEventListener('click', function () {
    if (!playing && Math.round(target) >= LAST) { setPlaying(true); goTo(0); return; }
    setPlaying(!playing);
  });
  setInterval(function () {
    if (!playing) return;
    var cur = Math.round(target);
    if (cur >= LAST) { setPlaying(false); return; }
    goTo(cur + 1);
  }, 4500);
  ['wheel', 'touchstart'].forEach(function (t) {
    window.addEventListener(t, function () { if (playing) setPlaying(false); }, { passive: true });
  });
  window.addEventListener('keydown', function (e) {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'].indexOf(e.key) >= 0 && playing) setPlaying(false);
  });

  // The tour always opens at its first stop; a restored mid-tour scroll would skip the autoplay.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) window.scrollTo(0, 0);
  readScroll(); p = target; requestAnimationFrame(frame);
  if (!reduce) setTimeout(function () { if (window.scrollY < 4) setPlaying(true); }, 1200);
})();
