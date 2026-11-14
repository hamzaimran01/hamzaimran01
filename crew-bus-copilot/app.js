(function () {
  var E = Engine, fmt = E.fmt;
  var STORE = 'crewBusCopilot.v1';

  /* ---------- state ---------- */
  function freshScenario() {
    return {
      tasks: SAMPLE_TASKS.map(function (t) {
        var r = E.toMin(t.ready), d = E.toMin(t.due);
        return Object.assign({}, t, { ready: r, due: d, origReady: r, origDue: d, flags: [] });
      }),
      buses: SAMPLE_BUSES.map(function (b) {
        var p = b.shift.split('-');
        return Object.assign({}, b, { shiftStart: E.toMin(p[0]), shiftEnd: E.toMin(p[1]), outFrom: null });
      }),
      log: [], overrides: {}, overrideFrom: {}, accepted: {}, lastChange: null, nextId: 16, history: []
    };
  }
  function load() {
    try { var s = JSON.parse(localStorage.getItem(STORE)); if (s && s.tasks && s.buses) return s; } catch (e) {}
    return null;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) {} }
  function snapshot() { var c = JSON.parse(JSON.stringify(S)); delete c.history; return c; }

  var S = load() || freshScenario();
  var tab = 'input';
  try { tab = localStorage.getItem(STORE + '.tab') || 'input'; } catch (e) {}
  var openOverrule = null;
  var plan, base;

  function compute() {
    plan = E.planCopilot(S.tasks, S.buses, S.overrides);
    base = E.planBaseline(S.tasks, S.buses);
  }

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function task(id) { return S.tasks.filter(function (t) { return t.id === id; })[0]; }
  function busById(id) { return S.buses.filter(function (b) { return b.id === id; })[0]; }
  function busOutLabel(b) { return b.outFrom === 0 ? 'Out of service' : (b.outFrom != null ? 'Out of service from ' + fmt(b.outFrom) : ''); }
  function shortLoc(l) { return l.replace('Crew Center', 'Crew Ctr'); }
  function toast(msg) {
    var el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  function statusOf(id) {
    var a = plan.byTask[id];
    if (!a) return 'unassigned';
    if (S.overrides[id]) return 'overruled';
    if (S.accepted[id] === a.bus) return 'accepted';
    return 'open';
  }

  /* ---------- disruptions ---------- */
  function applyText(text) {
    var cmds = Parser.parse(text);
    if (!cmds.length) return [];
    var before = {}; Object.keys(plan.byTask).forEach(function (k) { before[k] = plan.byTask[k].bus; });
    var results = [];
    cmds.forEach(function (c) {
      if (c.type === 'error') { results.push({ ok: false, text: c.text, msg: c.hint }); return; }
      if (c.type === 'undo') {
        var prev = S.history.pop();
        if (!prev) { results.push({ ok: false, text: c.text, msg: 'Nothing to undo.' }); return; }
        var h = S.history; S = prev; S.history = h;
        results.push({ ok: true, text: c.text, msg: 'Last change undone.' }); return;
      }
      if (c.type === 'reset') {
        S = freshScenario(); results.push({ ok: true, text: c.text, msg: 'Back to the original sample day. Decisions cleared.' }); return;
      }
      var snap = snapshot();
      var r = applyCmd(c);
      results.push({ ok: r.ok, text: c.text, msg: r.msg });
      if (r.ok) {
        S.history.push(snap); if (S.history.length > 30) S.history.shift();
        S.log.push({ text: c.text, msg: r.msg });
      }
    });
    compute();
    var changed = [];
    Object.keys(plan.byTask).forEach(function (k) { if (before[k] !== plan.byTask[k].bus) changed.push(k); });
    var oks = results.filter(function (r) { return r.ok; });
    if (oks.length) S.lastChange = { text: oks.map(function (r) { return r.text; }).join('; '), changed: changed };
    save();
    return { results: results, changed: changed };
  }

  function applyCmd(c) {
    if (c.type === 'delay') {
      var ts = S.tasks.filter(function (t) { return t.flight === c.flight; });
      if (!ts.length) return { ok: false, msg: 'No task for ' + c.flight + ' today. Known flights: ' + uniqFlights().join(', ') };
      ts.forEach(function (t) {
        t.ready += c.minutes; t.due += c.minutes;
        var d = t.ready - t.origReady;
        t.flags = t.flags.filter(function (f) { return !/^delay/.test(f); });
        if (d) t.flags.push('delay ' + (d > 0 ? '+' : '') + d + ' min');
      });
      return { ok: true, msg: c.flight + ': ' + ts.map(function (t) { return t.id; }).join(', ') + ' shifted ' + (c.minutes > 0 ? '+' : '') + c.minutes + ' min.' };
    }
    if (c.type === 'busOut' || c.type === 'busBack') {
      var b = busById(c.bus);
      if (!b) return { ok: false, msg: 'Unknown bus ' + c.bus + '. Buses: ' + S.buses.map(function (x) { return x.id; }).join(', ') };
      if (c.type === 'busBack') {
        if (b.outFrom == null) return { ok: false, msg: c.bus + ' is already in service.' };
        b.outFrom = null; return { ok: true, msg: c.bus + ' back in service.' };
      }
      b.outFrom = c.at ? E.toMin(c.at) : 0;
      var freed = [];
      Object.keys(S.overrides).forEach(function (k) { if (S.overrides[k] === c.bus) { delete S.overrides[k]; delete S.overrideFrom[k]; freed.push(k); } });
      return { ok: true, msg: c.bus + ' (' + b.driver + ') out of service' + (c.at ? ' from ' + c.at + ' (earlier runs kept)' : '') + '. Its runs are re-planned.' + (freed.length ? ' Overrides removed: ' + freed.join(', ') + '.' : '') };
    }
    if (c.type === 'cancel') {
      var ids = S.tasks.filter(function (t) { return t.flight === c.flight; }).map(function (t) { return t.id; });
      if (!ids.length) return { ok: false, msg: 'No task for ' + c.flight + '.' };
      S.tasks = S.tasks.filter(function (t) { return t.flight !== c.flight; });
      ids.forEach(function (k) { delete S.overrides[k]; delete S.overrideFrom[k]; delete S.accepted[k]; });
      return { ok: true, msg: c.flight + ' cancelled: ' + ids.join(', ') + ' removed.' };
    }
    if (c.type === 'add') {
      var t = c.task, r = E.toMin(t.ready), d = E.toMin(t.due);
      if (d <= r) return { ok: false, msg: 'Due time must be after ready time.' };
      if (t.pax < 1 || t.pax > RULES.capacity) return { ok: false, msg: 'Pax must be 1–' + RULES.capacity + ' (one bus). Split larger crews into two tasks.' };
      if (t.dispatcherBus && !busById(t.dispatcherBus)) return { ok: false, msg: 'Unknown bus ' + t.dispatcherBus + '.' };
      var id = 'T' + String(S.nextId++).padStart(2, '0');
      S.tasks.push(Object.assign({}, t, { id: id, ready: r, due: d, origReady: r, origDue: d, flags: ['added'] }));
      return { ok: true, msg: id + ' added: ' + t.flight + ' ' + t.dir + ', ' + t.pax + ' pax, ' + t.from + ' → ' + t.to + ', ready ' + t.ready + ', due ' + t.due + '.' + (c.assumed.length ? ' Assumed ' + c.assumed.join(', ') + '.' : '') };
    }
    return { ok: false, msg: 'Not understood.' };
  }
  function uniqFlights() { var f = []; S.tasks.forEach(function (t) { if (f.indexOf(t.flight) < 0) f.push(t.flight); }); return f; }

  /* ---------- why line ---------- */
  function why(id) {
    var a = plan.byTask[id], dec = plan.decisions[id], t = task(id);
    if (!a) return 'No bus can serve this task within shifts.';
    var tr = a.trip, b = busById(a.bus), res = a.res;
    var others = tr.tasks.filter(function (x) { return x.id !== id; });
    var prev = tr.index > 0 ? plan.buses.filter(function (x) { return x.id === a.bus; })[0].trips[tr.index - 1] : null;
    var where = prev
      ? 'free at ' + tr.startLoc + ' after ' + prev.tasks.map(function (x) { return x.id; }).join('+') + ' (' + fmt(tr.startAvail) + ')'
      : 'starts at ' + tr.startLoc;
    var parts = [];
    if (S.overrides[id]) parts.push('Overruled by dispatcher (copilot proposed ' + (S.overrideFrom[id] || '?') + ')');
    parts.push(a.bus + ' ' + where + ' → ' + tr.r.empty + ' min empty');
    if (others.length) {
      var pax = tr.tasks.reduce(function (s, x) { return s + x.pax; }, 0);
      parts.push('shares with ' + others.map(function (x) { return x.id; }).join('+') + ' (' + pax + '/' + RULES.capacity + ' seats, ' + (tr.r.route.length - 1) + (t.dir === 'DEP' ? ' drop-off' : ' pickup') + (tr.r.route.length - 1 > 1 ? 's' : '') + ')');
    }
    var timeTxt = t.dir === 'DEP' ? 'at aircraft ' + fmt(res.doneAt) : 'picked up ' + fmt(res.pickupAt);
    parts.push(timeTxt + ' (due ' + fmt(t.due) + (res.late ? ', ' + res.late + ' min LATE' : '') + ')');
    var s = parts.join('; ') + '.';
    if (dec && dec.runner && !S.overrides[id]) s += ' Score ' + dec.score + ' vs next best ' + dec.runner.bus + ' ' + dec.runner.score + (dec.runner.score === dec.score ? ' (more driving)' : '') + '.';
    else if (dec && !dec.runner && !S.overrides[id]) s += ' Only feasible bus.';
    return s;
  }

  /* ---------- render: input ---------- */
  function renderInput() {
    var el = $('#view-input');
    var rows = S.tasks.slice().sort(function (a, b) { return a.ready - b.ready || (a.id < b.id ? -1 : 1); }).map(function (t) {
      var a = plan.byTask[t.id];
      var late = a && a.res.late;
      var cls = (t.flags.length ? 'changed ' : '') + (late ? 'late' : '');
      return '<tr class="' + cls + '"><td class="mono">' + t.id + '</td><td class="mono">' + esc(t.flight) + '</td>' +
        '<td><span class="dir dir-' + t.dir + '">' + t.dir + '</span></td><td>' + esc(t.crew) + '</td><td class="num">' + t.pax + '</td>' +
        '<td>' + esc(t.from) + '</td><td>' + esc(t.to) + '</td><td class="mono">' + timeCell(t.ready, t.origReady) + '</td><td class="mono">' + timeCell(t.due, t.origDue) + '</td>' +
        '<td class="mono">' + (t.dispatcherBus || '<span class="muted">—</span>') + '</td>' +
        '<td class="mono">' + (a ? a.bus : '<span class="bad">none</span>') + '</td>' +
        '<td>' + t.flags.map(function (f) { return '<span class="tag">' + esc(f) + '</span>'; }).join(' ') + '</td></tr>';
    }).join('');
    var busRows = S.buses.map(function (b) {
      var out = busOutLabel(b);
      return '<tr class="' + (out ? 'out' : '') + '"><td class="mono">' + b.id + '</td><td class="mono">' + b.driver + '</td><td>' + b.start + '</td><td class="mono">' + b.shift + '</td><td>' + (out ? '<span class="tag tag-bad">' + out + '</span>' : '<span class="tag tag-ok">In service</span>') + '</td></tr>';
    }).join('');
    var log = S.log.length ? S.log.slice().reverse().map(function (l) { return '<li><span class="mono">' + esc(l.text) + '</span><span class="muted"> — ' + esc(l.msg) + '</span></li>'; }).join('') : '<li class="muted">No disruptions yet. The plan is for the original sample day.</li>';

    el.innerHTML =
      '<div class="grid-2">' +
      '<div class="card disrupt">' +
        '<h2>Disruption</h2>' +
        '<p class="muted small">Type in plain words. One per line, or separate with “;”. Press Enter to apply (Shift+Enter for a new line).</p>' +
        '<textarea id="disruptText" rows="3" placeholder="e.g. LH400 delayed 30 min"></textarea>' +
        '<div class="row gap">' +
          '<button class="btn primary" data-action="apply">Apply &amp; re-plan</button>' +
          '<button class="btn" data-action="undo"' + (S.history.length ? '' : ' disabled') + '>Undo</button>' +
          '<button class="btn ghost" data-action="reset">Reset day</button>' +
        '</div>' +
        '<div class="chips"><span class="muted small">Try:</span>' +
          ['LH400 delayed 30 min', 'B03 broke down', 'B05 out of service from 06:30', 'add task LH999 DEP 6 crew Crew Center to Pier A ready 06:30 due 06:45', 'cancel LH1500']
            .map(function (x) { return '<button class="chip" data-action="chip" data-text="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') +
        '</div>' +
        '<div id="parseResult"></div>' +
        '<details class="help"><summary>What can I type?</summary><ul>' + Parser.HELP.map(function (h) { return '<li class="mono">' + esc(h) + '</li>'; }).join('') +
          '</ul><p class="muted small">Missing due time is assumed as ready + 15 min (DEP) or + 10 min (ARR). Missing pax is assumed 6. A bus out of service without a time is out for the whole day.</p></details>' +
      '</div>' +
      '<div class="card"><h2>Change log</h2><ul class="log">' + log + '</ul>' +
        '<h3>Buses</h3><div class="table-wrap"><table class="tbl"><thead><tr><th>Bus</th><th>Driver</th><th>Start</th><th>Shift</th><th>Status</th></tr></thead><tbody>' + busRows + '</tbody></table></div>' +
      '</div>' +
      '</div>' +
      '<div class="card"><div class="row between"><h2>Crew tasks <span class="muted small">(' + S.tasks.length + ')</span></h2>' +
        '<button class="btn primary" data-action="goto" data-tab="plan">See copilot plan →</button></div>' +
        '<p class="muted small">Ready = crew can board. Due = at aircraft (DEP) or picked up (ARR). Changed rows are highlighted.</p>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Task</th><th>Flight</th><th>Dir</th><th>Crew</th><th class="num">Pax</th><th>From</th><th>To</th><th>Ready</th><th>Due</th><th>Today’s bus</th><th>Copilot bus</th><th>Change</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';

    var ta = $('#disruptText');
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doApply(); } });
  }
  function timeCell(now, orig) {
    return now !== orig ? '<span class="strike">' + fmt(orig) + '</span> ' + fmt(now) : fmt(now);
  }

  function doApply(textOverride) {
    var ta = $('#disruptText');
    var text = textOverride != null ? textOverride : ta.value;
    if (!text.trim()) { ta.focus(); return; }
    var out = applyText(text);
    renderAll();
    var box = $('#parseResult');
    box.innerHTML = '<ul class="results">' + out.results.map(function (r) {
      return '<li class="' + (r.ok ? 'ok' : 'err') + '"><span class="ico">' + (r.ok ? '✓' : '✗') + '</span><span><span class="mono">' + esc(r.text) + '</span><br><span class="small">' + esc(r.msg) + '</span></span></li>';
    }).join('') + '</ul>' +
      (out.results.some(function (r) { return r.ok; })
        ? '<div class="row between small changed-sum"><span>' + (out.changed.length ? out.changed.length + ' assignment(s) changed: ' + out.changed.join(', ') : 'No bus assignment changed (times updated).') + '</span><button class="btn small-btn primary" data-action="goto" data-tab="plan">View plan →</button></div>'
        : '') +
      (out.results.some(function (r) { return !r.ok; }) ? '<p class="muted small">Supported: ' + Parser.HELP.map(esc).join(' · ') + '</p>' : '');
    var ok = out.results.every(function (r) { return r.ok; });
    if (ok) $('#disruptText').value = ''; else $('#disruptText').value = text;
  }

  /* ---------- render: plan ---------- */
  function renderPlan() {
    var el = $('#view-plan');
    var m = plan.metrics;
    var all = [];
    plan.buses.forEach(function (b) { b.trips.forEach(function (tr) { tr.r.segs.forEach(function (s) { all.push(s.start, s.end); }); }); });
    var t0 = Math.floor((Math.min.apply(null, all.length ? all : [360]) - 5) / 10) * 10;
    var t1 = Math.ceil((Math.max.apply(null, all.length ? all : [420]) + 5) / 10) * 10;
    var span = t1 - t0;
    function pct(x) { return ((x - t0) / span * 100).toFixed(2) + '%'; }
    function w(a, b2) { return ((b2 - a) / span * 100).toFixed(2) + '%'; }
    var ticks = '';
    for (var x = t0; x <= t1; x += 10) ticks += '<span class="tick" style="left:' + pct(x) + '">' + fmt(x) + '</span>';

    var counts = { open: 0, accepted: 0, overruled: 0 };
    S.tasks.forEach(function (t) { var s = statusOf(t.id); if (counts[s] != null) counts[s]++; });
    var changed = (S.lastChange && S.lastChange.changed) || [];

    var busBlocks = plan.buses.map(function (b) {
      var src = busById(b.id);
      var out = busOutLabel(src);
      var bars = '';
      if (src.outFrom != null) bars += '<div class="seg seg-out" style="left:' + pct(Math.max(t0, src.outFrom || t0)) + ';width:' + w(Math.max(t0, src.outFrom || t0), t1) + '" title="' + out + '"></div>';
      b.trips.forEach(function (tr) {
        tr.r.segs.forEach(function (s) {
          if (s.end <= s.start) return;
          var ids = tr.tasks.map(function (x) { return x.id; }).join('+');
          var late = tr.r.late > 0;
          var title = s.type === 'empty' ? 'Empty drive ' + s.from + ' → ' + s.to + ' (' + (s.end - s.start) + ' min)'
            : s.type === 'wait' ? 'Waiting at ' + s.at + ' for crew'
            : ids + ': ' + tr.r.route.join(' → ') + ' ' + fmt(s.start) + '–' + fmt(s.end);
          bars += '<div class="seg seg-' + s.type + (late && s.type === 'service' ? ' seg-late' : '') + (tr.tasks[0].dir === 'ARR' && s.type === 'service' ? ' seg-arr' : '') +
            '" style="left:' + pct(s.start) + ';width:' + w(s.start, s.end) + '" title="' + esc(title) + '">' + (s.type === 'service' ? '<span>' + ids + '</span>' : '') + '</div>';
        });
      });
      var empty = b.trips.reduce(function (s, tr) { return s + tr.r.empty; }, 0);
      var rows = '';
      b.trips.forEach(function (tr) {
        tr.tasks.forEach(function (t) {
          var a = plan.byTask[t.id], st = statusOf(t.id);
          var res = a.res;
          var times = t.dir === 'DEP'
            ? 'board ' + fmt(res.pickupAt) + ' → aircraft ' + fmt(res.doneAt)
            : 'pick-up ' + fmt(res.pickupAt) + ' → Crew Ctr ' + fmt(res.doneAt);
          var badge = st === 'accepted' ? '<span class="tag tag-ok">✓ Accepted</span>'
            : st === 'overruled' ? '<span class="tag tag-warn">Overruled → ' + a.bus + '</span>' : '';
          var actions = st === 'overruled'
            ? '<button class="btn small-btn" data-action="revert" data-id="' + t.id + '">Back to copilot</button>'
            : st === 'accepted'
              ? '<button class="btn small-btn ghost" data-action="unaccept" data-id="' + t.id + '">Undo</button><button class="btn small-btn" data-action="overrule" data-id="' + t.id + '">Overrule</button>'
              : '<button class="btn small-btn primary" data-action="accept" data-id="' + t.id + '">Accept</button><button class="btn small-btn" data-action="overrule" data-id="' + t.id + '">Overrule</button>';
          rows += '<div class="assign ' + (res.late ? 'is-late ' : '') + (changed.indexOf(t.id) >= 0 ? 'is-changed ' : '') + 'st-' + st + '">' +
            '<div class="a-main"><div class="a-head"><span class="mono strong">' + t.id + '</span> <span class="mono">' + esc(t.flight) + '</span> <span class="dir dir-' + t.dir + '">' + t.dir + '</span> ' +
              '<span class="muted">' + esc(t.crew) + ' · ' + t.pax + ' pax · ' + esc(shortLoc(t.from)) + ' → ' + esc(shortLoc(t.to)) + '</span> ' +
              '<span class="mono time">' + times + '</span> <span class="mono due' + (res.late ? ' bad' : '') + '">due ' + fmt(t.due) + (res.late ? ' · +' + res.late + ' late' : ' · on time') + '</span>' +
              (changed.indexOf(t.id) >= 0 ? ' <span class="tag tag-info">changed</span>' : '') + ' ' + badge + '</div>' +
              '<div class="why"><span class="why-label">Why</span> ' + esc(why(t.id)) + '</div>' +
              (openOverrule === t.id ? overruleBox(t.id) : '') +
            '</div>' +
            '<div class="a-actions">' + actions + '</div></div>';
        });
      });
      if (!rows) rows = '<div class="assign idle muted">' + (out ? out + ' — no runs.' : 'No runs — on standby (kept free, saves empty driving).') + '</div>';
      return '<div class="bus card">' +
        '<div class="bus-head"><div><span class="bus-id">' + b.id + '</span> <span class="mono muted">' + b.driver + '</span> ' +
          '<span class="muted small">start ' + b.start + ' · shift ' + src.shift + '</span> ' + (out ? '<span class="tag tag-bad">' + out + '</span>' : '') + '</div>' +
          '<div class="muted small">' + b.trips.length + ' run(s) · ' + empty + ' min empty</div></div>' +
        '<div class="tl"><div class="tl-track">' + gridLines(t0, t1, pct) + bars + '</div></div>' +
        rows + '</div>';
    }).join('');

    var unassigned = plan.unassigned.length ? '<div class="card alert">No feasible bus for: ' + plan.unassigned.join(', ') + '. Check buses out of service or shift ends.</div>' : '';

    el.innerHTML =
      '<div class="card summary">' +
        '<div class="kpis">' +
          kpi('Crews on time', m.onTime + '/' + m.tasks, m.lateTasks ? 'bad' : 'good') +
          kpi('Late minutes', m.lateMin, m.lateMin ? 'bad' : 'good') +
          kpi('Empty driving', m.empty + ' min') +
          kpi('Buses used', m.busesUsed + '/' + S.buses.filter(function (b) { return b.outFrom !== 0; }).length) +
          kpi('Decisions', counts.accepted + ' accepted · ' + counts.overruled + ' overruled · ' + counts.open + ' open') +
        '</div>' +
        '<div class="row gap wrap">' +
          '<button class="btn primary" data-action="acceptAll"' + (counts.open ? '' : ' disabled') + '>Accept all open on-time proposals</button>' +
          '<button class="btn" data-action="goto" data-tab="input">+ Disruption</button>' +
        '</div>' +
        (S.lastChange ? '<p class="small changed-note">Last change: <span class="mono">' + esc(S.lastChange.text) + '</span>' + (changed.length ? ' — re-assigned: ' + changed.join(', ') : '') + '</p>' : '') +
        '<div class="legend small"><span><i class="lg lg-empty"></i>Empty drive</span><span><i class="lg lg-wait"></i>Waiting for crew</span><span><i class="lg lg-dep"></i>DEP run</span><span><i class="lg lg-arr"></i>ARR run</span><span><i class="lg lg-late"></i>Late</span><span><i class="lg lg-out"></i>Out of service</span></div>' +
        '<p class="muted small">Rule: crews ready within ' + RULES.shareWindow + ' min with nearby stops (≤ ' + RULES.nearbyMax + ' min apart) may share a bus, max ' + RULES.capacity + ' seats and ' + RULES.maxStops + ' stops, nobody late. Each run goes to the bus with the lowest score = ' + RULES.latePenalty + ' × late min + empty driving min.</p>' +
      '</div>' + unassigned +
      '<div class="tl-axis-wrap"><div class="tl-axis">' + ticks + '</div></div>' +
      busBlocks +
      '<p class="wc-inline small">Planning use only, no performance monitoring of drivers.</p>';
  }
  function gridLines(t0, t1, pct) { var s = ''; for (var x = t0; x <= t1; x += 10) s += '<i class="gl" style="left:' + pct(x) + '"></i>'; return s; }
  function kpi(label, val, cls) { return '<div class="kpi ' + (cls || '') + '"><div class="kpi-v">' + val + '</div><div class="kpi-l">' + label + '</div></div>'; }

  function overruleBox(id) {
    var cur = plan.byTask[id].bus;
    var opts = S.buses.filter(function (b) { return b.id !== cur && b.outFrom !== 0; }).map(function (b) {
      var ov = Object.assign({}, S.overrides); ov[id] = b.id;
      var p = E.planCopilot(S.tasks, S.buses, ov);
      var a = p.byTask[id];
      if (!a || a.bus !== b.id) return '<option disabled>' + b.id + ' (' + b.driver + ') — not feasible</option>';
      var d = p.metrics.lateMin - plan.metrics.lateMin, de = p.metrics.empty - plan.metrics.empty;
      return '<option value="' + b.id + '">' + b.id + ' (' + b.driver + ') — ' + (a.res.late ? a.res.late + ' min late' : 'on time') +
        ', plan: ' + (d ? (d > 0 ? '+' : '') + d + ' late min, ' : '') + (de >= 0 ? '+' : '') + de + ' empty min</option>';
    }).join('');
    return '<div class="overrule"><label class="small">Assign ' + id + ' to: <select id="ovSel">' + opts + '</select></label> ' +
      '<button class="btn small-btn primary" data-action="doOverrule" data-id="' + id + '">Confirm</button> ' +
      '<button class="btn small-btn ghost" data-action="cancelOverrule">Cancel</button>' +
      '<div class="muted small">The rest of the plan is re-optimised around your choice. Impact shown vs current plan.</div></div>';
  }

  /* ---------- render: overview ---------- */
  function renderOverview() {
    var el = $('#view-overview');
    var a = base.metrics, b = plan.metrics;
    var pure = E.planCopilot(S.tasks, S.buses, {}).metrics;
    var nOv = Object.keys(S.overrides).length;
    var rows = [
      metricRow('Crews on time', a.onTime + '/' + a.tasks, b.onTime + '/' + b.tasks, a.onTime, b.onTime, true, a.tasks),
      metricRow('Crew members on time', a.paxOnTime + '/' + a.pax, b.paxOnTime + '/' + b.pax, a.paxOnTime, b.paxOnTime, true, a.pax),
      metricRow('Late minutes', a.lateMin, b.lateMin, a.lateMin, b.lateMin, false),
      metricRow('Empty driving', a.empty + ' min · ' + a.emptyKm.toFixed(1) + ' km', b.empty + ' min · ' + b.emptyKm.toFixed(1) + ' km', a.empty, b.empty, false),
      metricRow('Total driving', a.drive + ' min · ' + a.km.toFixed(1) + ' km', b.drive + ' min · ' + b.km.toFixed(1) + ' km', a.drive, b.drive, false),
      metricRow('Buses used', a.busesUsed, b.busesUsed, a.busesUsed, b.busesUsed, false),
      metricRow('Bus runs', a.trips, b.trips, a.trips, b.trips, false),
      '<tr><th>Overrides</th><td class="mono">n/a<div class="muted small">no proposal to overrule</div></td><td class="mono">' + nOv + ' <span class="muted small">(' + (b.tasks ? Math.round(nOv / b.tasks * 100) : 0) + '% of tasks)</span></td><td class="muted small">' +
        (nOv ? 'Without overrides: ' + pure.lateMin + ' late min, ' + pure.empty + ' empty min' : 'Plan as proposed') + '</td></tr>'
    ].join('');

    var taskRows = S.tasks.slice().sort(function (x, y) { return x.ready - y.ready || (x.id < y.id ? -1 : 1); }).map(function (t) {
      var ta = base.byTask[t.id], tb = plan.byTask[t.id];
      function cell(as, isBase) {
        if (!as) return '<td colspan="3" class="bad">not served</td>';
        var tm = t.dir === 'DEP' ? as.res.doneAt : as.res.pickupAt;
        var share = as.trip.tasks.length > 1 ? ' <span class="tag">+' + as.trip.tasks.filter(function (x) { return x.id !== t.id; }).map(function (x) { return x.id; }).join('+') + '</span>' : '';
        var re = isBase && base.reassigned[t.id] ? ' <span class="tag tag-warn" title="No usable recorded bus; given to first bus able to reach the pickup">re-assigned</span>' : '';
        var ov = !isBase && S.overrides[t.id] ? ' <span class="tag tag-warn">override</span>' : '';
        return '<td class="mono">' + as.bus + re + ov + share + '</td><td class="mono">' + fmt(tm) + '</td><td class="mono ' + (as.res.late ? 'bad' : 'good') + '">' + (as.res.late ? '+' + as.res.late : '0') + '</td>';
      }
      return '<tr><td class="mono">' + t.id + '</td><td class="mono">' + esc(t.flight) + '</td><td><span class="dir dir-' + t.dir + '">' + t.dir + '</span></td><td class="mono">' + fmt(t.due) + '</td>' + cell(ta, true) + cell(tb, false) + '</tr>';
    }).join('');

    var disrupted = S.log.length;
    el.innerHTML =
      '<div class="card">' +
        '<div class="row between wrap"><h2>Same day, two ways</h2><span class="muted small">' + (disrupted ? 'Scenario: sample day + ' + disrupted + ' disruption(s): ' + esc(S.log.map(function (l) { return l.text; }).join('; ')) : 'Scenario: original sample day') + '</span></div>' +
        '<p class="muted small">Both columns are simulated with the same driving times, boarding (' + RULES.boarding + ' min) and drop-off (' + RULES.dropoff + ' min). Km assume an average ' + Math.round(RULES.kmPerMin * 60) + ' km/h on the apron.</p>' +
        '<div class="table-wrap"><table class="tbl compare"><thead><tr><th></th><th>Today’s dispatching<div class="muted small">dispatcher_bus column, one run per call</div></th><th>Copilot<div class="muted small">incl. dispatcher overrides</div></th><th>Difference</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (Object.keys(base.reassigned).length ? '<p class="small muted">Today’s column: ' + Object.keys(base.reassigned).map(function (k) { return k + ' → ' + base.reassigned[k]; }).join(', ') + ' had no usable recorded bus (added task or bus out of service) and went to the first bus able to reach the pickup, as in call-by-call dispatch.</p>' : '') +
      '</div>' +
      '<div class="grid-2">' +
        '<div class="card"><h2>Shadow pilot (90 days)</h2>' +
          '<p class="small">The copilot runs next to the dispatcher. Dispatchers keep deciding; every accept and overrule is counted. This view is the daily record to compare.</p>' +
          '<ul class="small checklist">' +
            '<li>Crews on time: copilot ≥ today on most days, including disrupted days</li>' +
            '<li>Empty km and buses used: clear, steady reduction</li>' +
            '<li>Override rate falling over time, and the reasons for overrides reviewed weekly</li>' +
          '</ul><p class="muted small">Example go-live criteria, to be agreed with operations and the works council.</p></div>' +
        '<div class="card"><h2>Decisions today</h2>' + decisionsSummary() + '</div>' +
      '</div>' +
      '<div class="card"><h2>Per task</h2><div class="table-wrap"><table class="tbl"><thead><tr><th rowspan="2">Task</th><th rowspan="2">Flight</th><th rowspan="2">Dir</th><th rowspan="2">Due</th><th colspan="3" class="grp">Today’s dispatching</th><th colspan="3" class="grp">Copilot</th></tr>' +
        '<tr><th>Bus</th><th>Time</th><th>Late</th><th>Bus</th><th>Time</th><th>Late</th></tr></thead><tbody>' + taskRows + '</tbody></table></div>' +
        '<p class="muted small">Time = at aircraft (DEP) or picked up (ARR).</p></div>';
  }
  function decisionsSummary() {
    var c = { open: 0, accepted: 0, overruled: 0, unassigned: 0 };
    S.tasks.forEach(function (t) { c[statusOf(t.id)]++; });
    var total = S.tasks.length || 1;
    function bar(n, cls) { return '<span class="dbar ' + cls + '" style="width:' + (n / total * 100) + '%"></span>'; }
    return '<div class="dbars">' + bar(c.accepted, 'ok') + bar(c.overruled, 'warn') + bar(c.open, 'open') + '</div>' +
      '<div class="small row gap wrap"><span><i class="lg lg-ok"></i>' + c.accepted + ' accepted</span><span><i class="lg lg-warn"></i>' + c.overruled + ' overruled</span><span><i class="lg lg-open"></i>' + c.open + ' open</span></div>' +
      (Object.keys(S.overrides).length ? '<p class="small">Overrides: ' + Object.keys(S.overrides).map(function (k) { return k + ' ' + (S.overrideFrom[k] || '?') + '→' + S.overrides[k]; }).join(', ') + '</p>' : '');
  }
  function metricRow(label, va, vb, na, nb, higherBetter, of) {
    var d = nb - na;
    var good = higherBetter ? d > 0 : d < 0, bad = higherBetter ? d < 0 : d > 0;
    var pctTxt = na && !of ? ' (' + (d > 0 ? '+' : '') + Math.round(d / na * 100) + '%)' : '';
    var max = Math.max(na, nb, of || 0) || 1;
    function bar(n, cls) { return '<div class="mbar"><span class="' + cls + '" style="width:' + (n / max * 100) + '%"></span></div>'; }
    return '<tr><th>' + label + '</th><td class="mono">' + va + bar(na, 'b-today') + '</td><td class="mono">' + vb + bar(nb, 'b-cop') + '</td>' +
      '<td class="mono ' + (good ? 'good' : bad ? 'bad' : 'muted') + '">' + (d === 0 ? 'same' : (d > 0 ? '+' : '') + d + pctTxt) + '</td></tr>';
  }

  /* ---------- wiring ---------- */
  function renderAll() {
    compute();
    // drop stale acceptances
    Object.keys(S.accepted).forEach(function (k) { if (!plan.byTask[k] || plan.byTask[k].bus !== S.accepted[k]) delete S.accepted[k]; });
    var keepText = $('#disruptText') ? $('#disruptText').value : '';
    var keepRes = $('#parseResult') ? $('#parseResult').innerHTML : '';
    renderInput(); renderPlan(); renderOverview();
    if (keepText) $('#disruptText').value = keepText;
    if (keepRes) $('#parseResult').innerHTML = keepRes;
    var open = S.tasks.filter(function (t) { return statusOf(t.id) === 'open'; }).length;
    $('#openBadge').textContent = open ? open + ' open' : '';
    showTab(tab);
    save();
  }
  function showTab(t) {
    tab = t;
    try { localStorage.setItem(STORE + '.tab', t); } catch (e) {}
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); });
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + t); });
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tab],[data-action]');
    if (!el) return;
    var act = el.dataset.action;
    if (!act && el.dataset.tab) { showTab(el.dataset.tab); window.scrollTo(0, 0); return; }
    var id = el.dataset.id;
    switch (act) {
      case 'goto': showTab(el.dataset.tab); window.scrollTo(0, 0); break;
      case 'apply': doApply(); break;
      case 'chip': $('#disruptText').value = el.dataset.text; $('#disruptText').focus(); break;
      case 'undo': doApply('undo'); break;
      case 'reset':
        if (!el.dataset.armed) {
          el.dataset.armed = '1'; el.textContent = 'Click again to reset';
          setTimeout(function () { if (el.isConnected) { delete el.dataset.armed; el.textContent = 'Reset day'; } }, 4000);
          break;
        }
        $('#disruptText').value = ''; doApply('reset'); $('#parseResult').innerHTML = ''; toast('Back to the original sample day.');
        break;
      case 'accept': S.accepted[id] = plan.byTask[id].bus; renderAll(); break;
      case 'unaccept': delete S.accepted[id]; renderAll(); break;
      case 'acceptAll':
        var n = 0;
        S.tasks.forEach(function (t) { if (statusOf(t.id) === 'open' && plan.byTask[t.id].res.late === 0) { S.accepted[t.id] = plan.byTask[t.id].bus; n++; } });
        renderAll(); toast(n + ' proposal(s) accepted.'); break;
      case 'overrule': openOverrule = id; renderPlan(); break;
      case 'cancelOverrule': openOverrule = null; renderPlan(); break;
      case 'doOverrule':
        var sel = $('#ovSel'); if (!sel || !sel.value) return;
        S.overrideFrom[id] = S.overrideFrom[id] || plan.byTask[id].bus;
        S.overrides[id] = sel.value; delete S.accepted[id]; openOverrule = null;
        S.lastChange = null;
        renderAll(); toast(id + ' overruled → ' + sel.value + '. Plan re-optimised.'); break;
      case 'revert':
        delete S.overrides[id]; delete S.overrideFrom[id]; renderAll(); toast(id + ' back to copilot proposal.'); break;
    }
  });

  renderAll();
})();
