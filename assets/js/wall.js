/* Hero panorama: the viewer looks into a slowly turning cylinder of cases.
   Four counter-rotating rings of cards curve around the title; each card cross-fades
   through its predicted states, and the whole scene leans gently with the pointer. */
(function () {
  'use strict';
  var plane = document.getElementById('wall-plane');
  if (!plane || !window.WC) return;
  var still = document.documentElement.classList.contains('still');
  var hero = plane.closest('.hero'), banner = plane.closest('.hero-banner'), stage = plane.parentNode;
  var RINGS = 4, PER_RING = 14, PITCH = 304, R = 900;      // design units; the stage is scaled to fit
  var SPEED = [150, -120, 170, -135];                       // seconds per revolution, sign = direction

  // deterministic shuffle so the panorama looks the same on every visit
  var seed = 7;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var pool = WC.wall.slice();
  for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }

  // Exclude the exercise sequence, billiards, melting ice cream and the cold-to-hot water spoon experiment from the hero wall.
  pool = pool.filter(function (frames) {
    return !/\/c(?:567|636|774|808)-/.test(frames[0]);
  });

  // Fixed placement: warehouse, digging robot greenhouse and wall art at the bottom; laundry and bear blocks one row above; mouse setup at the top.
  [[687, 3, 3], [768, 3, 4], [681, 3, 5], [632, 3, 6], [622, 2, 3], [573, 2, 4], [560, 0, 2]].forEach(function (placement) {
    var id = placement[0];
    var index = pool.findIndex(function (frames) {
      return frames[0].indexOf('/c' + id + '-') !== -1;
    });
    if (index < 0) return;
    var target = placement[1] * PER_RING + placement[2];
    var previous = pool[target]; pool[target] = pool[index]; pool[index] = previous;
  });

  var cards = [], deferred = [], rings = [];
  for (var r = 0; r < RINGS; r++) {
    var ring = document.createElement('div');
    ring.className = 'ring';
    for (var c = 0; c < PER_RING; c++) {
      var frames = pool[(r * PER_RING + c) % pool.length];
      var el = document.createElement('div');
      el.className = 'blk';
      el.style.transform = 'rotateY(' + (c * 360 / PER_RING).toFixed(2) + 'deg) translateZ(' + -R + 'px)';
      frames.forEach(function (src, n) {
        var img = document.createElement('img');
        img.alt = ''; img.decoding = 'async';
        if (n === 0) { img.src = src; img.className = 'on'; } else deferred.push([img, src]);
        el.appendChild(img);
      });
      var dots = document.createElement('span');
      dots.className = 'st';
      dots.innerHTML = frames.map(function (f, n) { return '<i' + (n ? '' : ' class="on"') + '></i>'; }).join('');
      el.appendChild(dots);
      ring.appendChild(el);
      cards.push({ el: el, imgs: el.getElementsByTagName('img'), dots: dots.children, x: c, y: r, cur: 0, shown: true });
    }
    plane.appendChild(ring);
    rings.push(ring);
  }

  var STEP = 360 / PER_RING;
  function place(now) {
    for (var r = 0; r < RINGS; r++) {
      var a = r * 97 + now / 1000 * 360 / SPEED[r];
      rings[r].style.transform = 'translateY(' + ((r - (RINGS - 1) / 2) * PITCH - 24) + 'px) rotateY(' + a.toFixed(3) + 'deg)';
      for (var c = 0; c < PER_RING; c++) {
        var card = cards[r * PER_RING + c];
        var show = Math.cos((a + c * STEP) * Math.PI / 180) > 0.12;      // only the far half faces the viewer
        if (show !== card.shown) { card.shown = show; card.el.style.visibility = show ? '' : 'hidden'; }
      }
    }
  }
  place(0);

  function fit() {
    var s = Math.max(banner.clientWidth / 1440, banner.clientHeight / 690);
    stage.style.setProperty('--fit', s.toFixed(4));
  }
  fit();
  window.addEventListener('resize', fit);

  if (still) return;
  function loadRest() {
    deferred.splice(0, 40).forEach(function (p) { p[0].src = p[1]; });
    if (deferred.length) setTimeout(loadRest, 250);
  }
  window.addEventListener('load', function () { setTimeout(loadRest, 600); });

  var PERIOD = 2800, SPREAD = 360, running = true;
  var tx = 0, ty = 0, cx = 0, cy = 0;
  function tick(now) {
    if (running) {
      for (var i = 0; i < cards.length; i++) {
        var b = cards[i], m = b.imgs.length;
        var idx = Math.floor((now - (b.x + b.y * 2.3) * SPREAD) / PERIOD) % m;
        if (idx < 0) idx += m;
        if (idx !== b.cur && b.imgs[idx].complete && b.imgs[idx].naturalWidth) {
          b.imgs[b.cur].className = ''; b.dots[b.cur].className = ''; b.imgs[idx].className = 'on'; b.dots[idx].className = 'on'; b.cur = idx;
        }
      }
      place(now);
      cx += (tx - cx) * 0.05; cy += (ty - cy) * 0.05;
      plane.style.transform = 'rotateX(' + cy.toFixed(3) + 'deg) rotateY(' + cx.toFixed(3) + 'deg)';
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  hero.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    tx = (e.clientX / window.innerWidth - 0.5) * -9;
    ty = (e.clientY / window.innerHeight - 0.5) * 5;
  });
  hero.addEventListener('pointerleave', function () { tx = ty = 0; });
  new IntersectionObserver(function (entries) { running = entries[0].isIntersecting;
  }).observe(hero);
})();
