/* WorldCast project page */
(function () {
  'use strict';

  // Fill these in when the resources go public; empty links render as "Soon".
  var LINKS = {
    paper: 'https://arxiv.org/abs/2610.20731',
    code: 'https://github.com/teal024/WorldCast',
    benchmark: 'https://huggingface.co/datasets/wenhaoyan77/WorldCast'
  };

  var root = document.documentElement;
  var still = root.classList.contains('still');
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  var MODELS = {};
  WC.models.forEach(function (m) { MODELS[m.name] = m; });
  var CASES = {};
  WC.cases.forEach(function (c) { CASES[c.id] = c; });
  var overall = function (name) { return MODELS[name] ? MODELS[name].scores[10] : 0; };
  var byStrength = function (a, b) { return overall(b.model) - overall(a.model); };
  var shuffle = function (a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

  var ICON = {
    ok: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17.2v.1"/></svg>',
    no: '<svg viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></svg>',
    open: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>'
  };

  /* ------------------------------------------------------------ links, nav */
  $$('[data-link]').forEach(function (a) {
    var url = LINKS[a.dataset.link];
    if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; return; }
    a.setAttribute('aria-disabled', 'true');
    a.title = 'Coming soon';
    a.insertAdjacentHTML('beforeend', '<span class="soon">Soon</span>');
    a.addEventListener('click', function (e) { e.preventDefault(); });
  });

  var nav = $('#nav'), banner = $('.hero-banner');
  var onScroll = function () { nav.classList.toggle('solid', window.scrollY > banner.offsetHeight - 80); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  var menu = $('#nav-menu'), toggle = $('.nav-toggle');
  toggle.addEventListener('click', function () {
    var open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }); });
  var navLinks = {};
  $$('a', menu).forEach(function (a) { navLinks[a.getAttribute('href').slice(1)] = a; });
  var alias = { example: 'overview', bibtex: 'evaluation' };
  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      $$('a', menu).forEach(function (a) { a.classList.remove('active'); });
      var id = alias[e.target.id] || e.target.id;
      if (navLinks[id]) navLinks[id].classList.add('active');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main > .section').forEach(function (s) { spy.observe(s); });

  /* ------------------------------------------------------------ reveal & counters */
  var revealObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      revealObs.unobserve(e.target);
      $$('.num[data-count]', e.target).forEach(countUp);
      if (e.target.onReveal) e.target.onReveal();
    });
  }, { rootMargin: '0px 0px -12% 0px' });
  function observeReveal(el) { if (root.classList.contains('motion')) revealObs.observe(el); else { el.classList.add('in'); if (el.onReveal) el.onReveal(); } }
  function countUp(el) {
    if (still) return;
    var target = +el.dataset.count, t0 = performance.now(), dur = 1400;
    (function step(now) {
      var p = Math.min(1, (now - t0) / dur), v = Math.round(target * (1 - Math.pow(1 - p, 4)));
      el.textContent = v.toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  }

  /* ------------------------------------------------------------ media helpers */
  var small = function (f) { return f + '-s.webp'; };
  var full = function (f) { return f + '.webp'; };
  var aspect = function (o) { return Math.max(0.56, Math.min(1.8, o.w / o.h)).toFixed(3); };
  var level = function (c) { return '<span class="tag ' + c.level.toLowerCase() + '">' + c.level + '</span>'; };
  function logo(name) { var m = MODELS[name]; return m ? '<img class="logo" src="' + m.logo + '" alt="" width="26" height="26">' : ''; }
  function gifHTML(o, lazy) {
    return '<div class="gif" style="--ar:' + aspect(o) + '"><img src="' + o.gif + '" alt="' + esc(o.model) + ', animated output sequence"' + (lazy ? ' loading="lazy"' : '') + ' decoding="async"><span class="badge">GIF</span></div>';
  }
  function framesHTML(o, marks) {
    return o.frames.map(function (f, k) {
      var mark = marks && marks[k];
      return '<button class="fr zoomable" type="button" style="--ar:' + aspect(o) + '" data-full="' + full(f) + '" aria-label="Enlarge ' + esc(o.model) + ' state ' + (k + 1) + '"><img src="' + small(f) + '" alt="' + esc(o.model) + ', state ' + (k + 1) + '" loading="lazy" decoding="async"><span>' + (k + 1) + '</span>' +
        (mark ? '<span class="mark ' + mark + '">' + ICON[mark] + '</span>' : '') + '</button>';
    }).join('');
  }
  // a GIF of the whole sequence, followed by every individual state
  function seqRowHTML(o, marks) {
    return '<div class="seqrow' + (o.frames.length > 4 ? ' six' : '') + '" style="--n:' + o.frames.length + ';--ar:' + aspect(o) + '">' + gifHTML(o, true) + framesHTML(o, marks) + '</div>';
  }
  function stripHTML(o) { return '<div class="strip" style="--n:' + o.frames.length + '">' + framesHTML(o) + '</div>'; }
  function inputsHTML(c) {
    return '<div class="inputs">' + c.inputs.map(function (im, k) {
      return '<figure><button class="zoomable" type="button" data-full="' + im.src + '" aria-label="Enlarge input image ' + (k + 1) + '"><img src="' + im.thumb + '" alt="Input image ' + (k + 1) + '" loading="lazy"></button><figcaption>Image ' + (k + 1) + '</figcaption></figure>';
    }).join('') + '</div>';
  }

  /* ------------------------------------------------------------ lightbox */
  var lb = $('#lightbox'), lbImg = $('#lightbox-img');
  document.addEventListener('click', function (e) {
    var z = e.target.closest('.zoomable[data-full]');
    if (!z) return;
    e.preventDefault();
    lbImg.src = z.dataset.full;
    var inner = $('img', z);
    lbImg.alt = inner ? inner.alt : '';
    lb.showModal();
  });
  $('.lb-close', lb).addEventListener('click', function () { lb.close(); });
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target === lbImg) lb.close(); });
  lb.addEventListener('close', function () { lbImg.removeAttribute('src'); });

  /* ------------------------------------------------------------ layered figures: play once when scrolled into view */
  function layeredFigure(box, data, dir, delay, replay) {
    if (!box || !data) return;
    box.style.setProperty('--ar', data.aspect);
    box.innerHTML = '<div class="anim-stage">' + data.layers.map(function (L) {
      return '<img class="k-' + L.kind + '" src="assets/media/' + dir + '/' + L.id + '.webp" alt="" decoding="async" style="left:' + L.x + '%;top:' + L.y + '%;width:' + L.w + '%;height:' + L.h + '%;--d:' + delay(L).toFixed(2) + 's">';
    }).join('') + '</div>';
    if (still) { box.classList.add('play'); return; }
    var stage = $('.anim-stage', box), imgs = $$('img', box), timers = [];
    // camera zoom onto a group of layers: fit their bounding box into ~88% of the frame, capped at data.zoomMax
    function zoomTo(ids) {
      box.classList.toggle('zooming', !!ids);
      imgs.forEach(function (img, k) { img.classList.toggle('zf', !!ids && ids.indexOf(data.layers[k].id) >= 0); });
      if (!ids) { stage.style.transform = ''; return; }
      var ls = data.layers.filter(function (L) { return ids.indexOf(L.id) >= 0; });
      var x0 = Math.min.apply(null, ls.map(function (L) { return L.x; })), y0 = Math.min.apply(null, ls.map(function (L) { return L.y; }));
      var x1 = Math.max.apply(null, ls.map(function (L) { return L.x + L.w; })), y1 = Math.max.apply(null, ls.map(function (L) { return L.y + L.h; }));
      var s = Math.min(88 / (x1 - x0), 88 / (y1 - y0), data.zoomMax || 2);
      var clamp = function (v) { return Math.max(100 - 100 * s, Math.min(0, v)); };
      var tx = clamp(50 - (x0 + x1) / 2 * s), ty = clamp(50 - (y0 + y1) / 2 * s);
      stage.style.transform = 'translate(' + tx.toFixed(2) + '%,' + ty.toFixed(2) + '%) scale(' + s.toFixed(3) + ')';
    }
    function play() {
      timers.forEach(clearTimeout); timers = [];
      zoomTo(null);
      box.classList.remove('play'); void box.offsetWidth; box.classList.add('play');
      (data.zooms || []).forEach(function (z) {
        timers.push(setTimeout(function () { zoomTo(z.layers); }, z.t0 * 1000));
        timers.push(setTimeout(function () { zoomTo(null); }, z.t1 * 1000));
      });
    }
    var started = false;
    new IntersectionObserver(function (en, io) {
      if (!en[0].isIntersecting || started) return;
      started = true; io.disconnect();
      (function wait() { if (imgs.every(function (i) { return i.complete; })) play(); else setTimeout(wait, 120); })();
    }, { threshold: 0.35 }).observe(box);
    replay.addEventListener('click', play);
  }

  // Figure 1: grow the tree level by level, then reveal the benchmark panel
  (function () {
    var group = function (id) { var m = /^l(\d)-/.exec(id); return m ? +m[1] : 0; };
    var LEVEL_T = { 1: 0.75, 2: 1.25, 3: 1.85, 4: 2.5 };
    var count = { 1: 0, 2: 0, 3: 0, 4: 0 };
    var FIXED = { wall: 0, 'left-panel': 0.25, tree: 0.45, 'sep-l1': 0.9, 'sep-l2': 1.5, 'sep-l3': 2.1, 'arrows-23': 1.75, 'arrows-34': 2.45,
      bracket: 3.2, title: 3.45, card: 3.75, 'index-title': 3.95, ring: 4.0, 'ring-text': 4.95 };
    layeredFigure($('#fig1'), window.FIG1, 'fig1', function (L) {
      if (L.id in FIXED) return FIXED[L.id];
      if (group(L.id)) { var g = group(L.id); return LEVEL_T[g] + 0.07 * count[g]++; }
      var r = /^row(\d)-(\w+)/.exec(L.id), n = +r[1];
      return 4.2 + n * 0.16 + (r[2] === 'bar' ? 0.1 : r[2] === 'score' ? 0.9 : 0);
    }, $('#fig1-replay'));
  })();

  // Figure 8: the agent's trajectory; start times come from tools/build_fig8.py
  layeredFigure($('#fig8'), window.FIG8, 'fig8', function (L) { return L.d; }, $('#fig8-replay'));

  /* ------------------------------------------------------------ task example (Figure 2) */
  (function () {
    var c = CASES.C01, el = $('#duel');
    if (!c) return;
    var runs = [
      { model: 'GPT-Image-2.5', cfg: 'Sunburst w/ GPT-6 Astra · interleaved', marks: { 3: 'warn' }, verdicts: [['ok', 'All milestones finished'], ['warn', 'Step 4: top antenna missing']] },
      { model: 'Wan 3.0', cfg: 'video · agent-selected keyframes', marks: { 2: 'no' }, verdicts: [['no', 'Step 3: arms not installed'], ['warn', 'Arms inconsistency']] }
    ];
    el.innerHTML = '<div class="duel-q"><span class="tag l4">L4 · In-Context Procedural Learning</span><p>' + esc(c.prompt) + '</p>' + inputsHTML(c) + '</div>' +
      '<div class="duel-runs">' + runs.map(function (r) {
        var o = c.outputs.filter(function (x) { return x.model === r.model; })[0];
        return '<div class="run"><div class="run-head">' + logo(r.model) + '<div><h3>' + esc(r.model) + '</h3><span class="cfg">' + esc(r.cfg) + '</span></div><div class="verdicts">' +
          r.verdicts.map(function (v) { return '<span class="verdict ' + v[0] + '">' + ICON[v[0]] + v[1] + '</span>'; }).join('') + '</div></div>' + seqRowHTML(o, r.marks) + '</div>';
      }).join('') + '</div>';
  })();

  /* ------------------------------------------------------------ task categories */
  var CATS = [
    ['Observation-Conditioned Transitions', 'L3', 57, 'Execution and rendering require observing the initial world rather than simply moving around. Step-level instructions force the model to ground each action in the observed world.'],
    ['Physical Simulation', 'L3', 61, 'Models should depict how an event unfolds from the initial state according to physical laws or real-world dynamics, connecting observations with physical knowledge.'],
    ['Adaptive Task Completion', 'L3', 55, 'Models must decompose the goal without step-level instructions, infer feasible intermediate actions, and ground their plans in the changing visual state.'],
    ['Physical Properties', 'L4', 28, 'Observations may include material properties and object states without fully verbalizing them. The model must infer the operative property, bind it to the correct entities, and carry its consequences through a new multi-state simulation.'],
    ['Visual Cues', 'L4', 28, 'Text alone is sometimes insufficient to specify location or transitions. Direct or indirect visual cues combined with text instructions indicate where or how the world should change.'],
    ['In-Context Procedural Learning', 'L4', 28, 'Text and images describe prior experience in the form of an illustrated procedure. The model must identify the function of each step, abstract the procedure from its original scene, and transfer it to a new world rather than imitate the examples superficially.'],
    ['Logic and Rules', 'L4', 35, 'Several historical states and textual cues jointly define a transition rule. The model must combine textual reasoning with visual rules, induce the operation for successive states and render it consistently.'],
    ['Visual Goal Realization', 'L4', 28, 'The desired outcome is specified visually, either as a final state or hints of the final state. The model must identify the goal semantics, plan how to achieve the final state, and synthesize the intervening steps.']
  ];
  var casesOf = function (cat) {
    return WC.cases.filter(function (c) { return c.category === cat; }).sort(function (a, b) { return (b.featured - a.featured) || a.id.localeCompare(b.id); });
  };

  (function () {
    var list = $('#task-list'), panel = $('#task-panel');
    var state = { cat: 0, ex: 0, model: null };
    var html = '';
    ['L3', 'L4'].forEach(function (lv) {
      html += '<p class="task-group">' + lv + '</p>';
      CATS.forEach(function (cat, k) {
        if (cat[1] !== lv) return;
        html += '<button class="task-tab" role="tab" type="button" data-k="' + k + '" data-level="' + lv + '" aria-selected="false" aria-controls="task-panel"><span class="tdot"></span>' + cat[0] + '<span class="tn">' + cat[2] + '</span></button>';
      });
    });
    list.innerHTML = html;
    $$('.task-tab', list).forEach(function (b) { b.addEventListener('click', function () { state.cat = +b.dataset.k; state.ex = 0; state.model = null; render(); }); });

    function render() {
      var cat = CATS[state.cat], pool = casesOf(cat[0]), c = pool[state.ex % pool.length];
      $$('.task-tab', list).forEach(function (b) { b.setAttribute('aria-selected', String(+b.dataset.k === state.cat)); });
      var outs = c.outputs.slice().sort(byStrength);
      var o = outs.filter(function (x) { return x.model === (state.model || 'GPT-Image-2.5'); })[0] || outs[0];
      state.model = o.model;
      panel.innerHTML = '<div class="tp-head"><span class="tag ' + cat[1].toLowerCase() + '">' + cat[1] + '</span><span class="count">' + cat[2] + ' cases in the benchmark</span></div>' +
        '<h3 class="tp-title">' + cat[0] + '</h3><p class="tp-desc">' + cat[3] + '</p>' +
        '<div class="tp-ex"><div><p class="mini-title">Example ' + ((state.ex % pool.length) + 1) + ' of ' + pool.length + '</p><p class="case-name">' + esc(c.title) + '</p><p class="prompt">' + esc(c.prompt) + '</p>' + inputsHTML(c) + '</div>' +
        '<div class="tp-stage">' + gifHTML(o) + stripHTML(o) +
        '<div class="tp-models" role="group" aria-label="Model">' + outs.map(function (x) { return '<button class="chip" type="button" data-model="' + esc(x.model) + '" aria-pressed="' + (x === o) + '">' + esc(x.model) + '</button>'; }).join('') + '</div>' +
        '<div class="tp-actions"><button class="pill" type="button" data-open>' + ICON.open + '<span>All baselines</span></button>' + (pool.length > 1 ? '<button class="pill" type="button" data-next>' + ICON.next + '<span>Next example</span></button>' : '') + '</div></div></div>';
      $$('[data-model]', panel).forEach(function (b) { b.addEventListener('click', function () { state.model = b.dataset.model; render(); }); });
      $('[data-open]', panel).addEventListener('click', function () { openCase(c.id); });
      var nx = $('[data-next]', panel);
      if (nx) nx.addEventListener('click', function () { state.ex++; state.model = null; render(); });
    }
    render();
  })();

  /* ------------------------------------------------------------ leaderboard */
  var COLS = ['Observation-Conditioned Transitions', 'Physical Simulation', 'Adaptive Task Completion', 'L3 Overall', 'Physical Properties', 'Visual Cues', 'In-Context Procedural Learning', 'Logic and Rules', 'Visual Goal Realization', 'L4 Overall', 'Overall'];
  var FAMILY = [['Proprietary Image Systems', 'var(--series-1)'], ['Video Systems', 'var(--series-2)'], ['Open-source Image Models', 'var(--series-3)']];
  var famColor = {}; FAMILY.forEach(function (f) { famColor[f[0]] = f[1]; });
  (function () {
    var chart = $('#lb-chart'), tip = $('#lb-tip'), box = $('#lb');
    var metric = 10, ROW = 46;
    var models = WC.models.slice();
    $('#lb-metric').innerHTML = [[10, 'Overall'], [3, 'L3'], [9, 'L4']].map(function (m) { return '<button type="button" data-m="' + m[0] + '" aria-pressed="' + (m[0] === 10) + '">' + m[1] + '</button>'; }).join('');
    $('#lb-category').innerHTML = '<option value="">By category…</option>' + [0, 1, 2, 4, 5, 6, 7, 8].map(function (i) { return '<option value="' + i + '">' + (i < 3 ? 'L3 · ' : 'L4 · ') + COLS[i] + '</option>'; }).join('');
    $('#lb-legend').innerHTML = FAMILY.map(function (f) { return '<span><i style="background:' + f[1] + '"></i>' + f[0] + '</span>'; }).join('');

    chart.style.height = (models.length * ROW + 26) + 'px';
    chart.innerHTML = '<div class="lb-axis" id="lb-axis"></div>' + models.map(function (m, k) {
      return '<div class="lb-row" role="listitem" data-k="' + k + '"><span class="lb-rank"></span><div class="lb-model"><img class="logo" src="' + m.logo + '" alt="" width="26" height="26"><div><div class="lb-name">' + esc(m.name) + '</div><div class="lb-fmt">' + esc(m.format) + ' · ' + esc(m.group) + '</div></div></div>' +
        '<div class="lb-track"><div class="lb-fill" style="--c:' + famColor[m.group] + '"></div></div><span class="lb-val"></span></div>';
    }).join('');
    var rows = $$('.lb-row', chart);

    function axis() {
      var t = $('.lb-track', chart);
      if (!t || chart.hidden) return;
      var cb = chart.getBoundingClientRect(), tb = t.getBoundingClientRect();
      $('#lb-axis').innerHTML = [0, 25, 50, 75, 100].map(function (v) {
        var x = tb.left - cb.left + tb.width * v / 100;
        return '<span style="left:' + x + 'px"></span><em style="left:' + x + 'px">' + v + '</em>';
      }).join('');
      $('#lb-axis').style.cssText = 'left:0;right:0';
    }
    function render(animate) {
      var order = models.map(function (m, k) { return k; }).sort(function (a, b) { return models[b].scores[metric] - models[a].scores[metric]; });
      order.forEach(function (k, rank) {
        var r = rows[k], m = models[k], v = m.scores[metric];
        r.style.transform = 'translateY(' + rank * ROW + 'px)';
        r.classList.toggle('top', rank === 0);
        $('.lb-rank', r).textContent = String(rank + 1).padStart(2, '0');
        $('.lb-val', r).textContent = v.toFixed(1);
        $('.lb-fill', r).style.setProperty('--w', (animate === false ? 0 : v) + '%');
        r.setAttribute('aria-label', m.name + ': ' + v.toFixed(1));
      });
      $$('#lb-metric button').forEach(function (b) { b.setAttribute('aria-pressed', String(+b.dataset.m === metric)); });
      $('#lb-category').classList.toggle('on', [3, 9, 10].indexOf(metric) < 0);
    }
    $$('#lb-metric button').forEach(function (b) { b.addEventListener('click', function () { metric = +b.dataset.m; $('#lb-category').value = ''; render(); }); });
    $('#lb-category').addEventListener('change', function (e) { if (e.target.value !== '') { metric = +e.target.value; render(); } });
    render(still ? true : false);
    box.onReveal = function () { render(); };
    axis();
    window.addEventListener('resize', axis);

    rows.forEach(function (r) {
      r.addEventListener('pointermove', function (e) {
        var m = models[+r.dataset.k], bb = box.getBoundingClientRect();
        var items = [[10, 'Overall'], [3, 'L3 Overall'], [9, 'L4 Overall']];
        if ([3, 9, 10].indexOf(metric) < 0) items.push([metric, COLS[metric]]);
        tip.innerHTML = '<h4>' + esc(m.name) + '</h4><dl>' + items.map(function (it) { return '<dt>' + it[1] + '</dt><dd class="' + (it[0] === metric ? 'hi' : '') + '">' + m.scores[it[0]].toFixed(1) + '</dd>'; }).join('') +
          '<dt>Format</dt><dd>' + esc(m.format) + '</dd></dl>';
        tip.hidden = false;
        var x = e.clientX - bb.left + 18, y = e.clientY - bb.top + 14;
        if (x + 240 > bb.width) x = e.clientX - bb.left - 250;
        tip.style.left = x + 'px'; tip.style.top = y + 'px';
      });
      r.addEventListener('pointerleave', function () { tip.hidden = true; });
    });

    // table view: grouped as in Table 1, best overall (orange) and best within group (blue)
    var order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    $('#lb-thead').innerHTML = '<tr><th>Model</th>' + order.map(function (i) { return '<th class="' + (i < 4 ? 'l3' : i < 10 ? 'l4' : '') + '">' + COLS[i] + '</th>'; }).join('') + '</tr>';
    var best = order.map(function (i) { return Math.max.apply(null, models.map(function (m) { return m.scores[i]; })); });
    var groups = ['Open-source Image Models', 'Proprietary Image Systems', 'Video Systems'];
    $('#lb-tbody').innerHTML = groups.map(function (g) {
      var gm = models.filter(function (m) { return m.group === g; });
      var gbest = order.map(function (i) { return Math.max.apply(null, gm.map(function (m) { return m.scores[i]; })); });
      return '<tr class="grp"><td colspan="12">' + g + '</td></tr>' + gm.map(function (m) {
        return '<tr><td class="mname"><div><img class="logo" src="' + m.logo + '" alt="" width="22" height="22">' + esc(m.name) + '</div></td>' + order.map(function (i, k) {
          var v = m.scores[i];
          return v === best[k] ? '<td class="best"><span>' + v.toFixed(1) + '</span></td>' : v === gbest[k] ? '<td class="gbest"><span>' + v.toFixed(1) + '</span></td>' : '<td>' + v.toFixed(1) + '</td>';
        }).join('') + '</tr>';
      }).join('');
    }).join('');
    $('#lb-table').insertAdjacentHTML('beforeend', '<p class="lb-note">Orange: best across all models. Blue: best within each model group.</p>');
    $$('#lb-view button').forEach(function (b) {
      b.addEventListener('click', function () {
        var table = b.dataset.view === 'table';
        $$('#lb-view button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        $('#lb-table').hidden = !table; chart.hidden = table; $('#lb-legend').hidden = table;
        $('#lb-metric').style.visibility = $('#lb-category').style.visibility = table ? 'hidden' : '';
        if (!table) axis();
      });
    });
  })();

  /* ------------------------------------------------------------ charts */
  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) {
    var el = document.createElementNS(NS, tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function chartTip(card) {
    var t = document.createElement('div');
    t.className = 'tip'; t.hidden = true; card.appendChild(t);
    return {
      show: function (html, e) {
        var bb = card.getBoundingClientRect();
        t.innerHTML = html; t.hidden = false;
        var x = e.clientX - bb.left + 16, y = e.clientY - bb.top + 12;
        if (x + 230 > bb.width) x = e.clientX - bb.left - 240;
        t.style.left = x + 'px'; t.style.top = y + 'px';
      },
      hide: function () { t.hidden = true; }
    };
  }
  function drawLen(svg) { $$('.draw', svg).forEach(function (p) { p.style.setProperty('--len', Math.ceil(p.getTotalLength())); }); }
  var fmtDelta = function (d) { return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(1); };

  // dumbbell: one row per item, hollow marker = a, filled marker = b
  function dumbbell(host, cfg) {
    host.querySelectorAll('svg, .tip').forEach(function (n) { n.remove(); });
    var W = 640, L = cfg.left || 130, R = 64, rowH = cfg.rowH || 40, H = cfg.rows.length * rowH + 30;
    var x = function (v) { return L + (W - L - R) * (v - cfg.min) / (cfg.max - cfg.min); };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cfg.label }, host);
    cfg.ticks.forEach(function (v) {
      svgEl('line', { class: 'grid', x1: x(v), x2: x(v), y1: 4, y2: H - 22 }, svg);
      svgEl('text', { class: 'ax', x: x(v), y: H - 6, 'text-anchor': 'middle' }, svg).textContent = v;
    });
    var tip = chartTip(host);
    cfg.rows.forEach(function (d, k) {
      var y = 20 + k * rowH, delta = d[2] - d[1];
      var g = svgEl('g', {}, svg);
      svgEl('text', { x: L - 14, y: y + 4, 'text-anchor': 'end' }, g).textContent = d[0];
      svgEl('line', { class: 'draw', x1: x(d[1]), x2: x(d[2]), y1: y, y2: y, stroke: 'rgba(24,24,32,.25)', 'stroke-width': 2 }, g);
      svgEl('circle', { cx: x(d[1]), cy: y, r: 6, fill: '#fff', stroke: cfg.aColor, 'stroke-width': 2.5 }, g);
      svgEl('circle', { class: 'pop', cx: x(d[2]), cy: y, r: 6.5, fill: cfg.bColor, stroke: '#fff', 'stroke-width': 2 }, g);
      svgEl('text', { class: 'pop' + (cfg.bold && cfg.bold(d) ? ' lbl-b' : ''), x: W - 4, y: y + 4, 'text-anchor': 'end' }, g).textContent = fmtDelta(delta);
      var hit = svgEl('rect', { class: 'hit', x: 0, y: y - rowH / 2, width: W, height: rowH }, g);
      hit.addEventListener('pointermove', function (e) { tip.show('<h4>' + d[0] + '</h4><dl><dt>' + cfg.aName + '</dt><dd>' + d[1].toFixed(1) + '</dd><dt>' + cfg.bName + '</dt><dd>' + d[2].toFixed(1) + '</dd><dt>Change</dt><dd class="hi">' + fmtDelta(delta) + '</dd></dl>', e); });
      hit.addEventListener('pointerleave', tip.hide);
    });
    drawLen(svg);
  }

  // Finding 1: L3 vs L4 (Figure 5b)
  (function () {
    var card = $('#gap-chart');
    card.innerHTML = '<h4>L3 vs. L4 overall score</h4><p class="sub">Change from L3 to L4 for six representative models</p><div class="legend"><span><i class="hollow" style="box-shadow:inset 0 0 0 2.5px var(--series-3)"></i>L3 overall</span><span><i style="background:var(--series-1)"></i>L4 overall</span></div>';
    dumbbell(card, {
      label: 'L3 and L4 overall scores', min: 0, max: 80, ticks: [0, 20, 40, 60, 80], aColor: 'var(--series-3)', bColor: 'var(--series-1)', aName: 'L3 overall', bName: 'L4 overall',
      rows: [['GPT-Image-2.5', 73.8, 71.6], ['GPT-Image-2', 68.3, 63.7], ['Seedance 2.0', 51.9, 41.6], ['Nano Banana Pro', 45.6, 39.5], ['SenseNova-U1', 24.4, 15.0], ['Emu3.5', 16.5, 7.4]],
      bold: function (d) { return d[0] === 'GPT-Image-2.5'; }
    });
  })();

  // Finding 2: enhancer (Figure 6)
  (function () {
    var card = $('#enh-chart');
    var CAT8 = ['Observation-Cond. Transitions', 'Physical Simulation', 'Adaptive Task Completion', 'Physical Properties', 'Visual Cues', 'In-Context Proc. Learning', 'Logic and Rules', 'Visual Goal Realization'];
    var DATA = {
      'Nano Banana Pro': { base: [36.2, 56.1, 43.5, 49.9, 33.7, 43.3, 41.4, 28.5], enh: [58.9, 68.1, 56.7, 64.0, 60.1, 63.9, 66.9, 48.3], baseName: 'Baseline' },
      'GPT-Image-2': { base: [74.2, 70.6, 59.6, 66.0, 62.6, 70.6, 66.6, 51.8], enh: [79.2, 61.8, 69.3, 73.8, 66.7, 72.7, 74.4, 59.1], baseName: 'With GPT-5.5' }
    };
    var current = 'Nano Banana Pro';
    card.innerHTML = '<div class="chart-top"><div><h4>With GPT-6 Astra as the enhancer</h4><p class="sub">Category-wise scores, baseline vs. enhanced</p></div><div class="seg-ctl" role="group" aria-label="Generator">' +
      Object.keys(DATA).map(function (k) { return '<button type="button" data-g="' + k + '" aria-pressed="' + (k === current) + '">' + k + '</button>'; }).join('') + '</div></div>' +
      '<div class="legend"><span><i class="hollow" style="box-shadow:inset 0 0 0 2.5px var(--mute)"></i><b data-base>Baseline</b></span><span><i style="background:var(--series-1)"></i>With GPT-6 Astra</span></div>';
    function draw() {
      var d = DATA[current];
      $('[data-base]', card).textContent = d.baseName;
      dumbbell(card, {
        label: 'Scores with and without GPT-6 Astra for ' + current, left: 196, rowH: 32, min: 20, max: 90, ticks: [20, 40, 60, 80],
        aColor: 'var(--mute)', bColor: 'var(--series-1)', aName: d.baseName, bName: 'With GPT-6 Astra',
        rows: CAT8.map(function (n, k) { return [n, d.base[k], d.enh[k]]; })
      });
      $$('.seg-ctl button', card).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.g === current)); });
    }
    $$('.seg-ctl button', card).forEach(function (b) { b.addEventListener('click', function () { current = b.dataset.g; draw(); }); });
    draw();
  })();

  function lineChart(card, opt) {
    card.innerHTML = '<h4>' + opt.title + '</h4><p class="sub">' + opt.sub + '</p><div class="legend">' + opt.series.map(function (s) { return '<span><i class="line" style="background:' + s.c + '"></i>' + s.name + '</span>'; }).join('') + '</div>';
    var W = 640, H = 300, L = 40, R = opt.right || 150, T = 12, B = 34;
    var n = opt.x.length;
    var x = function (k) { return L + (W - L - R) * (n === 1 ? 0.5 : k / (n - 1)); };
    var y = function (v) { return T + (H - T - B) * (1 - (v - opt.min) / (opt.max - opt.min)); };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opt.title }, card);
    opt.ticks.forEach(function (v) {
      svgEl('line', { class: 'grid', x1: L, x2: W - R + 10, y1: y(v), y2: y(v) }, svg);
      svgEl('text', { class: 'ax', x: L - 10, y: y(v) + 3.5, 'text-anchor': 'end' }, svg).textContent = v;
    });
    opt.x.forEach(function (lab, k) { svgEl('text', { class: 'ax', x: x(k), y: H - 10, 'text-anchor': 'middle' }, svg).textContent = lab; });
    var cross = svgEl('line', { x1: 0, x2: 0, y1: T, y2: H - B, stroke: 'rgba(24,24,32,.22)', 'stroke-width': 1, visibility: 'hidden' }, svg);
    if (opt.extra) opt.extra(svg, x, y);
    opt.series.forEach(function (s) {
      var d = s.v.map(function (v, k) { return (k ? 'L' : 'M') + x(k).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      svgEl('path', { class: 'draw', d: d, stroke: s.c, 'stroke-width': 2, fill: 'none' }, svg);
      s.v.forEach(function (v, k) { svgEl('circle', { class: 'pop', cx: x(k), cy: y(v), r: 4.5, fill: s.c, stroke: '#fff', 'stroke-width': 2 }, svg); });
    });
    var ends = opt.series.map(function (s) { return { s: s, y: y(s.v[n - 1]) }; }).sort(function (a, b) { return a.y - b.y; });
    for (var k = 1; k < ends.length; k++) if (ends[k].y - ends[k - 1].y < 15) ends[k].y = ends[k - 1].y + 15;
    ends.forEach(function (e) { svgEl('text', { class: 'pop', x: x(n - 1) + 12, y: e.y + 4 }, svg).textContent = e.s.short + ' ' + e.s.v[n - 1].toFixed(1); });
    var tip = chartTip(card);
    var hit = svgEl('rect', { class: 'hit', x: L, y: T, width: W - L - R, height: H - T - B }, svg);
    hit.addEventListener('pointermove', function (e) {
      var bb = svg.getBoundingClientRect(), px = (e.clientX - bb.left) * W / bb.width;
      var k = Math.max(0, Math.min(n - 1, Math.round((px - L) / ((W - L - R) / (n - 1)))));
      cross.setAttribute('x1', x(k)); cross.setAttribute('x2', x(k)); cross.setAttribute('visibility', 'visible');
      tip.show('<h4>' + opt.x[k] + '</h4><dl>' + opt.series.map(function (s) { return '<dt>' + s.name + '</dt><dd>' + s.v[k].toFixed(1) + '</dd>'; }).join('') + '</dl>', e);
    });
    hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); tip.hide(); });
    drawLen(svg);
  }

  lineChart($('#step-chart'), {
    title: 'Per-step visual output accuracy (%)', sub: '195 four-step cases without a direct endpoint reference (Figure 7)',
    x: ['Step 1', 'Step 2', 'Step 3', 'Step 4'], min: 20, max: 100, ticks: [20, 40, 60, 80, 100], right: 150,
    series: [
      { name: 'GPT-Image-2.5', short: 'GPT-Image-2.5', c: 'var(--series-1)', v: [91.3, 88.2, 88.7, 91.3] },
      { name: 'Nano Banana Pro w/ GPT-6 Astra', short: 'NBP + GPT-6', c: 'var(--series-2)', v: [82.6, 76.9, 79.0, 76.4] },
      { name: 'Nano Banana Pro', short: 'Nano Banana Pro', c: 'var(--series-3)', v: [67.7, 65.6, 54.4, 48.7] },
      { name: 'SenseNova-U1', short: 'SenseNova-U1', c: 'var(--series-4)', v: [42.6, 36.4, 31.3, 27.2] }
    ]
  });
  lineChart($('#harness-chart'), {
    title: 'Overall score by harness', sub: 'Both generators paired with GPT-6 Astra (Table 3)',
    x: ['Baseline', 'Inspection loop', 'Coding-first loop'], min: 50, max: 90, ticks: [50, 60, 70, 80, 90], right: 160,
    series: [
      { name: 'GPT-Image-2.5', short: 'GPT-Image-2.5', c: 'var(--series-1)', v: [72.8, 80.2, 82.4] },
      { name: 'Nano Banana Pro + GPT-6 Astra', short: 'Nano Banana Pro', c: 'var(--series-2)', v: [61.2, 72.5, 72.9] }
    ]
  });

  /* ------------------------------------------------------------ gallery: three cards at a time, auto-scrolling */
  var dlgOpen = function () { return $('#case-dlg').open || $('#lightbox').open; };
  var hoverBlockedUntil = 0;
  (function () {
    var track = $('#g-track'), carousel = $('.g-carousel'), cat = '';
    var picks = {}, hoverTimer = null, paused = still, interacting = false, visible = false;
    function previews(c) {
      if (!picks[c.id]) picks[c.id] = shuffle(c.outputs).slice(0, 2);
      return picks[c.id];
    }
    $('#g-cats').innerHTML = [['', 'Unspecified']].concat(CATS.map(function (c) { return [c[0], c[0]]; })).map(function (c) {
      return '<button class="chip" type="button" data-cat="' + esc(c[0]) + '" aria-pressed="' + (c[0] === '') + '">' + esc(c[1]) + '</button>';
    }).join('');
    $$('#g-cats .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        cat = b.dataset.cat;
        $$('#g-cats .chip').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        render();
      });
    });
    function step() { var card = track.firstElementChild; return card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap) : 1; }
    function position() {
      var cards = track.children.length;
      if (!cards) return;
      var first = Math.round(track.scrollLeft / step());
      var shown = Math.max(1, Math.round((track.clientWidth + parseFloat(getComputedStyle(track).columnGap)) / step()));
      $('#g-pos').textContent = (first + 1) + '–' + Math.min(first + shown, cards) + ' / ' + cards;
      $('#g-prev').disabled = track.scrollLeft <= 1;
      $('#g-next').disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
    }
    function move(dir) { track.scrollBy({ left: dir * step(), behavior: still ? 'auto' : 'smooth' }); }
    function render() {
      clearTimeout(hoverTimer);
      var list = WC.cases.filter(function (c) { return cat ? c.category === cat : c.featured; });
      track.innerHTML = list.map(function (c) {
        var pv = previews(c);
        return '<li class="g-card"><button type="button" data-case="' + c.id + '" aria-haspopup="dialog" aria-label="Open case ' + c.id + ': ' + esc(c.title) + '">' +
          '<div class="g-media"><div class="g-ref"><img src="' + c.inputs[0].thumb + '" alt="Input reference for ' + esc(c.title) + '" loading="lazy"><span>Input</span></div><div class="g-prevs">' +
          pv.map(function (o) { return '<div class="g-prev"><img src="' + o.gif + '" alt="' + esc(o.model) + ' output sequence" loading="lazy" decoding="async"><span>' + esc(o.model) + '</span></div>'; }).join('') + '</div></div>' +
          '<div class="g-info"><span class="g-meta">' + level(c) + c.id + ' · ' + c.steps + ' states · ' + c.outputs.length + ' baselines</span><span class="g-title">' + esc(c.title) + '</span><span class="g-cat">' + esc(c.category) + '</span></div></button></li>';
      }).join('');
      $$('[data-case]', track).forEach(function (b) {
        b.addEventListener('click', function () { clearTimeout(hoverTimer); openCase(b.dataset.case); });
        // hovering a card for a moment opens it, as on the earlier site
        b.addEventListener('pointerenter', function (e) {
          if (e.pointerType !== 'mouse' || Date.now() < hoverBlockedUntil) return;
          clearTimeout(hoverTimer);
          hoverTimer = setTimeout(function () { if (!dlgOpen()) openCase(b.dataset.case); }, 650);
        });
        b.addEventListener('pointerleave', function () { clearTimeout(hoverTimer); });
      });
      track.scrollLeft = 0;
      position();
    }
    $('#g-prev').addEventListener('click', function () { move(-1); });
    $('#g-next').addEventListener('click', function () { move(1); });
    track.addEventListener('scroll', position, { passive: true });
    window.addEventListener('resize', position);
    track.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); move(e.key === 'ArrowLeft' ? -1 : 1); } });
    carousel.addEventListener('pointerenter', function () { interacting = true; });
    carousel.addEventListener('pointerleave', function () { interacting = false; clearTimeout(hoverTimer); });
    var playBtn = $('#g-play');
    function syncPlay() { playBtn.textContent = paused ? 'Resume scrolling' : 'Pause scrolling'; playBtn.setAttribute('aria-pressed', String(paused)); }
    playBtn.addEventListener('click', function () { paused = !paused; syncPlay(); });
    syncPlay();
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0.15 }).observe(carousel);
    setInterval(function () {
      if (paused || interacting || !visible || document.hidden || dlgOpen() || carousel.contains(document.activeElement)) return;
      if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 2) track.scrollTo({ left: 0, behavior: 'smooth' });
      else move(1);
    }, 4000);
    render();
  })();

  /* ------------------------------------------------------------ case dialog: every baseline as GIF + states */
  var dlg = $('#case-dlg'), dlgBody = $('#case-body');
  function openCase(id) {
    var c = CASES[id];
    var outs = c.outputs.slice().sort(byStrength);
    dlgBody.innerHTML = '<div class="dlg-top"><div><div class="kick">' + level(c) + c.id + ' · ' + esc(c.category) + ' · ' + c.steps + ' states</div><h2 id="case-title">' + esc(c.title) + '</h2></div><button class="dlg-close" type="button" aria-label="Close">×</button></div>' +
      '<div class="dlg-body"><aside class="dlg-side"><div><p class="mini-title">Instruction</p><p class="prompt">' + esc(c.prompt) + '</p></div><div><p class="mini-title">Input references</p>' + inputsHTML(c) + '</div></aside>' +
      '<div class="rows"><p class="mini-title" style="margin:0">' + outs.length + ' main baselines · animated sequence and individual states</p>' + outs.map(function (o) {
        return '<section class="mrow"><div class="mrow-head">' + logo(o.model) + '<b>' + esc(o.model) + '</b><span>' + esc(o.config) + '</span></div>' + seqRowHTML(o) + '</section>';
      }).join('') + '</div></div>';
    dlg.showModal();
    dlgBody.scrollTop = 0;
    $('.dlg-close', dlgBody).addEventListener('click', function () { dlg.close(); });
  }
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', function () { hoverBlockedUntil = Date.now() + 1200; $$('.gif img', dlgBody).forEach(function (i) { i.removeAttribute('src'); }); });

  /* ------------------------------------------------------------ comparison: complete sequences side by side */
  (function () {
    var body = $('#cmp-body'), metric = 'TC', idx = 0;
    var METRICS = { TC: 'Task Completion', CP: 'Causal Plausibility', VC: 'Visual Consistency', Overall: 'Overall' };
    $('#cmp-metric').innerHTML = Object.keys(METRICS).map(function (m) { return '<button type="button" data-m="' + m + '" aria-pressed="' + (m === metric) + '">' + m + '</button>'; }).join('');
    $$('#cmp-metric button').forEach(function (b) { b.addEventListener('click', function () { metric = b.dataset.m; idx = 0; render(); }); });
    $('#cmp-prev').addEventListener('click', function () { idx--; render(); });
    $('#cmp-next').addEventListener('click', function () { idx++; render(); });

    function side(c, name, label, win) {
      var o = c.outputs.filter(function (x) { return x.model === name; })[0];
      return '<div class="cmp-side' + (win ? ' win' : '') + '"><div class="side-head"><small>' + label + '</small>' + (win ? '<span class="win-badge">' + ICON.ok + 'Better</span>' : '') + logo(name) + '<b>' + esc(name) + '</b></div>' +
        gifHTML(o) + stripHTML(o) + '</div>';
    }
    function render() {
      var list = WC.pairs.filter(function (p) { return p.metric === metric; });
      idx = Math.max(0, Math.min(idx, list.length - 1));
      var p = list[idx], c = CASES[p.caseId], leftWins = p.relation === '>';
      $$('#cmp-metric button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.m === metric)); });
      $('#cmp-pos').textContent = (idx + 1) + ' / ' + list.length;
      $('#cmp-prev').disabled = idx === 0; $('#cmp-next').disabled = idx === list.length - 1;
      body.innerHTML = '<div class="cmp-case"><div><span class="kick">' + c.id + ' · ' + esc(c.category) + '</span><h3>' + esc(c.title) + '</h3><p>' + esc(c.prompt) + '</p></div>' + inputsHTML(c) + '</div>' +
        '<div class="cmp-cols">' + side(c, p.leftModel, 'Left', leftWins) +
        '<div class="cmp-v" aria-label="' + METRICS[metric] + ': left ' + (leftWins ? 'better than' : 'worse than') + ' right"><span class="m">' + metric + '</span><span class="g">' + (leftWins ? '&gt;' : '&lt;') + '</span><small>' + METRICS[metric] + '</small></div>' +
        side(c, p.rightModel, 'Right', !leftWins) + '</div>';
    }
    render();
  })();

  /* ------------------------------------------------------------ evaluation: TC / CP / VC triangle */
  (function () {
    var card = $('#radar');
    var DIMS = ['TC', 'CP', 'VC'], NAMES = { TC: 'Task Completion', CP: 'Causal Plausibility', VC: 'Visual Consistency' };
    var DATA = [
      ['GPT-Image-2.5', 72.51, 78.99, 59.97], ['GPT-Image-2', 63.41, 73.68, 57.88], ['Nano Banana Pro', 36.93, 53.75, 36.46],
      ['Seedance 2.0', 42.65, 56.84, 37.08], ['SenseNova-U1', 13.69, 33.58, 11.84], ['Emu3.5', 4.22, 23.47, 14.51]
    ];
    // two highlighted models at a time (slots 1 and 2); the rest stay as grey context outlines
    var SLOT = ['var(--series-1)', 'var(--series-2)'];
    // GPT-Image-2.5 stays highlighted; the second slot cycles through the other baselines
    var LEAD = 'GPT-Image-2.5', others = DATA.map(function (d) { return d[0]; }).filter(function (n) { return n !== LEAD; });
    var active = [LEAD, others[0]], cycle = 0, hovering = false;
    var W = 460, H = 380, cx = W / 2, cy = 222, R = 168;
    var ang = [-90, 30, 150].map(function (d) { return d * Math.PI / 180; });   // TC top, CP bottom-right, VC bottom-left
    var pt = function (k, v) { return [cx + Math.cos(ang[k]) * R * v / 100, cy + Math.sin(ang[k]) * R * v / 100]; };
    var poly = function (vals, f) { return vals.map(function (v, k) { var p = pt(k, v * f); return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '); };

    card.innerHTML = '<h4>Performance across TC, CP and VC</h4><p class="sub">GPT-Image-2.5 compared with each baseline in turn (0–100). Click a model to compare it directly.</p>';
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Triangle chart of TC, CP and VC scores' }, card);
    [20, 40, 60, 80, 100].forEach(function (v) {
      svgEl('polygon', { class: 'tri', points: poly([v, v, v], 1) }, svg);
      var p = pt(0, v); svgEl('text', { class: 'ax', x: p[0] - 7, y: p[1] + 4, 'text-anchor': 'end' }, svg).textContent = v;
    });
    DIMS.forEach(function (d, k) {
      var p = pt(k, 100); svgEl('line', { class: 'axis', x1: cx, y1: cy, x2: p[0], y2: p[1] }, svg);
      var l = pt(k, 116);
      var t = svgEl('text', { class: 'axl', x: l[0], y: l[1] + (k ? 14 : -2), 'text-anchor': 'middle' }, svg);
      t.textContent = NAMES[d] + ' (' + d + ')';
    });
    var ctx = svgEl('g', {}, svg), hi = svgEl('g', {}, svg);
    var ctxPolys = DATA.map(function (d) { return svgEl('polygon', { class: 'ctx', points: poly(d.slice(1), 1) }, ctx); });
    var shapes = SLOT.map(function (c) {
      var g = svgEl('g', {}, hi);
      return {
        area: svgEl('polygon', { points: poly([0, 0, 0], 1), fill: c, 'fill-opacity': .14, stroke: c, 'stroke-width': 2.2, 'stroke-linejoin': 'round' }, g),
        dots: [0, 1, 2].map(function () { return svgEl('circle', { r: 4.5, fill: c, stroke: '#fff', 'stroke-width': 2, cx: cx, cy: cy }, g); }),
        cur: [0, 0, 0]
      };
    });
    function animateTo(sh, target, slot) {
      var from = sh.cur.slice(), t0 = performance.now(), dur = still ? 0 : 700;
      (function frame(now) {
        var p = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - p, 3);
        var v = from.map(function (f, k) { return f + (target[k] - f) * e; });
        sh.area.setAttribute('points', poly(v, 1));
        v.forEach(function (x, k) {
          var q = pt(k, x); sh.dots[k].setAttribute('cx', q[0]); sh.dots[k].setAttribute('cy', q[1]);
        });
        sh.cur = v;
        if (p < 1) requestAnimationFrame(frame);
      })(t0);
    }
    var list = document.createElement('div');
    list.className = 'r-list';
    list.innerHTML = '<div class="r-head"><span></span><span>Model</span><span>TC</span><span>CP</span><span>VC</span></div>' + DATA.map(function (d) {
      return '<button class="r-row" type="button" data-m="' + d[0] + '"><i></i><span>' + d[0] + '</span><span>' + d[1].toFixed(1) + '</span><span>' + d[2].toFixed(1) + '</span><span>' + d[3].toFixed(1) + '</span></button>';
    }).join('');
    card.appendChild(list);
    function draw() {
      active.forEach(function (name, slot) {
        var d = DATA.filter(function (x) { return x[0] === name; })[0];
        animateTo(shapes[slot], d.slice(1), slot);
      });
      $$('.r-row', list).forEach(function (r) {
        var slot = active.indexOf(r.dataset.m);
        r.setAttribute('aria-pressed', String(slot >= 0));
        $('i', r).style.background = slot >= 0 ? SLOT[slot] : '#fff';
      });
      ctxPolys.forEach(function (pg, k) { pg.style.visibility = active.indexOf(DATA[k][0]) >= 0 ? 'hidden' : 'visible'; });
    }
    $$('.r-row', list).forEach(function (r) {
      r.addEventListener('click', function () {
        var m = r.dataset.m;
        if (m === LEAD) return;
        cycle = others.indexOf(m); active[1] = m;
        draw();
      });
    });
    card.addEventListener('pointerenter', function () { hovering = true; });
    card.addEventListener('pointerleave', function () { hovering = false; });
    // first switch soon after the chart comes into view, then a steady pace
    var timer = null;
    function tick() {
      timer = setTimeout(tick, 1900);
      if (hovering || document.hidden) return;
      cycle = (cycle + 1) % others.length; active[1] = others[cycle];
      draw();
    }
    if (!still) new IntersectionObserver(function (en) {
      clearTimeout(timer);
      if (en[0].isIntersecting) timer = setTimeout(tick, 1000);
    }, { threshold: 0.3 }).observe(card);
    var host = card.closest('.reveal');
    if (host) host.onReveal = draw; else draw();
  })();

  /* ------------------------------------------------------------ bibtex */
  $('#bib-copy').addEventListener('click', function () {
    var b = this;
    navigator.clipboard.writeText($('#bib-text').textContent).then(function () {
      b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1600);
    });
  });

  $$('.reveal').forEach(observeReveal);
})();
