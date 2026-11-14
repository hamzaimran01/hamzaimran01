(function () {
  var E = Engine, fmt = E.fmt;
  var STORE = 'crewBusCopilot.v1';
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= storage & state ================= */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

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
  function load() { try { var s = JSON.parse(lsGet(STORE)); if (s && s.tasks && s.buses) return s; } catch (e) {} return null; }
  function save() { lsSet(STORE, JSON.stringify(S)); }
  function snapshot() { var c = JSON.parse(JSON.stringify(S)); delete c.history; return c; }

  var S = load() || freshScenario();
  var TABS = ['input', 'plan', 'live', 'overview'];
  var tab = lsGet(STORE + '.tab'); if (TABS.indexOf(tab) < 0) tab = 'live';
  var openOverrule = null, plan, base, sel = null;
  var UI = { prev: {}, enterTab: true, justAccepted: null, flash: false };

  function compute() {
    plan = E.planCopilot(S.tasks, S.buses, S.overrides);
    base = E.planBaseline(S.tasks, S.buses);
  }

  /* ================= helpers ================= */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function task(id) { return S.tasks.filter(function (t) { return t.id === id; })[0]; }
  function busById(id) { return S.buses.filter(function (b) { return b.id === id; })[0]; }
  function busOutLabel(b) { return b.outFrom === 0 ? 'Out of service' : (b.outFrom != null ? 'Out of service from ' + fmt(b.outFrom) : ''); }
  function shortLoc(l) { return l.replace('Crew Center', 'Crew Ctr'); }
  function ids(a) { return a.join('+'); }
  function tids(tr) { return tr.tasks.map(function (x) { return x.id; }); }
  function statusOf(id) {
    var a = plan.byTask[id];
    if (!a) return 'unassigned';
    if (S.overrides[id]) return 'overruled';
    if (S.accepted[id] === a.bus) return 'accepted';
    return 'open';
  }
  function tip(text) { return '<button type="button" class="tip" data-tip="' + esc(text) + '" aria-label="' + esc(text) + '">?</button>'; }
  function intro(title, text, extra) { return '<div class="page-intro"><div><h1>' + title + '</h1><p>' + text + '</p></div>' + (extra || '') + '</div>'; }
  function icon(name) {
    var P = {
      list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="4" cy="18" r="1.2"/>',
      plan: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h6M7 13h10M7 17h4"/>',
      map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
      chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
      bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4l2-2z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
      help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6"/>',
      bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
      bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16"/><circle cx="8" cy="20" r="1.4"/><circle cx="16" cy="20" r="1.4"/>',
      plane: '<path d="M10 4l2 0 3 7 5 1v2l-5 1-3 7h-2l1-7-5-1-2 2H3l1-3-1-3h1l2 2 5-1z"/>',
      user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
      play: '<path d="M7 4v16l13-8z"/>',
      pause: '<path d="M7 4h4v16H7zM13 4h4v16h-4z"/>',
      x: '<path d="M6 6l12 12M18 6 6 18"/>',
      warn: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5"/><circle cx="12" cy="18" r=".7"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.5" r=".7"/>',
      check: '<path d="m5 12 5 5 9-10"/>'
    };
    return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (P[name] || '') + '</svg>';
  }
  function hud(msg, kind) {
    var el = $('#toast'); el.innerHTML = icon(kind === 'ok' ? 'check' : 'info') + '<span>' + esc(msg) + '</span>';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(hud._t); hud._t = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  /* ================= alerts ================= */
  var A = { list: [], unread: 0, popups: lsGet(STORE + '.popups') !== 'off', fired: {}, lastT: null, sig: '', seq: 0, quiet: true, open: false };
  function pushAlert(o) {
    if (o.key) { if (A.fired[o.key]) return; A.fired[o.key] = 1; }
    o.id = ++A.seq; o.clock = o.clock || null; o.read = false;
    A.list.unshift(o); if (A.list.length > 60) A.list.pop();
    A.unread++; renderBell(true);
    if (A.popups && !A.quiet) showPopup(o);
    if (A.open) renderAlertCenter();
  }
  function showPopup(o) {
    var stack = $('#alertStack');
    while (stack.children.length >= 3) stack.removeChild(stack.firstChild);
    var el = document.createElement('div');
    el.className = 'popup sev-' + o.sev;
    el.setAttribute('role', o.sev === 'critical' ? 'alert' : 'status');
    el.innerHTML = '<div class="popup-ic">' + icon(o.sev === 'info' ? 'info' : 'warn') + '</div>' +
      '<div class="popup-body"><div class="popup-title">' + esc(o.title) + '</div><div class="popup-text">' + esc(o.body) + '</div>' +
      (o.clock != null ? '<div class="popup-time">' + fmt(o.clock) + ' · ' + (o.sev === 'critical' ? 'Needs action' : o.sev === 'warning' ? 'Watch' : 'Update') + '</div>' : '') + '</div>' +
      '<div class="popup-act">' + (o.sel ? '<button class="btn small-btn tinted" data-action="alertView" data-alert="' + o.id + '">View</button>' : '') +
      '<button class="icon-btn" data-action="popClose" aria-label="Dismiss">' + icon('x') + '</button></div>';
    stack.appendChild(el);
    var life = o.sev === 'critical' ? 10000 : 7000;
    setTimeout(function () { closePopup(el); }, life);
  }
  function closePopup(el) {
    if (!el || !el.parentNode || el.classList.contains('out')) return;
    el.classList.add('out');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, RM ? 0 : 260);
  }
  function renderBell(bump) {
    var b = $('#bellCount'); b.textContent = A.unread > 9 ? '9+' : (A.unread || '');
    b.hidden = !A.unread;
    if (bump && !RM) { var bell = $('#bellBtn'); bell.classList.remove('ring'); void bell.offsetWidth; bell.classList.add('ring'); }
  }
  function renderAlertCenter() {
    var p = $('#alertPanel');
    p.innerHTML = '<div class="ap-head"><h3>Alerts</h3><div class="row gap">' +
      '<label class="switch small"><input type="checkbox" id="popupToggle"' + (A.popups ? ' checked' : '') + '> <span>Pop-ups</span></label>' +
      (A.list.length ? '<button class="btn small-btn plain" data-action="alertsClear">Clear</button>' : '') + '</div></div>' +
      (A.list.length ? '<ul class="ap-list">' + A.list.map(function (o) {
        return '<li class="sev-' + o.sev + (o.read ? '' : ' unread') + '"><button class="ap-item" data-action="alertView" data-alert="' + o.id + '">' +
          '<span class="ap-dot"></span><span class="ap-main"><span class="ap-title">' + esc(o.title) + '</span><span class="ap-text">' + esc(o.body) + '</span></span>' +
          '<span class="ap-time mono">' + (o.clock != null ? fmt(o.clock) : '') + '</span></button></li>';
      }).join('') + '</ul>' : '<div class="empty-state">' + icon('bell') + '<p>No alerts yet.</p><p class="muted small">Play the live map or add a disruption. Late risks, tight connections and breakdowns show up here.</p></div>');
  }
  function toggleAlertCenter(force) {
    A.open = force != null ? force : !A.open;
    var p = $('#alertPanel');
    if (A.open) { renderAlertCenter(); p.hidden = false; A.list.forEach(function (o) { o.read = true; }); A.unread = 0; renderBell(false); }
    else p.hidden = true;
    $('#bellBtn').setAttribute('aria-expanded', A.open);
  }
  function resetLiveKeys() { Object.keys(A.fired).forEach(function (k) { if (/^(late|tight|out|na):/.test(k)) delete A.fired[k]; }); }

  function evaluateAlerts(t) {
    var p = livePlan(), src = L.source;
    var sig = src + JSON.stringify(S.overrides) + S.log.length + S.tasks.length;
    if (sig !== A.sig) { A.sig = sig; resetLiveKeys(); }
    if (A.lastT != null && t < A.lastT - 0.5) resetLiveKeys();
    A.lastT = t;
    S.tasks.forEach(function (tk) {
      var a = p.byTask[tk.id];
      if (!a) { pushAlert({ sev: 'critical', key: 'na:' + src + tk.id, title: tk.id + ' ' + tk.flight + ' has no bus', body: 'No bus can reach this crew within its shift. Bring a bus back into service or change the task.', sel: { kind: 'task', id: tk.id }, clock: t }); return; }
      var r = a.res, key = tk.dir === 'DEP' ? r.doneAt : r.pickupAt, slack = tk.due - key, lead = a.trip.r.start - t;
      if (t >= key) return;
      if (r.late > 0 && lead <= 10) pushAlert({ sev: 'critical', key: 'late:' + src + tk.id, clock: t, sel: { kind: 'task', id: tk.id },
        title: tk.id + ' · ' + tk.flight + ' will be ' + r.late + ' min late',
        body: 'Bus ' + a.bus + ' gets the crew ' + (tk.dir === 'DEP' ? 'to the aircraft' : 'picked up') + ' at ' + fmt(key) + ', due ' + fmt(tk.due) + '.' });
      else if (r.late === 0 && slack <= 1 && lead <= 5) pushAlert({ sev: 'warning', key: 'tight:' + src + tk.id, clock: t, sel: { kind: 'task', id: tk.id },
        title: tk.id + ' · ' + tk.flight + ': ' + (slack <= 0 ? 'no' : slack + ' min') + ' spare',
        body: 'Bus ' + a.bus + ' is on time, but any delay makes this crew late.' });
    });
    S.buses.forEach(function (b) {
      if (b.outFrom != null && t >= b.outFrom) pushAlert({ sev: 'critical', key: 'out:' + b.id + ':' + b.outFrom, clock: Math.max(t, b.outFrom), sel: { kind: 'bus', id: b.id },
        title: 'Bus ' + b.id + ' out of service', body: 'Its runs were moved to other buses in the plan.' });
    });
    A.quiet = false;
  }

  /* ================= disruptions ================= */
  function applyText(text) {
    var cmds = Parser.parse(text);
    if (!cmds.length) return { results: [], changed: [] };
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
      if (c.type === 'reset') { S = freshScenario(); results.push({ ok: true, text: c.text, msg: 'Back to the original sample day. Decisions cleared.' }); return; }
      var snap = snapshot();
      var r = applyCmd(c);
      results.push({ ok: r.ok, text: c.text, msg: r.msg, type: c.type });
      if (r.ok) { S.history.push(snap); if (S.history.length > 30) S.history.shift(); S.log.push({ text: c.text, msg: r.msg }); }
    });
    compute();
    var changed = [];
    Object.keys(plan.byTask).forEach(function (k) { if (before[k] !== plan.byTask[k].bus) changed.push(k); });
    var oks = results.filter(function (r) { return r.ok; });
    if (oks.length) {
      S.lastChange = { text: oks.map(function (r) { return r.text; }).join('; '), changed: changed };
      UI.flash = true;
      pushAlert({ sev: 'info', title: 'Plan updated: ' + S.lastChange.text,
        body: changed.length ? changed.length + ' crew task(s) moved to another bus: ' + changed.join(', ') + '.' : 'No crew task had to change bus.',
        sel: changed.length ? { kind: 'task', id: changed[0] } : null, clock: L.mode === 'real' ? null : L.t });
    }
    save();
    return { results: results, changed: changed };
  }

  function applyCmd(c) {
    if (c.type === 'delay') {
      var ts = S.tasks.filter(function (t) { return t.flight === c.flight; });
      if (!ts.length) return { ok: false, msg: 'No crew task for ' + c.flight + ' today. Flights in this sample: ' + uniqFlights().join(', ') + '.' };
      ts.forEach(function (t) {
        t.ready += c.minutes; t.due += c.minutes;
        var d = t.ready - t.origReady;
        t.flags = t.flags.filter(function (f) { return !/^delay/.test(f); });
        if (d) t.flags.push('delay ' + (d > 0 ? '+' : '') + d + ' min');
      });
      return { ok: true, msg: c.flight + ': ' + ts.map(function (t) { return t.id; }).join(', ') + ' moved ' + (c.minutes > 0 ? '+' : '') + c.minutes + ' min.' };
    }
    if (c.type === 'busOut' || c.type === 'busBack') {
      var b = busById(c.bus);
      if (!b) return { ok: false, msg: 'There is no bus ' + c.bus + '. Buses: ' + S.buses.map(function (x) { return x.id; }).join(', ') + '.' };
      if (c.type === 'busBack') {
        if (b.outFrom == null) return { ok: false, msg: c.bus + ' is already in service.' };
        b.outFrom = null; return { ok: true, msg: c.bus + ' is back in service.' };
      }
      b.outFrom = c.at ? E.toMin(c.at) : 0;
      var freed = [];
      Object.keys(S.overrides).forEach(function (k) { if (S.overrides[k] === c.bus) { delete S.overrides[k]; delete S.overrideFrom[k]; freed.push(k); } });
      return { ok: true, msg: c.bus + ' out of service' + (c.at ? ' from ' + c.at + ' (earlier runs kept)' : '') + '. Its runs were re-planned.' + (freed.length ? ' Overrides removed: ' + freed.join(', ') + '.' : '') };
    }
    if (c.type === 'cancel') {
      var idl = S.tasks.filter(function (t) { return t.flight === c.flight; }).map(function (t) { return t.id; });
      if (!idl.length) return { ok: false, msg: 'No crew task for ' + c.flight + '.' };
      S.tasks = S.tasks.filter(function (t) { return t.flight !== c.flight; });
      idl.forEach(function (k) { delete S.overrides[k]; delete S.overrideFrom[k]; delete S.accepted[k]; });
      if (sel && sel.kind === 'task' && idl.indexOf(sel.id) >= 0) sel = null;
      return { ok: true, msg: c.flight + ' cancelled: ' + idl.join(', ') + ' removed.' };
    }
    if (c.type === 'add') {
      var t = c.task, r = E.toMin(t.ready), d = E.toMin(t.due);
      if (d <= r) return { ok: false, msg: 'The due time must be after the ready time.' };
      if (t.pax < 1 || t.pax > RULES.capacity) return { ok: false, msg: 'Crew size must be 1–' + RULES.capacity + ' (one bus). Split larger crews into two tasks.' };
      if (t.dispatcherBus && !busById(t.dispatcherBus)) return { ok: false, msg: 'There is no bus ' + t.dispatcherBus + '.' };
      var id = 'T' + String(S.nextId++).padStart(2, '0');
      S.tasks.push(Object.assign({}, t, { id: id, ready: r, due: d, origReady: r, origDue: d, flags: ['added'] }));
      return { ok: true, msg: id + ' added: ' + t.flight + ' ' + t.dir + ', ' + t.pax + ' crew, ' + t.from + ' → ' + t.to + ', ready ' + t.ready + ', due ' + t.due + '.' + (c.assumed.length ? ' Assumed ' + c.assumed.join(', ') + '.' : '') };
    }
    return { ok: false, msg: 'Not understood.' };
  }
  function uniqFlights() { var f = []; S.tasks.forEach(function (t) { if (f.indexOf(t.flight) < 0) f.push(t.flight); }); return f; }

  /* ================= "why" line ================= */
  function why(id) {
    var a = plan.byTask[id], dec = plan.decisions[id], t = task(id);
    if (!a) return 'No bus can serve this task within its shift.';
    var tr = a.trip, res = a.res;
    var others = tr.tasks.filter(function (x) { return x.id !== id; });
    var prev = tr.index > 0 ? plan.buses.filter(function (x) { return x.id === a.bus; })[0].trips[tr.index - 1] : null;
    var parts = [];
    if (S.overrides[id]) parts.push('You overruled the copilot (it proposed ' + (S.overrideFrom[id] || '?') + ')');
    parts.push(a.bus + (prev ? ' is free at ' + tr.startLoc + ' after ' + ids(tids(prev)) + ' (' + fmt(tr.startAvail) + ')' : ' starts at ' + tr.startLoc) + ', so it drives ' + tr.r.empty + ' min empty');
    if (others.length) {
      var pax = tr.tasks.reduce(function (s, x) { return s + x.pax; }, 0), n = tr.r.route.length - 1;
      parts.push('shares the bus with ' + ids(others.map(function (x) { return x.id; })) + ' (' + pax + ' of ' + RULES.capacity + ' seats, ' + n + (t.dir === 'DEP' ? ' drop-off' : ' pickup') + (n > 1 ? 's' : '') + ')');
    }
    parts.push((t.dir === 'DEP' ? 'crew at the aircraft ' + fmt(res.doneAt) : 'crew picked up ' + fmt(res.pickupAt)) + ', due ' + fmt(t.due) + (res.late ? ' (' + res.late + ' min late)' : ''));
    var s = parts.join('; ') + '.';
    if (dec && dec.runner && !S.overrides[id]) s += ' Score ' + dec.score + ', next best ' + dec.runner.bus + ' ' + dec.runner.score + (dec.runner.score === dec.score ? ' with more driving' : '') + '.';
    else if (dec && !dec.runner && !S.overrides[id]) s += ' No other bus can do it.';
    return s;
  }

  /* ================= tab 1: tasks ================= */
  function renderInput() {
    var el = $('#view-input');
    var rows = S.tasks.slice().sort(function (a, b) { return a.ready - b.ready || (a.id < b.id ? -1 : 1); }).map(function (t, i) {
      var a = plan.byTask[t.id], late = a && a.res.late;
      var cls = (t.flags.length ? 'changed ' : '') + (late ? 'late ' : '') + (UI.flash && S.lastChange && S.lastChange.changed.indexOf(t.id) >= 0 ? 'flash' : '');
      return '<tr class="' + cls + '" style="--i:' + i + '"><td><button class="link mono strong" data-select="task:' + t.id + '" data-goto="live">' + t.id + '</button></td><td class="mono">' + esc(t.flight) + '</td>' +
        '<td><span class="dir dir-' + t.dir + '">' + t.dir + '</span></td><td>' + esc(t.crew) + '</td><td class="num">' + t.pax + '</td>' +
        '<td>' + esc(t.from) + ' → ' + esc(t.to) + '</td><td class="mono">' + timeCell(t.ready, t.origReady) + '</td><td class="mono">' + timeCell(t.due, t.origDue) + '</td>' +
        '<td class="mono">' + (t.dispatcherBus || '<span class="muted">—</span>') + '</td>' +
        '<td class="mono">' + (a ? '<span class="strong">' + a.bus + '</span>' : '<span class="bad">none</span>') + '</td>' +
        '<td>' + t.flags.map(function (f) { return '<span class="tag tag-info">' + esc(f) + '</span>'; }).join(' ') + (late ? ' <span class="tag tag-bad">' + late + ' min late</span>' : '') + '</td></tr>';
    }).join('');
    var busRows = S.buses.map(function (b) {
      var out = busOutLabel(b);
      return '<li class="bus-li' + (out ? ' out' : '') + '"><span class="bus-chip mono">' + b.id + '</span><span class="muted small">' + b.driver + ' · starts at ' + b.start + ' · ' + b.shift + '</span>' +
        (out ? '<span class="tag tag-bad">' + out + '</span>' : '<span class="tag tag-ok">In service</span>') + '</li>';
    }).join('');
    var log = S.log.length ? S.log.slice().reverse().map(function (l) { return '<li><span class="mono">' + esc(l.text) + '</span><span class="muted small">' + esc(l.msg) + '</span></li>'; }).join('')
      : '<li class="muted small">Nothing yet. The plan is for the original sample day.</li>';

    el.innerHTML =
      intro('Crew tasks', 'Every row is a crew that needs a bus: to its aircraft (<b>DEP</b>arture) or back from it (<b>ARR</b>ival). Something changed on the apron? Describe it in plain words below and the plan updates.') +
      '<div class="grid-2">' +
        '<section class="card disrupt">' +
          '<h2>Report a disruption ' + tip('Type what happened, the way you would say it on the radio. The copilot re-plans every bus instantly.') + '</h2>' +
          '<div class="composer"><textarea id="disruptText" rows="2" placeholder="e.g. LH400 delayed 30 min" aria-label="Disruption"></textarea>' +
          '<button class="btn primary" data-action="apply">' + icon('bolt') + ' Update plan</button></div>' +
          '<div class="chips"><span class="muted small">Try</span>' +
            ['LH400 delayed 30 min', 'B03 broke down', 'B05 out of service from 06:30', 'add task LH999 DEP 6 crew Crew Center to Pier A ready 06:30 due 06:45', 'cancel LH1500']
              .map(function (x) { return '<button class="chip" data-action="chip" data-text="' + esc(x) + '">' + esc(x) + '</button>'; }).join('') +
          '</div>' +
          '<div id="parseResult" aria-live="polite"></div>' +
          '<div class="row gap wrap foot-actions">' +
            '<button class="btn plain" data-action="undo"' + (S.history.length ? '' : ' disabled') + '>Undo last change</button>' +
            '<button class="btn plain danger" data-action="reset">Reset day</button>' +
            '<details class="help"><summary>What can I type?</summary><ul>' + Parser.HELP.map(function (h) { return '<li class="mono">' + esc(h) + '</li>'; }).join('') +
            '</ul><p class="muted small">No due time? We assume ready + 15 min (DEP) or + 10 min (ARR). No crew size? We assume 6. A bus out of service without a time is out all day.</p></details>' +
          '</div>' +
        '</section>' +
        '<section class="card"><h2>Changes today</h2><ul class="log">' + log + '</ul>' +
          '<h3>Buses</h3><ul class="bus-list">' + busRows + '</ul></section>' +
      '</div>' +
      '<section class="card"><div class="row between wrap"><h2>All crew tasks <span class="muted">' + S.tasks.length + '</span></h2>' +
        '<button class="btn tinted" data-goto="plan">See the copilot plan →</button></div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>Task</th><th>Flight</th><th>Type ' + tip('DEP: take the crew from the Crew Center to their departing aircraft. ARR: pick an arriving crew up at the aircraft and bring them back.') + '</th><th>Crew</th><th class="num">People</th><th>From → to</th>' +
        '<th>Ready ' + tip('The crew can board the bus from this time.') + '</th><th>Due ' + tip('DEP: crew must be at the aircraft by this time. ARR: crew must be picked up by this time.') + '</th>' +
        '<th>Dispatcher’s bus ' + tip('The bus today’s dispatcher assigned by phone.') + '</th><th>Copilot’s bus</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';

    $('#disruptText').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doApply(); } });
  }
  function timeCell(now, orig) { return now !== orig ? '<span class="strike">' + fmt(orig) + '</span> ' + fmt(now) : fmt(now); }

  function doApply(textOverride) {
    var ta = $('#disruptText');
    var text = textOverride != null ? textOverride : (ta ? ta.value : '');
    if (!text.trim()) { if (ta) ta.focus(); return null; }
    var out = applyText(text);
    renderAll();
    var box = $('#parseResult');
    if (box) {
      box.innerHTML = '<ul class="results">' + out.results.map(function (r, i) {
        return '<li class="' + (r.ok ? 'ok' : 'err') + '" style="--i:' + i + '"><span class="res-ic">' + icon(r.ok ? 'check' : 'warn') + '</span><span><span class="mono">' + esc(r.text) + '</span><br><span class="small">' + esc(r.msg) + '</span></span></li>';
      }).join('') + '</ul>' +
        (out.results.some(function (r) { return r.ok; })
          ? '<div class="changed-sum"><span>' + (out.changed.length ? out.changed.length + ' task(s) moved to another bus: ' + out.changed.join(', ') : 'No bus changed, times updated.') + '</span><span class="row gap"><button class="btn small-btn tinted" data-goto="plan">Plan</button><button class="btn small-btn primary" data-goto="live">Live map</button></span></div>' : '') +
        (out.results.some(function (r) { return !r.ok; }) ? '<p class="muted small">You can type: ' + Parser.HELP.map(esc).join(' · ') + '</p>' : '');
      var ok = out.results.every(function (r) { return r.ok; });
      $('#disruptText').value = ok ? '' : text;
    }
    return out;
  }

  /* ================= tab 2: plan ================= */
  function kpiNum(key, n, suffix, cls, label) {
    var from = UI.prev[key] != null ? UI.prev[key] : n; UI.prev[key] = n;
    return '<div class="kpi ' + (cls || '') + '"><div class="kpi-v"><span class="count" data-from="' + from + '" data-to="' + n + '">' + n + '</span>' + (suffix || '') + '</div><div class="kpi-l">' + label + '</div></div>';
  }
  function animateCounts(root) {
    if (RM) return;
    $$('.count', root).forEach(function (el) {
      var a = +el.dataset.from, b = +el.dataset.to;
      if (a === b) return;
      var t0 = performance.now(), dur = 600;
      (function step(now) {
        var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(a + (b - a) * e);
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
  }

  function renderPlan() {
    var el = $('#view-plan');
    var m = plan.metrics, all = [];
    plan.buses.forEach(function (b) { b.trips.forEach(function (tr) { tr.r.segs.forEach(function (s) { all.push(s.start, s.end); }); }); });
    var t0 = Math.floor((Math.min.apply(null, all.length ? all : [360]) - 5) / 10) * 10;
    var t1 = Math.ceil((Math.max.apply(null, all.length ? all : [420]) + 5) / 10) * 10, span = t1 - t0;
    function pct(x) { return ((x - t0) / span * 100).toFixed(2) + '%'; }
    function w(a, b2) { return ((b2 - a) / span * 100).toFixed(2) + '%'; }
    var ticks = '';
    for (var x = t0; x <= t1; x += 10) ticks += '<span class="tick" style="left:' + pct(x) + '">' + fmt(x) + '</span>';
    var counts = { open: 0, accepted: 0, overruled: 0 };
    S.tasks.forEach(function (t) { var s = statusOf(t.id); if (counts[s] != null) counts[s]++; });
    var changed = (S.lastChange && S.lastChange.changed) || [];
    var n = 0;

    var busBlocks = plan.buses.map(function (b) {
      var src = busById(b.id), out = busOutLabel(src), bars = '';
      if (src.outFrom != null) bars += '<div class="seg seg-out" style="left:' + pct(Math.max(t0, src.outFrom || t0)) + ';width:' + w(Math.max(t0, src.outFrom || t0), t1) + '"></div>';
      b.trips.forEach(function (tr) {
        tr.r.segs.forEach(function (s) {
          if (s.end <= s.start) return;
          var title = s.type === 'empty' ? 'Empty drive ' + s.from + ' → ' + s.to + ' (' + (s.end - s.start) + ' min)' : s.type === 'wait' ? 'Waiting at ' + s.at + ' for the crew' : ids(tids(tr)) + ': ' + tr.r.route.join(' → ') + ' ' + fmt(s.start) + '–' + fmt(s.end);
          bars += '<div class="seg seg-' + s.type + (tr.r.late > 0 && s.type === 'service' ? ' seg-late' : '') + (tr.tasks[0].dir === 'ARR' && s.type === 'service' ? ' seg-arr' : '') +
            '" style="left:' + pct(s.start) + ';width:' + w(s.start, s.end) + '" title="' + esc(title) + '">' + (s.type === 'service' ? '<span>' + ids(tids(tr)) + '</span>' : '') + '</div>';
        });
      });
      var empty = b.trips.reduce(function (s, tr) { return s + tr.r.empty; }, 0), rows = '';
      b.trips.forEach(function (tr) {
        tr.tasks.forEach(function (t) {
          var a = plan.byTask[t.id], st = statusOf(t.id), res = a.res;
          var times = t.dir === 'DEP' ? 'boards ' + fmt(res.pickupAt) + ' · at aircraft ' + fmt(res.doneAt) : 'picked up ' + fmt(res.pickupAt) + ' · at Crew Ctr ' + fmt(res.doneAt);
          var badge = st === 'accepted' ? '<span class="tag tag-ok' + (UI.justAccepted === t.id ? ' pop' : '') + '">' + icon('check') + ' Accepted</span>'
            : st === 'overruled' ? '<span class="tag tag-warn">Overruled → ' + a.bus + '</span>' : '';
          var actions = st === 'overruled' ? '<button class="btn small-btn plain" data-action="revert" data-id="' + t.id + '">Back to copilot</button>'
            : st === 'accepted' ? '<button class="btn small-btn plain" data-action="unaccept" data-id="' + t.id + '">Undo</button><button class="btn small-btn" data-action="overrule" data-id="' + t.id + '">Overrule</button>'
            : '<button class="btn small-btn primary" data-action="accept" data-id="' + t.id + '">Accept</button><button class="btn small-btn" data-action="overrule" data-id="' + t.id + '">Overrule</button>';
          rows += '<div class="assign ' + (res.late ? 'is-late ' : '') + (changed.indexOf(t.id) >= 0 ? 'is-changed ' : '') + (UI.flash && changed.indexOf(t.id) >= 0 ? 'flash ' : '') + 'st-' + st + '" style="--i:' + (n++) + '">' +
            '<div class="a-main"><div class="a-head"><button class="link mono strong" data-select="task:' + t.id + '" data-goto="live">' + t.id + '</button> <span class="mono">' + esc(t.flight) + '</span> <span class="dir dir-' + t.dir + '">' + t.dir + '</span> ' +
              '<span class="muted">' + esc(t.crew) + ' · ' + t.pax + ' people · ' + esc(shortLoc(t.from)) + ' → ' + esc(shortLoc(t.to)) + '</span></div>' +
              '<div class="a-time"><span class="mono">' + times + '</span> <span class="mono ' + (res.late ? 'bad' : 'muted') + '">due ' + fmt(t.due) + (res.late ? ' · ' + res.late + ' min late' : ' · on time') + '</span>' +
              (changed.indexOf(t.id) >= 0 ? ' <span class="tag tag-info">changed</span>' : '') + ' ' + badge + '</div>' +
              '<div class="why"><span class="why-label">Why</span>' + esc(why(t.id)) + '</div>' +
              (openOverrule === t.id ? overruleBox(t.id) : '') +
            '</div><div class="a-actions">' + actions + '</div></div>';
        });
      });
      if (!rows) rows = '<div class="assign idle muted small">' + (out ? out + '. No runs.' : 'No runs. Kept free as a reserve, which saves empty driving.') + '</div>';
      return '<section class="bus card">' +
        '<div class="bus-head"><div class="row gap wrap"><span class="bus-chip mono lg">' + b.id + '</span><span class="muted small">Driver ' + b.driver + ' · starts at ' + b.start + ' · shift ' + src.shift + '</span>' + (out ? '<span class="tag tag-bad">' + out + '</span>' : '') + '</div>' +
          '<div class="row gap"><span class="muted small">' + b.trips.length + ' run(s) · ' + empty + ' min empty</span><button class="btn small-btn plain" data-select="bus:' + b.id + '" data-goto="live">' + icon('map') + ' Show on map</button></div></div>' +
        '<div class="tl"><div class="tl-track">' + gridLines(t0, t1, pct) + bars + '</div></div>' + rows + '</section>';
    }).join('');

    el.innerHTML =
      intro('Copilot plan', 'The copilot proposes a bus for every crew and says why. Check each proposal and <b>Accept</b> it, or <b>Overrule</b> it and pick another bus; the rest of the plan adjusts around your choice.') +
      (plan.unassigned.length ? '<div class="card alert">No bus can serve ' + plan.unassigned.join(', ') + '. Check buses out of service or shift ends.</div>' : '') +
      '<section class="card summary">' +
        '<div class="kpis">' +
          kpiNum('p-on', m.onTime, '<span class="kpi-of">/' + m.tasks + '</span>', m.lateTasks ? 'bad' : 'good', 'Crews on time') +
          kpiNum('p-late', m.lateMin, ' <span class="kpi-of">min</span>', m.lateMin ? 'bad' : 'good', 'Late minutes') +
          kpiNum('p-empty', m.empty, ' <span class="kpi-of">min</span>', '', 'Empty driving ' + tip('Minutes a bus drives with nobody on board, to reach its next crew. Less is better.')) +
          kpiNum('p-bus', m.busesUsed, '<span class="kpi-of">/' + S.buses.filter(function (b) { return b.outFrom !== 0; }).length + '</span>', '', 'Buses needed') +
        '</div>' +
        '<div class="decision-bar"><div class="dbars" aria-hidden="true"><span class="dbar ok" style="width:' + (counts.accepted / (S.tasks.length || 1) * 100) + '%"></span><span class="dbar warn" style="width:' + (counts.overruled / (S.tasks.length || 1) * 100) + '%"></span></div>' +
          '<span class="small"><b>' + counts.accepted + '</b> accepted · <b>' + counts.overruled + '</b> overruled · <b>' + counts.open + '</b> to review</span>' +
          '<button class="btn primary small-btn" data-action="acceptAll"' + (counts.open ? '' : ' disabled') + '>Accept all on-time proposals</button></div>' +
        (S.lastChange ? '<p class="small changed-note">Last change: <span class="mono">' + esc(S.lastChange.text) + '</span>' + (changed.length ? '. Moved: ' + changed.join(', ') : '') + '</p>' : '') +
        '<details class="howto"><summary>How to read this page</summary>' +
          '<div class="legend small"><span><i class="lg lg-empty"></i>Driving empty</span><span><i class="lg lg-wait"></i>Waiting for crew</span><span><i class="lg lg-dep"></i>Crew to aircraft (DEP)</span><span><i class="lg lg-arr"></i>Crew back from aircraft (ARR)</span><span><i class="lg lg-late"></i>Late</span><span><i class="lg lg-out"></i>Out of service</span></div>' +
          '<p class="muted small">Rule: crews ready within ' + RULES.shareWindow + ' min, going to stops at most ' + RULES.nearbyMax + ' min apart, may share a bus (max ' + RULES.capacity + ' seats, ' + RULES.maxStops + ' stops, nobody late). Each run goes to the bus with the lowest score: ' + RULES.latePenalty + ' × late minutes + empty minutes. Being late counts 40 times more than driving empty.</p></details>' +
      '</section>' +
      '<div class="tl-axis-wrap"><div class="tl-axis">' + ticks + '</div></div>' + busBlocks +
      '<p class="wc-inline small">Planning use only, no performance monitoring of drivers.</p>';
  }
  function gridLines(t0, t1, pct) { var s = ''; for (var x = t0; x <= t1; x += 10) s += '<i class="gl" style="left:' + pct(x) + '"></i>'; return s; }

  function overruleBox(id) {
    var cur = plan.byTask[id].bus;
    var opts = S.buses.filter(function (b) { return b.id !== cur && b.outFrom !== 0; }).map(function (b) {
      var ov = Object.assign({}, S.overrides); ov[id] = b.id;
      var p = E.planCopilot(S.tasks, S.buses, ov), a = p.byTask[id];
      if (!a || a.bus !== b.id) return '<option disabled>' + b.id + ': cannot do it</option>';
      var d = p.metrics.lateMin - plan.metrics.lateMin, de = p.metrics.empty - plan.metrics.empty;
      return '<option value="' + b.id + '">' + b.id + ': ' + (a.res.late ? a.res.late + ' min late' : 'on time') + ', plan ' + (d ? (d > 0 ? '+' : '') + d + ' late min, ' : '') + (de >= 0 ? '+' : '') + de + ' empty min</option>';
    }).join('');
    return '<div class="overrule"><label class="small" for="ovSel">Give ' + id + ' to</label> <select id="ovSel">' + opts + '</select> ' +
      '<button class="btn small-btn primary" data-action="doOverrule" data-id="' + id + '">Confirm</button> <button class="btn small-btn plain" data-action="cancelOverrule">Cancel</button>' +
      '<div class="muted small">The rest of the plan is re-optimised around your choice. The numbers show the effect on the whole plan.</div></div>';
  }

  /* ================= tab 4: results ================= */
  function renderOverview() {
    var el = $('#view-overview');
    var a = base.metrics, b = plan.metrics;
    var pure = E.planCopilot(S.tasks, S.buses, {}).metrics, nOv = Object.keys(S.overrides).length;
    var emptyCut = a.empty ? Math.round((a.empty - b.empty) / a.empty * 100) : 0;
    var headline = 'With the copilot, <b>' + b.onTime + ' of ' + b.tasks + '</b> crews arrive on time (today: ' + a.onTime + '), with ' +
      (emptyCut > 0 ? '<b>' + emptyCut + '% less empty driving</b>' : emptyCut < 0 ? '<b>' + (-emptyCut) + '% more empty driving</b>' : 'the same empty driving') +
      ' and <b>' + b.busesUsed + '</b> buses instead of ' + a.busesUsed + '.';
    var rows = [
      metricRow('Crews on time', a.onTime + ' / ' + a.tasks, b.onTime + ' / ' + b.tasks, a.onTime, b.onTime, true, a.tasks),
      metricRow('Crew members on time', a.paxOnTime + ' / ' + a.pax, b.paxOnTime + ' / ' + b.pax, a.paxOnTime, b.paxOnTime, true, a.pax),
      metricRow('Late minutes', a.lateMin, b.lateMin, a.lateMin, b.lateMin, false),
      metricRow('Empty driving', a.empty + ' min · ' + a.emptyKm.toFixed(1) + ' km', b.empty + ' min · ' + b.emptyKm.toFixed(1) + ' km', a.empty, b.empty, false),
      metricRow('Total driving', a.drive + ' min · ' + a.km.toFixed(1) + ' km', b.drive + ' min · ' + b.km.toFixed(1) + ' km', a.drive, b.drive, false),
      metricRow('Buses used', a.busesUsed, b.busesUsed, a.busesUsed, b.busesUsed, false),
      metricRow('Bus runs', a.trips, b.trips, a.trips, b.trips, false),
      '<tr><th>Overrides ' + tip('How often dispatchers overruled the copilot. A falling rate means growing trust.') + '</th><td class="mono">n/a<div class="muted small">nothing to overrule</div></td><td class="mono">' + nOv + ' <span class="muted small">(' + (b.tasks ? Math.round(nOv / b.tasks * 100) : 0) + '% of tasks)</span></td><td class="muted small">' +
        (nOv ? 'Without overrides: ' + pure.lateMin + ' late min, ' + pure.empty + ' empty min' : 'Plan as proposed') + '</td></tr>'
    ].join('');
    var taskRows = S.tasks.slice().sort(function (x, y) { return x.ready - y.ready || (x.id < y.id ? -1 : 1); }).map(function (t) {
      var ta = base.byTask[t.id], tb = plan.byTask[t.id];
      function cell(as, isBase) {
        if (!as) return '<td colspan="3" class="bad">not served</td>';
        var tm = t.dir === 'DEP' ? as.res.doneAt : as.res.pickupAt;
        var share = as.trip.tasks.length > 1 ? ' <span class="tag">+' + ids(as.trip.tasks.filter(function (x) { return x.id !== t.id; }).map(function (x) { return x.id; })) + '</span>' : '';
        var re = isBase && base.reassigned[t.id] ? ' <span class="tag tag-warn">re-assigned</span>' : '';
        var ov = !isBase && S.overrides[t.id] ? ' <span class="tag tag-warn">override</span>' : '';
        return '<td class="mono">' + as.bus + re + ov + share + '</td><td class="mono">' + fmt(tm) + '</td><td class="mono ' + (as.res.late ? 'bad' : 'good') + '">' + (as.res.late ? '+' + as.res.late : '0') + '</td>';
      }
      return '<tr><td class="mono strong">' + t.id + '</td><td class="mono">' + esc(t.flight) + '</td><td><span class="dir dir-' + t.dir + '">' + t.dir + '</span></td><td class="mono">' + fmt(t.due) + '</td>' + cell(ta, true) + cell(tb, false) + '</tr>';
    }).join('');

    el.innerHTML =
      intro('Results', 'The same morning planned two ways: by today’s dispatchers, call by call, and by the copilot. This is the comparison the head of operations needs before deciding on go-live after the 90-day shadow pilot.') +
      '<section class="card hero-result"><p class="headline">' + headline + '</p><p class="muted small">' + (S.log.length ? 'Includes your disruptions: ' + esc(S.log.map(function (l) { return l.text; }).join('; ')) + '.' : 'Original sample day, no disruptions.') + ' Both columns use the same driving times, boarding (' + RULES.boarding + ' min) and drop-off (' + RULES.dropoff + ' min). Kilometres assume ' + Math.round(RULES.kmPerMin * 60) + ' km/h on the apron.</p></section>' +
      '<section class="card"><div class="table-wrap"><table class="tbl compare"><thead><tr><th></th><th>Today’s dispatching<div class="muted small">one run per phone call</div></th><th>Copilot<div class="muted small">including your overrides</div></th><th>Difference</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (Object.keys(base.reassigned).length ? '<p class="small muted">Today’s column: ' + Object.keys(base.reassigned).map(function (k) { return k + ' → ' + base.reassigned[k]; }).join(', ') + ' had no usable bus on record (added task or bus out of service), so they went to the first bus able to reach the pickup.</p>' : '') +
      '</section>' +
      '<div class="grid-2">' +
        '<section class="card"><h2>90-day shadow pilot</h2><p class="small">The copilot runs next to the dispatchers. They keep deciding; every accept and overrule is counted. Example go-live criteria, to be agreed with operations and the works council:</p>' +
          '<ul class="small checklist"><li>' + icon('check') + 'Crews on time: copilot at least as good as today on most days, including disrupted ones</li><li>' + icon('check') + 'Empty kilometres and buses used: a clear, steady reduction</li><li>' + icon('check') + 'Override rate falling, with the reasons reviewed weekly</li></ul></section>' +
        '<section class="card">' + factsCard() + '</section>' +
      '</div>' +
      '<section class="card"><h2>Task by task</h2><div class="table-wrap"><table class="tbl"><thead><tr><th rowspan="2">Task</th><th rowspan="2">Flight</th><th rowspan="2">Type</th><th rowspan="2">Due</th><th colspan="3" class="grp">Today’s dispatching</th><th colspan="3" class="grp">Copilot</th></tr>' +
        '<tr><th>Bus</th><th>Time</th><th>Late</th><th>Bus</th><th>Time</th><th>Late</th></tr></thead><tbody>' + taskRows + '</tbody></table></div>' +
        '<p class="muted small">Time = at the aircraft (DEP) or picked up (ARR).</p></section>';
  }
  function metricRow(label, va, vb, na, nb, higherBetter, of) {
    var d = nb - na, good = higherBetter ? d > 0 : d < 0, bad = higherBetter ? d < 0 : d > 0;
    var pctTxt = na && !of ? ' (' + (d > 0 ? '+' : '') + Math.round(d / na * 100) + '%)' : '';
    var max = Math.max(na, nb, of || 0) || 1;
    function bar(v, cls) { return '<div class="mbar"><span class="' + cls + '" style="width:' + (v / max * 100) + '%"></span></div>'; }
    return '<tr><th>' + label + '</th><td class="mono">' + va + bar(na, 'b-today') + '</td><td class="mono">' + vb + bar(nb, 'b-cop') + '</td>' +
      '<td class="mono ' + (good ? 'good' : bad ? 'bad' : 'muted') + '">' + (d === 0 ? 'same' : (d > 0 ? '+' : '') + d + pctTxt) + '</td></tr>';
  }
  function factsCard() {
    return '<h2>Frankfurt Airport in numbers</h2><div class="facts">' + FRA_FACTS.items.concat(FRA_FACTS.brief).map(function (f) {
      return '<div class="fact"><div class="fact-v">' + f.value + '</div><div class="fact-l">' + f.label + '</div><div class="fact-n muted">' + f.note + '</div></div>';
    }).join('') + '</div><p class="muted small">Sources: ' + FRA_FACTS.sources.map(function (s) { return '<a href="' + s.url + '" target="_blank" rel="noopener">' + s.label + '</a>'; }).join(' · ') + '. Crew tasks, buses and driving times in this demo are synthetic.</p>';
  }

  /* ================= tab 3: live ================= */
  var L = { t: null, playing: false, speed: 10, mode: 'sim', source: 'copilot', raf: null, last: 0, slowAt: 0, cache: {}, built: false };
  function livePlan() { return L.source === 'today' ? base : plan; }
  function liveRange(p) {
    var a = [];
    p.buses.forEach(function (b) { b.trips.forEach(function (tr) { tr.r.steps.forEach(function (s) { a.push(s.start, s.end); }); }); });
    if (!a.length) return [360, 435];
    return [Math.floor((Math.min.apply(null, a) - 5) / 5) * 5, Math.ceil((Math.max.apply(null, a) + 5) / 5) * 5];
  }
  function fmtSec(m) {
    var s = Math.floor(m * 60 + 1e-6), h = Math.floor(s / 3600), mi = Math.floor(s / 60) % 60, se = s % 60;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + ':' + String(se).padStart(2, '0');
  }
  function inMin(x, t) { var d = Math.ceil(x - t - 1e-6); return d <= 0 ? 'now' : 'in ' + d + ' min'; }
  function realNow() { var d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
  function liveT() { return L.mode === 'real' ? realNow() : L.t; }

  function busNow(b, t) {
    var src = busById(b.id);
    var out = src.outFrom === 0 || (src.outFrom != null && t >= src.outFrom);
    var cur = null, curTrip = null, prevTrip = null, nextTrip = null;
    b.trips.forEach(function (tr) {
      if (tr.r.end <= t) prevTrip = tr;
      else if (tr.r.start <= t) { curTrip = tr; tr.r.steps.forEach(function (s) { if (t >= s.start && t < s.end) cur = s; }); }
      else if (!nextTrip) nextTrip = tr;
    });
    var loc = prevTrip ? prevTrip.r.endLoc : b.start;
    var st = { kind: 'idle', label: 'Standby', what: 'at ' + loc, until: null, start: null, progress: null, next: nextTrip, trip: curTrip, cur: cur, loc: loc };
    function pax(list) { return list.reduce(function (s, k) { var x = task(k); return s + (x ? x.pax : 0); }, 0); }
    if (cur) {
      st.until = cur.end; st.start = cur.start; st.progress = (t - cur.start) / (cur.end - cur.start);
      if (cur.type === 'empty') { st.kind = 'empty'; st.label = 'Driving empty'; st.what = cur.from + ' → ' + cur.to + ' to pick up ' + ids(tids(curTrip)); }
      else if (cur.type === 'wait') { st.kind = 'wait'; st.label = 'Waiting for crew'; st.what = 'at ' + cur.at + ' for ' + ids(cur.waitingFor) + (cur.onboard.length ? ' · ' + ids(cur.onboard) + ' on board' : ''); }
      else if (cur.type === 'board') { st.kind = 'board'; st.label = 'Boarding'; st.what = ids(cur.tasks) + ' at ' + cur.at; }
      else if (cur.type === 'drive') { st.kind = 'drive'; st.label = 'Crew on board'; st.what = cur.from + ' → ' + cur.to + ' · ' + ids(cur.onboard) + ' · ' + pax(cur.onboard) + ' people'; }
      else if (cur.type === 'drop') { st.kind = 'drop'; st.label = 'Drop-off'; st.what = ids(cur.tasks) + ' at ' + cur.at; }
    } else if (out) { st.kind = 'out'; st.label = 'Out of service'; st.what = 'at ' + loc; }
    else if (t < src.shiftStart || t >= src.shiftEnd) { st.kind = 'off'; st.label = 'Off shift'; st.what = 'shift ' + src.shift; }
    if (out && !cur) st.next = null;
    return st;
  }
  function taskNow(t, a, now) {
    var r = a.res, tr = a.trip, key = t.dir === 'DEP' ? r.doneAt : r.pickupAt, s;
    if (now >= r.doneAt) s = { k: 'done', label: t.dir === 'DEP' ? 'At aircraft' : 'At Crew Center' };
    else if (now >= r.boardEnd) s = { k: 'onboard', label: 'On board' };
    else if (now >= r.boardStart) s = { k: 'boarding', label: 'Boarding' };
    else if (now >= tr.r.start) s = { k: 'enroute', label: 'Bus on the way' };
    else s = { k: 'planned', label: 'Planned' };
    s.key = key; s.slack = t.due - key; s.late = r.late;
    s.liveLate = r.late > 0 || (now > t.due && now < key);
    s.tight = !s.liveLate && s.slack <= 2 && s.k !== 'done';
    return s;
  }

  function renderLive() {
    var el = $('#view-live'), p = livePlan(), rg = liveRange(p);
    if (L.t == null) L.t = Math.min(Math.max(6 * 60 + 18, rg[0]), rg[1]);
    var layers = L.layers || (L.layers = { airport: true, routes: true, labels: true, pins: true });
    el.innerHTML =
      intro('Live map', 'Watch every crew bus move through the morning. The red line is “now”. Select a bus or a crew to see what it is doing, and get alerted when a crew is at risk of being late.',
        '<div class="seg-ctl" role="group" aria-label="Plan shown">' +
          '<button class="' + (L.source === 'copilot' ? 'on' : '') + '" data-action="liveSource" data-source="copilot">Copilot plan</button>' +
          '<button class="' + (L.source === 'today' ? 'on' : '') + '" data-action="liveSource" data-source="today">Today’s dispatching</button></div>') +
      '<section class="card lv-controls">' +
        '<div class="lv-clock"><div class="lv-time mono" id="liveClock"></div><div class="small muted" id="liveClockNote"></div></div>' +
        '<div class="lv-ctrl">' +
          '<div class="row gap wrap lv-play"' + (L.mode === 'real' ? ' hidden' : '') + '>' +
            '<button class="icon-btn round" data-action="liveJump" data-delta="-5" aria-label="Back 5 minutes">−5</button>' +
            '<button class="play-btn" data-action="livePlay" id="livePlayBtn" aria-label="Play"></button>' +
            '<button class="icon-btn round" data-action="liveJump" data-delta="5" aria-label="Forward 5 minutes">+5</button>' +
            '<div class="seg-ctl sm" role="group" aria-label="Speed">' + [1, 10, 60].map(function (s) { return '<button class="' + (L.speed === s ? 'on' : '') + '" data-action="liveSpeed" data-speed="' + s + '">' + s + '×</button>'; }).join('') + '</div>' +
            '<input type="range" id="liveSlider" min="' + rg[0] + '" max="' + rg[1] + '" step="0.25" value="' + L.t + '" aria-label="Time of day">' +
          '</div>' +
          '<div class="seg-ctl sm" role="group" aria-label="Clock">' +
            '<button class="' + (L.mode === 'sim' ? 'on' : '') + '" data-action="liveMode" data-mode="sim">Replay sample day</button>' +
            '<button class="' + (L.mode === 'real' ? 'on' : '') + '" data-action="liveMode" data-mode="real">Real clock</button></div>' +
        '</div>' +
      '</section>' +
      '<div id="lvCounts" class="lv-counts"></div>' +
      '<div class="lv-grid">' +
        '<section class="card map-card">' +
          '<div class="map-top"><span class="live-badge"><i></i>LIVE</span><span class="small muted">Planned positions, not tracked vehicles · schematic map, not to scale</span></div>' +
          '<div class="map-wrap' + Object.keys(layers).map(function (k) { return layers[k] ? '' : ' hide-' + k; }).join('') + '" id="mapWrap">' + FraMap.staticSvg(p.buses.map(function (b) { return b.id; })) + '</div>' +
          '<div class="map-layers" role="group" aria-label="Map layers"><span class="small muted">Layers</span>' +
            [['airport', 'Airport'], ['routes', 'Routes'], ['labels', 'Labels'], ['pins', 'Waiting crews']].map(function (l) {
              return '<button class="chip-toggle' + (layers[l[0]] ? ' on' : '') + '" data-action="layer" data-layer="' + l[0] + '" aria-pressed="' + layers[l[0]] + '">' + l[1] + '</button>';
            }).join('') + '</div>' +
        '</section>' +
        '<aside class="card inspector" id="lvInspector" aria-live="polite"></aside>' +
      '</div>' +
      '<section class="card lv-board"><div class="row between wrap"><h2>Drivers and buses</h2><span class="muted small">What each bus is doing now and what comes next</span></div><div id="lvRows"></div></section>' +
      '<section class="card"><div class="row between wrap"><h2>Crew tasks right now</h2><span class="muted small">Sorted by due time · ETA = at aircraft (DEP) or picked up (ARR)</span></div><div class="table-wrap" id="lvTable"></div></section>' +
      '<p class="wc-inline small">Planning use only, no performance monitoring of drivers. The map shows the plan, not tracked vehicle positions.</p>';
    L.cache = {}; L.built = true;
    liveSlow(liveT(), true); liveFrame(liveT());
  }

  function setHTML(id, html) { if (L.cache[id] === html) return; L.cache[id] = html; var el = document.getElementById(id); if (el) el.innerHTML = html; }

  function liveSlow(t, force) {
    if (!L.built || !document.getElementById('lvRows')) return;
    var p = livePlan(), rg = liveRange(p), span = rg[1] - rg[0];
    function pct(x) { return ((Math.min(Math.max(x, rg[0]), rg[1]) - rg[0]) / span * 100).toFixed(2); }
    var counts = { planned: 0, enroute: 0, boarding: 0, onboard: 0, done: 0, late: 0 };
    var selBus = sel && sel.kind === 'bus' ? sel.id : (sel && sel.kind === 'task' && p.byTask[sel.id] ? p.byTask[sel.id].bus : null);
    var selFlight = sel && sel.kind === 'flight' ? sel.id : null;

    var trows = S.tasks.slice().sort(function (a, b) { return a.due - b.due || (a.id < b.id ? -1 : 1); }).map(function (tk) {
      var a = p.byTask[tk.id];
      if (!a) return '<tr class="lv-late"><td><span class="lvp lvp-late">No bus</span></td><td class="mono">' + tk.id + '</td><td class="mono">' + esc(tk.flight) + '</td><td colspan="5" class="bad">No bus can do this</td></tr>';
      var s = taskNow(tk, a, t);
      counts[s.k]++; if (s.liveLate) counts.late++;
      var dec = L.source === 'copilot' ? statusOf(tk.id) : null;
      var decTag = dec === 'accepted' ? '<span class="tag tag-ok" title="Accepted by a dispatcher">' + icon('check') + '</span>' : dec === 'overruled' ? '<span class="tag tag-warn">override</span>' : dec === 'open' ? '<span class="tag" title="Copilot proposal, not yet accepted">proposal</span>' : '';
      var slack = s.liveLate ? '<span class="bad">' + Math.max(s.late, Math.ceil(t - tk.due)) + ' min late</span>' : s.k === 'done' ? '<span class="good">' + s.slack + ' min early</span>' : '<span class="' + (s.tight ? 'warn' : 'muted') + '">' + s.slack + ' min spare</span>';
      var isSel = (sel && sel.kind === 'task' && sel.id === tk.id) || (selFlight === tk.flight) || (selBus && sel.kind === 'bus' && a.bus === selBus);
      return '<tr class="lv-' + s.k + (s.liveLate ? ' lv-late' : '') + (isSel ? ' is-sel' : '') + '" data-select="task:' + tk.id + '">' +
        '<td><span class="lvp lvp-' + (s.liveLate && s.k !== 'done' ? 'late' : s.k) + '">' + s.label + '</span>' + (s.tight ? ' <span class="tag tag-warn">tight</span>' : '') + '</td>' +
        '<td class="mono strong">' + tk.id + '</td><td class="mono">' + esc(tk.flight) + ' <span class="dir dir-' + tk.dir + '">' + tk.dir + '</span></td>' +
        '<td class="mono"><span class="strong">' + a.bus + '</span> <span class="muted">' + busById(a.bus).driver + '</span> ' + decTag + '</td>' +
        '<td>' + esc(shortLoc(tk.from)) + ' → ' + esc(shortLoc(tk.to)) + ' <span class="muted small">' + tk.pax + '</span></td>' +
        '<td class="mono">' + fmt(a.res.boardStart) + '</td><td class="mono">' + fmt(s.key) + ' <span class="muted">/ ' + fmt(tk.due) + '</span></td><td class="mono small">' + slack + '</td></tr>';
    }).join('');

    var ticks = '';
    for (var x = Math.ceil(rg[0] / 10) * 10; x <= rg[1]; x += 10) ticks += '<span class="tick" style="left:' + pct(x) + '%">' + fmt(x) + '</span>';
    var rows = '<div class="lv-row lv-axisrow"><div class="lv-info small muted">Bus · driver</div><div class="lv-track"><div class="tl-axis">' + ticks + '<span class="lv-nowlabel mono" id="lvNowLabel"></span></div></div></div>' +
      p.buses.map(function (b) {
        var st = busNow(b, t), src = busById(b.id), bars = '';
        if (src.outFrom != null) { var o = src.outFrom || rg[0]; bars += '<div class="seg seg-out" style="left:' + pct(o) + '%;width:' + (pct(rg[1]) - pct(o)) + '%"></div>'; }
        b.trips.forEach(function (tr) {
          tr.r.segs.forEach(function (sg) {
            if (sg.end <= sg.start) return;
            bars += '<div class="seg seg-' + sg.type + (tr.tasks[0].dir === 'ARR' && sg.type === 'service' ? ' seg-arr' : '') + (tr.r.late && sg.type === 'service' ? ' seg-late' : '') +
              (tr.r.end <= t ? ' seg-past' : '') + (st.trip === tr ? ' seg-cur' : '') + '" style="left:' + pct(sg.start) + '%;width:' + (pct(sg.end) - pct(sg.start)) + '%">' + (sg.type === 'service' ? '<span>' + ids(tids(tr)) + '</span>' : '') + '</div>';
          });
        });
        var next = st.next ? 'Next <span class="mono strong">' + ids(tids(st.next)) + '</span> ' + esc(st.next.tasks[0].flight) + ' · leaves ' + esc(shortLoc(st.next.startLoc)) + ' ' + fmt(st.next.r.start) + ' <span class="muted">(' + inMin(st.next.r.start, t) + ')</span>' : '<span class="muted">No more runs planned</span>';
        return '<div class="lv-row lvk-' + st.kind + (selBus === b.id ? ' is-sel' : '') + '" data-select="bus:' + b.id + '">' +
          '<div class="lv-info"><div class="lv-id"><span class="bus-chip mono">' + b.id + '</span><span class="mono muted small">' + b.driver + '</span><span class="lvs lvs-' + st.kind + '">' + st.label + '</span></div>' +
            '<div class="lv-what">' + esc(st.what) + (st.until != null ? ' <span class="muted small">· until ' + fmt(st.until) + ' (' + inMin(st.until, t) + ')</span>' : '') + '</div>' +
            (st.progress != null ? '<div class="lv-prog"><span data-s="' + st.start + '" data-e="' + st.until + '"></span></div>' : '') +
            '<div class="lv-next small">' + next + '</div></div>' +
          '<div class="lv-track"><div class="tl-track"><div class="lv-pastshade"></div>' + bars + '<div class="lv-now"></div></div></div></div>';
      }).join('');

    function chip(k, label, n) { return '<span class="lv-count"><span class="lvp lvp-' + k + '">' + label + '</span><b class="mono">' + n + '</b></span>'; }
    setHTML('lvCounts', chip('planned', 'Planned', counts.planned) + chip('enroute', 'Bus on the way', counts.enroute) + chip('boarding', 'Boarding', counts.boarding) +
      chip('onboard', 'On board', counts.onboard) + chip('done', 'Delivered', counts.done) + chip('late', 'Late', counts.late));
    setHTML('lvRows', rows);
    setHTML('lvTable', '<table class="tbl lv-tbl"><thead><tr><th>Status</th><th>Task</th><th>Flight</th><th>Bus · driver</th><th>Route · people</th><th>Boards</th><th>ETA / due</th><th>Margin</th></tr></thead><tbody>' + trows + '</tbody></table>');
    setHTML('lvInspector', inspectorHTML(t, p));
    evaluateAlerts(t);
  }

  function liveFrame(t) {
    var p = livePlan(), rg = liveRange(p), span = rg[1] - rg[0];
    var clock = $('#liveClock'); if (!clock) return;
    clock.textContent = fmtSec(t);
    $('#liveClockNote').textContent = L.mode === 'real'
      ? (t < rg[0] || t > rg[1] ? 'Your clock is outside the sample morning (' + fmt(rg[0]) + '–' + fmt(rg[1]) + '). Switch to Replay to watch it.' : 'Following your device clock')
      : (L.playing ? 'Replaying at ' + L.speed + '× speed' : 'Paused. Press play or drag the slider.');
    var pb = $('#livePlayBtn');
    if (pb) { var playing = L.playing; if (pb.dataset.state !== String(playing)) { pb.dataset.state = playing; pb.innerHTML = icon(playing ? 'pause' : 'play') + '<span>' + (playing ? 'Pause' : (L.t >= rg[1] ? 'Replay' : 'Play')) + '</span>'; pb.setAttribute('aria-label', playing ? 'Pause' : 'Play'); } }
    var sl = $('#liveSlider'); if (sl && document.activeElement !== sl) sl.value = L.t;
    var nowPct = (Math.min(Math.max(t, rg[0]), rg[1]) - rg[0]) / span * 100;
    $$('#lvRows .lv-now').forEach(function (e) { e.style.left = nowPct + '%'; });
    $$('#lvRows .lv-pastshade').forEach(function (e) { e.style.width = nowPct + '%'; });
    var nl = $('#lvNowLabel'); if (nl) { nl.style.left = nowPct + '%'; nl.textContent = fmt(t); }
    $$('#lvRows .lv-prog span').forEach(function (e) { var s = +e.dataset.s, en = +e.dataset.e; e.style.width = Math.max(0, Math.min(1, (t - s) / (en - s))) * 100 + '%'; });
    drawMap(t, p);
  }

  function drawMap(t, p) {
    var buses = $('#mBuses'); if (!buses) return;
    var selBus = sel && sel.kind === 'bus' ? sel.id : (sel && sel.kind === 'task' && p.byTask[sel.id] ? p.byTask[sel.id].bus : null);
    var stationary = {}, routes = '', items = [];
    p.buses.forEach(function (b) {
      var st = busNow(b, t), pos, moving = false;
      if (st.cur && (st.cur.type === 'empty' || st.cur.type === 'drive')) { pos = FraMap.along(st.cur.from, st.cur.to, st.progress); moving = true; }
      else pos = FraMap.node(st.cur ? st.cur.at : st.loc);
      if (!moving) { var k = Math.round(pos.x) + ',' + Math.round(pos.y); (stationary[k] = stationary[k] || []).push(b.id); }
      items.push({ b: b, st: st, pos: pos, moving: moving });
      if (st.cur && moving) routes += '<path class="m-route ' + (st.cur.type === 'empty' ? 'r-empty' : 'r-crew') + (selBus === b.id ? ' r-sel' : '') + '" d="' + FraMap.pathD(st.cur.from, st.cur.to) + '"/>';
      else if (selBus === b.id && st.next) routes += '<path class="m-route r-next" d="' + FraMap.pathD(st.loc, st.next.startLoc) + '"/>';
    });
    items.forEach(function (it) {
      var x = it.pos.x, y = it.pos.y;
      if (!it.moving) {
        var grp = stationary[Math.round(x) + ',' + Math.round(y)], i = grp.indexOf(it.b.id);
        if (grp.length > 1) { var ang = -Math.PI / 2 + i * (2 * Math.PI / grp.length); x += Math.cos(ang) * 20; y += Math.sin(ang) * 20; }
      }
      var g = document.getElementById('mb-' + it.b.id); if (!g) return;
      g.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
      var cls = 'm-bus m-k-' + it.st.kind + (it.st.cur && it.st.cur.type === 'drive' && it.st.trip && it.st.trip.tasks[0].dir === 'ARR' ? ' m-arr' : '') + (selBus === it.b.id ? ' m-sel' : '') + (it.st.trip && it.st.trip.r.late ? ' m-late' : '');
      if (g.getAttribute('class') !== cls) g.setAttribute('class', cls);
      var label = it.b.id + (it.st.trip ? ' · ' + ids(tids(it.st.trip)) : it.st.kind === 'out' ? ' · out' : '');
      var tx = g.querySelector('.m-bus-tag text');
      if (tx.textContent !== label) { tx.textContent = label; g.querySelector('.m-bus-tag rect').setAttribute('width', label.length * 6.6 + 14); }
    });
    if (L.cache.routes !== routes) { L.cache.routes = routes; $('#mRoutes').innerHTML = routes; }
    // waiting crews per location
    var waiting = {};
    S.tasks.forEach(function (tk) {
      var a = p.byTask[tk.id]; if (!a) return;
      if (t >= tk.ready && t < a.res.boardStart) { (waiting[tk.from] = waiting[tk.from] || []).push(tk); }
    });
    var pins = Object.keys(waiting).map(function (loc) {
      var n = FraMap.node(loc), list = waiting[loc], pax = list.reduce(function (s, x) { return s + x.pax; }, 0);
      var txt = list.length + ' crew' + (list.length > 1 ? 's' : '') + ' · ' + pax;
      return '<g class="m-pin" transform="translate(' + n.x + ' ' + (n.y - 34) + ')"><rect x="' + (-(txt.length * 3.3 + 10)) + '" y="-11" rx="9" height="20" width="' + (txt.length * 6.6 + 20) + '"/>' +
        '<text text-anchor="middle" y="3">' + txt + '</text><path d="M-5 9 L0 15 L5 9 Z"/></g>';
    }).join('');
    if (L.cache.pins !== pins) { L.cache.pins = pins; $('#mPins').innerHTML = pins; }
  }

  function inspectorHTML(t, p) {
    if (!sel) {
      return '<div class="ins-empty"><h3>Select something</h3><p class="muted small">Tap a bus on the map, a row in the timeline or a crew in the table to see its details here.</p>' +
        '<h3>Latest alerts</h3>' + (A.list.length ? '<ul class="ins-alerts">' + A.list.slice(0, 4).map(function (o) {
          return '<li class="sev-' + o.sev + '"><button class="ap-item" data-action="alertView" data-alert="' + o.id + '"><span class="ap-dot"></span><span class="ap-main"><span class="ap-title">' + esc(o.title) + '</span></span><span class="ap-time mono">' + (o.clock != null ? fmt(o.clock) : '') + '</span></button></li>';
        }).join('') + '</ul>' : '<p class="muted small">None yet. Press play to run the morning.</p>') + '</div>';
    }
    var close = '<button class="icon-btn" data-action="deselect" aria-label="Close details">' + icon('x') + '</button>';
    if (sel.kind === 'bus') {
      var b = p.buses.filter(function (x) { return x.id === sel.id; })[0]; if (!b) return '';
      var st = busNow(b, t), src = busById(b.id);
      var runs = b.trips.map(function (tr) {
        var state = tr.r.end <= t ? 'past' : tr.r.start <= t ? 'cur' : 'next';
        return '<li class="run run-' + state + '"><span class="mono">' + fmt(tr.r.start) + '</span><span><b class="mono">' + ids(tids(tr)) + '</b> <span class="muted small">' + esc(tr.r.route.map(shortLoc).join(' → ')) + '</span></span>' +
          (tr.r.late ? '<span class="tag tag-bad">' + tr.r.late + ' late</span>' : '') + '</li>';
      }).join('');
      return '<div class="ins-head"><div><div class="eyebrow">' + icon('bus') + ' Bus</div><h3 class="ins-title mono">' + b.id + '</h3></div>' + close + '</div>' +
        '<span class="lvs lvs-' + st.kind + '">' + st.label + '</span><p class="ins-what">' + esc(st.what) + (st.until != null ? '<br><span class="muted small">until ' + fmt(st.until) + ' (' + inMin(st.until, t) + ')</span>' : '') + '</p>' +
        '<dl class="ins-dl"><dt>Starts at</dt><dd>' + b.start + '</dd><dt>Shift</dt><dd class="mono">' + src.shift + '</dd><dt>Seats</dt><dd>' + RULES.capacity + '</dd><dt>Runs</dt><dd>' + b.trips.length + '</dd></dl>' +
        '<h4>Runs</h4>' + (runs ? '<ul class="runs">' + runs + '</ul>' : '<p class="muted small">No runs. Kept in reserve.</p>');
    }
    if (sel.kind === 'task') {
      var tk = task(sel.id), a = tk && p.byTask[tk.id]; if (!tk) return '';
      var s = a ? taskNow(tk, a, t) : null, stt = L.source === 'copilot' ? statusOf(tk.id) : null;
      return '<div class="ins-head"><div><div class="eyebrow">' + icon('user') + ' Crew task</div><h3 class="ins-title"><span class="mono">' + tk.id + '</span> · ' + esc(tk.flight) + ' <span class="dir dir-' + tk.dir + '">' + tk.dir + '</span></h3></div>' + close + '</div>' +
        (s ? '<span class="lvp lvp-' + (s.liveLate && s.k !== 'done' ? 'late' : s.k) + '">' + s.label + '</span>' + (s.tight ? ' <span class="tag tag-warn">tight</span>' : '') : '<span class="lvp lvp-late">No bus</span>') +
        '<dl class="ins-dl"><dt>Crew</dt><dd>' + esc(tk.crew) + ', ' + tk.pax + ' people</dd><dt>Route</dt><dd>' + esc(tk.from) + ' → ' + esc(tk.to) + '</dd>' +
        '<dt>Ready</dt><dd class="mono">' + fmt(tk.ready) + '</dd><dt>Due</dt><dd class="mono">' + fmt(tk.due) + '</dd>' +
        (a ? '<dt>Bus</dt><dd><button class="link mono strong" data-select="bus:' + a.bus + '">' + a.bus + '</button></dd><dt>' + (tk.dir === 'DEP' ? 'At aircraft' : 'Picked up') + '</dt><dd class="mono">' + fmt(s.key) + ' · ' + (s.late ? '<span class="bad">' + s.late + ' min late</span>' : s.slack + ' min spare') + '</dd>' : '') + '</dl>' +
        (L.source === 'copilot' && a ? '<div class="why"><span class="why-label">Why</span>' + esc(why(tk.id)) + '</div>' +
          '<div class="row gap wrap ins-actions">' + (stt === 'open' ? '<button class="btn small-btn primary" data-action="accept" data-id="' + tk.id + '">Accept</button>' : stt === 'accepted' ? '<span class="tag tag-ok">' + icon('check') + ' Accepted</span>' : stt === 'overruled' ? '<span class="tag tag-warn">Overruled</span>' : '') +
          '<button class="btn small-btn" data-goto="plan" data-action="overrule" data-id="' + tk.id + '">Overrule in plan</button><button class="btn small-btn plain" data-select="flight:' + tk.flight + '">All of ' + esc(tk.flight) + '</button></div>' : '');
    }
    if (sel.kind === 'flight') {
      var list = S.tasks.filter(function (x) { return x.flight === sel.id; });
      return '<div class="ins-head"><div><div class="eyebrow">' + icon('plane') + ' Flight</div><h3 class="ins-title mono">' + esc(sel.id) + '</h3></div>' + close + '</div>' +
        '<ul class="runs">' + list.map(function (x) { var a = p.byTask[x.id], s = a ? taskNow(x, a, t) : null; return '<li class="run"><button class="link mono strong" data-select="task:' + x.id + '">' + x.id + '</button><span>' + esc(x.crew) + ' · ' + x.pax + ' · ' + (a ? a.bus : 'no bus') + '</span>' + (s ? '<span class="lvp lvp-' + s.k + '">' + s.label + '</span>' : '') + '</li>'; }).join('') + '</ul>' +
        '<p class="muted small">Type “' + esc(sel.id) + ' delayed 20 min” in the search bar (⌘K) to re-plan.</p>';
    }
    if (sel.kind === 'loc') {
      var here = S.tasks.filter(function (x) { return x.from === sel.id || x.to === sel.id; });
      var n = FraMap.NODES[sel.id] || {};
      return '<div class="ins-head"><div><div class="eyebrow">' + icon('map') + ' Place</div><h3 class="ins-title">' + esc(sel.id) + '</h3></div>' + close + '</div><p class="muted small">' + esc(n.sub || '') + '</p>' +
        '<h4>Crews starting or ending here</h4><ul class="runs">' + here.map(function (x) { return '<li class="run"><button class="link mono strong" data-select="task:' + x.id + '">' + x.id + '</button><span>' + esc(x.flight) + ' ' + x.dir + ' · ready ' + fmt(x.ready) + '</span></li>'; }).join('') + '</ul>';
    }
    return '';
  }

  function loop(now) {
    L.raf = null;
    var dt = Math.min(0.25, (now - L.last) / 1000); L.last = now;
    var rg = liveRange(livePlan());
    if (L.mode === 'sim' && L.playing) { L.t = Math.min(rg[1], L.t + L.speed * dt / 60); if (L.t >= rg[1]) L.playing = false; }
    var t = liveT();
    liveFrame(t);
    if (now - L.slowAt > 250) { L.slowAt = now; liveSlow(t); }
    if (needLoop()) L.raf = requestAnimationFrame(loop);
  }
  function needLoop() { return tab === 'live' && (L.mode === 'real' || L.playing); }
  function ensureLoop() {
    if (needLoop() && !L.raf) { L.last = performance.now(); L.raf = requestAnimationFrame(loop); }
    if (tab === 'live') { var t = liveT(); liveFrame(t); liveSlow(t, true); }
  }

  /* ================= selection ================= */
  function select(kind, id, goto) {
    sel = kind ? { kind: kind, id: id } : null;
    if (goto && tab !== goto) showTab(goto);
    if (tab === 'live') { L.cache.lvInspector = null; L.cache.lvRows = null; L.cache.lvTable = null; liveSlow(liveT(), true); liveFrame(liveT()); }
    if (sel && tab === 'live' && window.innerWidth < 900) { var ins = $('#lvInspector'); if (ins) ins.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'nearest' }); }
  }

  /* ================= command palette ================= */
  var K = { idx: 0, items: [] };
  function openPalette(q) {
    var o = $('#palette'); o.hidden = false; document.body.classList.add('modal-open');
    var inp = $('#kInput'); inp.value = q || ''; K.idx = 0; paletteSearch(); inp.focus();
  }
  function closePalette() { $('#palette').hidden = true; document.body.classList.remove('modal-open'); }
  function paletteSearch() {
    var q = $('#kInput').value.trim(), ql = q.toLowerCase(), items = [];
    if (q) {
      var cmds = Parser.parse(q);
      if (cmds.length && cmds.every(function (c) { return c.type !== 'error'; })) items.push({ ic: 'bolt', title: 'Update plan: ' + q, sub: 'Apply this disruption and re-plan every bus', run: function () { var out = applyText(q); renderAll(); hud(out.changed.length ? out.changed.length + ' task(s) moved to another bus' : 'Plan updated', 'ok'); } });
    }
    S.tasks.forEach(function (t) {
      var hay = (t.id + ' ' + t.flight + ' ' + t.from + ' ' + t.to + ' ' + t.crew + ' ' + t.dir).toLowerCase();
      if (!ql || hay.indexOf(ql) >= 0) items.push({ ic: 'user', title: t.id + ' · ' + t.flight + ' ' + t.dir, sub: t.crew + ', ' + t.pax + ' people · ' + t.from + ' → ' + t.to + ' · due ' + fmt(t.due), run: function () { select('task', t.id, 'live'); } });
    });
    uniqFlights().forEach(function (f) { if (ql && f.toLowerCase().indexOf(ql) >= 0) items.push({ ic: 'plane', title: 'Flight ' + f, sub: 'Show all crews of this flight', run: function () { select('flight', f, 'live'); } }); });
    S.buses.forEach(function (b) { if (!ql || b.id.toLowerCase().indexOf(ql) >= 0 || 'bus'.indexOf(ql) === 0) items.push({ ic: 'bus', title: 'Bus ' + b.id, sub: 'Starts at ' + b.start + ' · ' + (busOutLabel(b) || 'in service'), run: function () { select('bus', b.id, 'live'); } }); });
    [['Crew tasks', 'input', 'list'], ['Copilot plan', 'plan', 'plan'], ['Live map', 'live', 'map'], ['Results', 'overview', 'chart']].forEach(function (pg) {
      if (!ql || pg[0].toLowerCase().indexOf(ql) >= 0) items.push({ ic: pg[2], title: 'Go to ' + pg[0], sub: 'Page', run: function () { showTab(pg[1]); } });
    });
    [['Play or pause the replay', function () { showTab('live'); L.mode = 'sim'; L.playing = !L.playing; renderLive(); ensureLoop(); }, 'play'],
     ['Show the introduction', function () { openWelcome(); }, 'help'],
     ['Turn pop-up alerts ' + (A.popups ? 'off' : 'on'), function () { A.popups = !A.popups; lsSet(STORE + '.popups', A.popups ? 'on' : 'off'); hud('Pop-up alerts ' + (A.popups ? 'on' : 'off'), 'ok'); }, 'bell']
    ].forEach(function (a) { if (!ql || a[0].toLowerCase().indexOf(ql) >= 0) items.push({ ic: a[2], title: a[0], sub: 'Action', run: a[1] }); });
    K.items = items.slice(0, 12); K.idx = Math.min(K.idx, Math.max(0, K.items.length - 1));
    $('#kList').innerHTML = K.items.length ? K.items.map(function (it, i) {
      return '<li><button class="k-item' + (i === K.idx ? ' on' : '') + '" data-k="' + i + '">' + icon(it.ic) + '<span><span class="k-title">' + esc(it.title) + '</span><span class="k-sub">' + esc(it.sub) + '</span></span></button></li>';
    }).join('') : '<li class="k-empty">No match. Try a task (T03), a flight (LH400), a bus (B02), or a disruption like “B03 broke down”.</li>';
  }
  function runPalette(i) { var it = K.items[i]; if (!it) return; closePalette(); it.run(); }

  /* ================= welcome sheet ================= */
  function openWelcome() {
    var s = $('#welcome'); document.body.classList.add('modal-open');
    s.querySelector('.sheet-body').innerHTML =
      '<div class="sheet-grabber"></div>' +
      '<div class="eyebrow">Frankfurt Airport · crew transport</div>' +
      '<h2 class="sheet-title">Getting crews to their aircraft on time</h2>' +
      '<p class="lead">Every day, dispatchers at Frankfurt send about 1,100 crew bus trips between the Crew Center and the aircraft, one phone call at a time. Crews arrive late, buses drive empty, and one late crew can delay a whole flight.</p>' +
      '<ol class="steps">' +
        '<li><span class="step-n">1</span><div><b>Crew tasks</b><p>Each crew that needs a bus, and when. Type a disruption in plain words, like “LH400 delayed 30 min”.</p></div></li>' +
        '<li><span class="step-n">2</span><div><b>Copilot plan</b><p>The copilot proposes a bus for every crew and explains why. The dispatcher accepts or overrules it in seconds.</p></div></li>' +
        '<li><span class="step-n">3</span><div><b>Live map</b><p>Watch the buses move across the apron, get alerts before a crew is late, and select anything for details.</p></div></li>' +
        '<li><span class="step-n">4</span><div><b>Results</b><p>Today’s dispatching next to the copilot on the same day: crews on time, empty kilometres, buses used.</p></div></li>' +
      '</ol>' +
      '<div class="facts compact">' + FRA_FACTS.items.slice(0, 2).concat(FRA_FACTS.brief).map(function (f) { return '<div class="fact"><div class="fact-v">' + f.value + '</div><div class="fact-l">' + f.label + '</div></div>'; }).join('') + '</div>' +
      '<p class="muted small">Demo with synthetic crew data on a schematic map of the real airport. Drivers appear only as IDs (D-01…). Planning use only, no performance monitoring of drivers. Press <kbd>⌘</kbd> <kbd>K</kbd> or <kbd>/</kbd> to search or type a disruption anywhere.</p>' +
      '<div class="row gap wrap sheet-actions"><button class="btn primary lg" data-action="welcomeGo" data-tab="live">' + icon('map') + ' Watch the live map</button><button class="btn tinted lg" data-action="welcomeGo" data-tab="input">Start with the tasks</button></div>';
    s.hidden = false;
    setTimeout(function () { var b = s.querySelector('.btn.primary'); if (b) b.focus(); }, 30);
  }
  function closeWelcome() { $('#welcome').hidden = true; document.body.classList.remove('modal-open'); lsSet(STORE + '.welcomed', '1'); }

  /* ================= render all / tabs ================= */
  function renderAll() {
    compute();
    Object.keys(S.accepted).forEach(function (k) { if (!plan.byTask[k] || plan.byTask[k].bus !== S.accepted[k]) delete S.accepted[k]; });
    if (sel && sel.kind === 'task' && !task(sel.id)) sel = null;
    var keepText = $('#disruptText') ? $('#disruptText').value : '';
    var keepRes = $('#parseResult') ? $('#parseResult').innerHTML : '';
    renderInput(); renderPlan(); renderOverview(); renderLive();
    if (keepText) $('#disruptText').value = keepText;
    if (keepRes) $('#parseResult').innerHTML = keepRes;
    var open = S.tasks.filter(function (t) { return statusOf(t.id) === 'open'; }).length;
    $$('.openBadge').forEach(function (b) { b.textContent = open || ''; b.hidden = !open; });
    showTab(tab, true);
    animateCounts($('#view-plan'));
    UI.justAccepted = null; UI.flash = false;
    save();
  }
  function showTab(t, silent) {
    var changed = t !== tab; tab = t; lsSet(STORE + '.tab', t);
    $$('[data-tab-btn]').forEach(function (b) { var on = b.dataset.tabBtn === t; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    $$('.view').forEach(function (v) {
      var on = v.id === 'view-' + t; v.classList.toggle('active', on);
      if (on && (changed || !silent) && !RM) { v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter'); clearTimeout(v._enterT); v._enterT = setTimeout(function () { v.classList.remove('enter'); }, 900); }
    });
    if (changed && !silent) window.scrollTo(0, 0);
    ensureLoop();
  }

  /* ================= events ================= */
  function handleSelect(target) {
    var s = target.closest('[data-select]'); if (!s) return false;
    var v = s.dataset.select, i = v.indexOf(':');
    select(v.slice(0, i), v.slice(i + 1), s.dataset.goto || null);
    return true;
  }
  document.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (e.target.closest('#view-live [data-select]') && !e.target.closest('button[data-action]')) { e.preventDefault(); handleSelect(e.target); }
  });
  document.addEventListener('keydown', function (e) {
    var typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement && document.activeElement.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#palette').hidden ? openPalette() : closePalette(); return; }
    if (!$('#palette').hidden) {
      if (e.key === 'Escape') { closePalette(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); K.idx = (K.idx + (e.key === 'ArrowDown' ? 1 : -1) + K.items.length) % (K.items.length || 1); paletteSearch(); var on = $('.k-item.on'); if (on) on.scrollIntoView({ block: 'nearest' }); return; }
      if (e.key === 'Enter') { e.preventDefault(); runPalette(K.idx); return; }
      return;
    }
    if (!$('#welcome').hidden && e.key === 'Escape') { closeWelcome(); return; }
    if (e.key === 'Escape') { if (A.open) toggleAlertCenter(false); else if (sel) select(null); return; }
    if (typing) return;
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    if (tab === 'live' && e.key === ' ' && L.mode === 'sim') { e.preventDefault(); L.playing = !L.playing; ensureLoop(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('svg [data-select]')) { e.preventDefault(); handleSelect(e.target); }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'liveSlider') { L.t = parseFloat(e.target.value); liveFrame(L.t); liveSlow(L.t); }
    if (e.target.id === 'kInput') { K.idx = 0; paletteSearch(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'popupToggle') { A.popups = e.target.checked; lsSet(STORE + '.popups', A.popups ? 'on' : 'off'); }
  });

  document.addEventListener('click', function (e) {
    var ki = e.target.closest('.k-item'); if (ki) { runPalette(+ki.dataset.k); return; }
    if (e.target.id === 'palette') { closePalette(); return; }
    if (e.target.id === 'welcome') { closeWelcome(); return; }
    if (A.open && !e.target.closest('#alertPanel') && !e.target.closest('#bellBtn')) toggleAlertCenter(false);
    var el = e.target.closest('[data-action],[data-goto],[data-tab-btn],[data-select]');
    if (!el) return;
    var act = el.dataset.action, id = el.dataset.id;
    if (!act && el.dataset.tabBtn) { showTab(el.dataset.tabBtn); return; }
    if (!act && el.dataset.select) { if (!el.closest('#view-live')) handleSelect(el); else if (el.matches('button')) handleSelect(el); return; }
    if (!act && el.dataset.goto) { showTab(el.dataset.goto); return; }
    switch (act) {
      case 'apply': doApply(); break;
      case 'chip': $('#disruptText').value = el.dataset.text; $('#disruptText').focus(); break;
      case 'undo': doApply('undo'); break;
      case 'reset':
        if (!el.dataset.armed) {
          el.dataset.armed = '1'; el.textContent = 'Tap again to reset'; el.classList.add('armed');
          setTimeout(function () { if (el.isConnected) { delete el.dataset.armed; el.textContent = 'Reset day'; el.classList.remove('armed'); } }, 4000);
          break;
        }
        $('#disruptText').value = ''; sel = null; doApply('reset'); $('#parseResult').innerHTML = ''; hud('Back to the original sample day', 'ok');
        break;
      case 'accept': S.accepted[id] = plan.byTask[id].bus; UI.justAccepted = id; renderAll(); hud(id + ' accepted', 'ok'); break;
      case 'unaccept': delete S.accepted[id]; renderAll(); break;
      case 'acceptAll':
        var n = 0;
        S.tasks.forEach(function (t) { if (statusOf(t.id) === 'open' && plan.byTask[t.id].res.late === 0) { S.accepted[t.id] = plan.byTask[t.id].bus; n++; } });
        renderAll(); hud(n + ' proposal' + (n === 1 ? '' : 's') + ' accepted', 'ok'); break;
      case 'overrule': openOverrule = id; if (el.dataset.goto) showTab('plan'); renderPlan(); var row = $('#ovSel'); if (row) { row.scrollIntoView({ block: 'center', behavior: RM ? 'auto' : 'smooth' }); row.focus(); } break;
      case 'cancelOverrule': openOverrule = null; renderPlan(); break;
      case 'doOverrule':
        var s2 = $('#ovSel'); if (!s2 || !s2.value) return;
        S.overrideFrom[id] = S.overrideFrom[id] || plan.byTask[id].bus;
        S.overrides[id] = s2.value; delete S.accepted[id]; openOverrule = null; S.lastChange = null;
        renderAll(); hud(id + ' moved to ' + s2.value + '. Plan re-optimised.', 'ok'); break;
      case 'revert': delete S.overrides[id]; delete S.overrideFrom[id]; renderAll(); hud(id + ' is back on the copilot’s proposal', 'ok'); break;
      case 'livePlay':
        var rg = liveRange(livePlan());
        if (!L.playing && L.t >= rg[1]) L.t = rg[0];
        L.playing = !L.playing; ensureLoop(); break;
      case 'liveSpeed': L.speed = +el.dataset.speed; $$('[data-action=liveSpeed]').forEach(function (b) { b.classList.toggle('on', b === el); }); ensureLoop(); break;
      case 'liveJump':
        var rj = liveRange(livePlan()); L.t = Math.min(rj[1], Math.max(rj[0], L.t + (+el.dataset.delta))); liveFrame(L.t); liveSlow(L.t); break;
      case 'liveMode': L.mode = el.dataset.mode; if (L.mode === 'real') L.playing = false; renderLive(); ensureLoop(); break;
      case 'liveSource': L.source = el.dataset.source; renderLive(); ensureLoop(); break;
      case 'layer':
        var k = el.dataset.layer; L.layers[k] = !L.layers[k];
        el.classList.toggle('on', L.layers[k]); el.setAttribute('aria-pressed', L.layers[k]);
        $('#mapWrap').classList.toggle('hide-' + k, !L.layers[k]); break;
      case 'deselect': select(null); break;
      case 'bell': toggleAlertCenter(); break;
      case 'alertsClear': A.list = []; A.unread = 0; renderBell(false); renderAlertCenter(); break;
      case 'alertView':
        var o = A.list.filter(function (x) { return String(x.id) === el.dataset.alert; })[0];
        var pop = el.closest('.popup'); if (pop) closePopup(pop);
        toggleAlertCenter(false);
        if (o && o.sel) select(o.sel.kind, o.sel.id, 'live');
        break;
      case 'popClose': closePopup(el.closest('.popup')); break;
      case 'search': openPalette(); break;
      case 'help': openWelcome(); break;
      case 'welcomeClose': closeWelcome(); break;
      case 'welcomeGo': closeWelcome(); showTab(el.dataset.tab); break;
    }
  });

  /* ================= boot ================= */
  var mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  $$('.kbd-mod').forEach(function (k) { k.textContent = mac ? '⌘' : 'Ctrl'; });
  renderAll();
  renderBell(false);
  if (!lsGet(STORE + '.welcomed')) openWelcome();
})();
