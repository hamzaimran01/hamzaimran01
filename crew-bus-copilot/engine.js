/* Rule-based planning engine. All times are minutes after midnight. */
var Engine = (function () {
  var R = RULES;
  var DT = {};
  DRIVE_MINUTES.forEach(function (r) { DT[r[0] + '|' + r[1]] = r[2]; DT[r[1] + '|' + r[0]] = r[2]; });

  function drive(a, b) {
    if (a === b) return 0;
    var v = DT[a + '|' + b];
    return v == null ? R.defaultDrive : v;
  }
  function toMin(s) { var p = String(s).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function fmt(m) {
    m = Math.round(m);
    var h = Math.floor(m / 60), mm = ((m % 60) + 60) % 60;
    return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }
  function perms(a) {
    if (a.length <= 1) return [a.slice()];
    var out = [];
    a.forEach(function (x, i) {
      perms(a.slice(0, i).concat(a.slice(i + 1))).forEach(function (p) { out.push([x].concat(p)); });
    });
    return out;
  }
  function sum(a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0); }

  /* Simulate one bus run serving `tasks` (same direction) in a fixed stop order. */
  function simOrder(loc, avail, tasks, order) {
    var res = { tasks: {}, segs: [], loaded: 0 };
    var t, cur;
    if (tasks[0].dir === 'DEP') {
      var pickup = tasks[0].from;
      var empty = drive(loc, pickup);
      var maxReady = Math.max.apply(null, tasks.map(function (x) { return x.ready; }));
      var leave = Math.max(avail, maxReady - empty);
      var arrive = leave + empty;
      var board = Math.max(arrive, maxReady);
      res.segs.push({ type: 'empty', start: leave, end: arrive, from: loc, to: pickup });
      if (board > arrive) res.segs.push({ type: 'wait', start: arrive, end: board, at: pickup });
      tasks.forEach(function (x) { res.tasks[x.id] = { pickupAt: board }; });
      t = board + R.boarding; cur = pickup;
      order.forEach(function (stop) {
        var d = drive(cur, stop); t += d; res.loaded += d; t += R.dropoff;
        tasks.filter(function (x) { return x.to === stop; }).forEach(function (x) {
          var r = res.tasks[x.id]; r.doneAt = t; r.keyTime = t; r.late = Math.max(0, t - x.due);
        });
        cur = stop;
      });
      res.segs.push({ type: 'service', start: board, end: t });
      res.leave = leave; res.empty = empty; res.start = leave; res.end = t; res.endLoc = cur;
      res.route = [pickup].concat(order);
    } else {
      var dest = tasks[0].to;
      var first = order[0];
      var empty2 = drive(loc, first);
      var firstReady = Math.min.apply(null, tasks.filter(function (x) { return x.from === first; }).map(function (x) { return x.ready; }));
      var leave2 = Math.max(avail, firstReady - empty2);
      t = leave2 + empty2; cur = first;
      res.segs.push({ type: 'empty', start: leave2, end: t, from: loc, to: first });
      var serviceStart = null;
      order.forEach(function (stop, i) {
        if (i > 0) { var d = drive(cur, stop); t += d; res.loaded += d; }
        var arr = t;
        var here = tasks.filter(function (x) { return x.from === stop; });
        var stopReady = Math.max.apply(null, here.map(function (x) { return x.ready; }));
        var board2 = Math.max(arr, stopReady);
        if (i === 0) {
          if (board2 > arr) res.segs.push({ type: 'wait', start: arr, end: board2, at: stop });
          serviceStart = board2;
        }
        here.forEach(function (x) {
          var p = Math.max(arr, x.ready);
          res.tasks[x.id] = { pickupAt: p, keyTime: p, late: Math.max(0, p - x.due) };
        });
        t = board2 + R.boarding; cur = stop;
      });
      var d2 = drive(cur, dest); t += d2; res.loaded += d2; t += R.dropoff;
      tasks.forEach(function (x) { res.tasks[x.id].doneAt = t; });
      res.segs.push({ type: 'service', start: serviceStart, end: t });
      res.leave = leave2; res.empty = empty2; res.start = leave2; res.end = t; res.endLoc = dest;
      res.route = order.concat([dest]);
    }
    res.late = sum(Object.keys(res.tasks), function (k) { return res.tasks[k].late; });
    res.drive = res.empty + res.loaded;
    res.lateCount = Object.keys(res.tasks).filter(function (k) { return res.tasks[k].late > 0; }).length;
    return res;
  }

  /* Best stop order (<= 3 stops -> <= 6 permutations). */
  function simTrip(loc, avail, tasks) {
    var stops = uniq(tasks.map(function (x) { return x.dir === 'DEP' ? x.to : x.from; }));
    var best = null;
    perms(stops).forEach(function (order) {
      var r = simOrder(loc, avail, tasks, order);
      if (!best || r.late < best.late || (r.late === best.late && (r.drive < best.drive || (r.drive === best.drive && r.end < best.end)))) best = r;
    });
    return best;
  }

  function score(r) { return R.latePenalty * r.late + r.empty; }

  function busEligible(bus) { return bus.outFrom !== 0; }
  function feasible(bus, r) {
    if (r.end > bus.shiftEnd) return false;
    if (bus.outFrom != null && r.end > bus.outFrom) return false;
    return true;
  }

  function stopsOf(all) { return uniq(all.map(function (x) { return x.dir === 'DEP' ? x.to : x.from; })); }

  function canShare(ts, t) {
    var all = ts.concat([t]);
    if (all.some(function (x) { return x.dir !== t.dir; })) return false;
    if (t.dir === 'DEP' && all.some(function (x) { return x.from !== t.from; })) return false;
    if (t.dir === 'ARR' && all.some(function (x) { return x.to !== t.to; })) return false;
    var rs = all.map(function (x) { return x.ready; });
    if (Math.max.apply(null, rs) - Math.min.apply(null, rs) > R.shareWindow) return false;
    if (sum(all, function (x) { return x.pax; }) > R.capacity) return false;
    var stops = stopsOf(all);
    if (stops.length > R.maxStops) return false;
    for (var i = 0; i < stops.length; i++)
      for (var j = i + 1; j < stops.length; j++)
        if (drive(stops[i], stops[j]) > R.nearbyMax) return false;
    return true;
  }

  function initBuses(buses) {
    return buses.map(function (b) {
      return { id: b.id, driver: b.driver, start: b.start, shiftStart: b.shiftStart, shiftEnd: b.shiftEnd,
        outFrom: b.outFrom, loc: b.start, avail: b.shiftStart, trips: [] };
    });
  }
  function sortTasks(tasks) {
    return tasks.slice().sort(function (a, b) { return a.ready - b.ready || a.due - b.due || (a.id < b.id ? -1 : 1); });
  }

  function finalize(state, tasks, extra) {
    var byTask = {};
    state.forEach(function (b) {
      b.trips.forEach(function (tr, idx) {
        tr.index = idx;
        tr.tasks.forEach(function (x) { byTask[x.id] = { bus: b.id, trip: tr, res: tr.r.tasks[x.id] }; });
      });
    });
    var plan = { buses: state, byTask: byTask, unassigned: tasks.filter(function (x) { return !byTask[x.id]; }).map(function (x) { return x.id; }) };
    for (var k in extra) plan[k] = extra[k];
    plan.metrics = metrics(plan, tasks);
    return plan;
  }

  /* Copilot: greedy in ready order; each task goes to the option with lowest score.
     Options = new run on any bus, or joining a bus's latest run (sharing rules, nobody late).
     Ties: less added driving, then a bus already in use, then lower bus id. */
  function planCopilot(tasks, buses, overrides) {
    overrides = overrides || {};
    var state = initBuses(buses);
    var decisions = {};
    sortTasks(tasks).forEach(function (task) {
      var opts = [];
      state.forEach(function (bus) {
        if (!busEligible(bus)) return;
        if (overrides[task.id] && overrides[task.id] !== bus.id) return;
        var r = simTrip(bus.loc, bus.avail, [task]);
        if (feasible(bus, r)) opts.push({ bus: bus, kind: 'new', r: r, score: score(r), addDrive: r.drive, startLoc: bus.loc, startAvail: bus.avail, prev: bus.trips[bus.trips.length - 1] });
        var last = bus.trips[bus.trips.length - 1];
        if (last && canShare(last.tasks, task)) {
          var r2 = simTrip(last.startLoc, last.startAvail, last.tasks.concat([task]));
          if (r2.late === 0 && feasible(bus, r2)) {
            opts.push({ bus: bus, kind: 'join', r: r2, last: last,
              score: R.latePenalty * (r2.late - last.r.late) + (r2.empty - last.r.empty),
              addDrive: r2.drive - last.r.drive, startLoc: last.startLoc, startAvail: last.startAvail });
          }
        }
      });
      opts.sort(function (a, b) {
        return a.score - b.score || a.addDrive - b.addDrive ||
          ((a.bus.trips.length ? 0 : 1) - (b.bus.trips.length ? 0 : 1)) ||
          (a.kind === 'join' ? 0 : 1) - (b.kind === 'join' ? 0 : 1) ||
          (a.bus.id < b.bus.id ? -1 : 1);
      });
      var best = opts[0];
      if (!best) { decisions[task.id] = { none: true }; return; }
      var runner = null;
      for (var i = 1; i < opts.length; i++) if (opts[i].bus.id !== best.bus.id) { runner = opts[i]; break; }
      var bus = best.bus;
      if (best.kind === 'new') {
        bus.trips.push({ tasks: [task], r: best.r, startLoc: bus.loc, startAvail: bus.avail });
      } else {
        best.last.tasks = best.last.tasks.concat([task]);
        best.last.r = best.r;
      }
      var lt = bus.trips[bus.trips.length - 1];
      bus.loc = lt.r.endLoc; bus.avail = lt.r.end;
      decisions[task.id] = {
        kind: best.kind, score: best.score, addDrive: best.addDrive, overridden: !!overrides[task.id],
        runner: runner ? { bus: runner.bus.id, score: runner.score, addDrive: runner.addDrive, kind: runner.kind } : null,
        options: opts.length
      };
    });
    return finalize(state, tasks, { decisions: decisions });
  }

  /* Today's dispatching: each task on its own run, on the dispatcher_bus.
     Tasks without a usable recorded bus (added task, broken-down bus) go to the bus
     that can reach the pickup first, as call-by-call dispatch would. */
  function planBaseline(tasks, buses) {
    var state = initBuses(buses);
    var reassigned = {};
    sortTasks(tasks).forEach(function (task) {
      var bus = state.filter(function (b) { return b.id === task.dispatcherBus; })[0];
      var r = null;
      if (bus && busEligible(bus)) { r = simTrip(bus.loc, bus.avail, [task]); if (!feasible(bus, r)) r = null; }
      if (!r) {
        var best = null;
        state.forEach(function (b) {
          if (!busEligible(b)) return;
          var rr = simTrip(b.loc, b.avail, [task]);
          if (!feasible(b, rr)) return;
          var k = rr.tasks[task.id].pickupAt;
          if (!best || k < best.k || (k === best.k && b.id < best.b.id)) best = { b: b, r: rr, k: k };
        });
        if (!best) return;
        bus = best.b; r = best.r;
        reassigned[task.id] = bus.id;
      }
      bus.trips.push({ tasks: [task], r: r, startLoc: bus.loc, startAvail: bus.avail });
      bus.loc = r.endLoc; bus.avail = r.end;
    });
    return finalize(state, tasks, { reassigned: reassigned });
  }

  function metrics(plan, tasks) {
    var m = { tasks: tasks.length, onTime: 0, lateMin: 0, lateTasks: 0, empty: 0, drive: 0, trips: 0, busesUsed: 0,
      pax: 0, paxOnTime: 0, unassigned: plan.unassigned.length };
    tasks.forEach(function (t) {
      m.pax += t.pax;
      var a = plan.byTask[t.id];
      if (!a) return;
      if (a.res.late === 0) { m.onTime++; m.paxOnTime += t.pax; } else { m.lateTasks++; m.lateMin += a.res.late; }
    });
    plan.buses.forEach(function (b) {
      if (b.trips.length) m.busesUsed++;
      b.trips.forEach(function (tr) { m.trips++; m.empty += tr.r.empty; m.drive += tr.r.drive; });
    });
    m.km = m.drive * R.kmPerMin;
    m.emptyKm = m.empty * R.kmPerMin;
    return m;
  }

  return { drive: drive, toMin: toMin, fmt: fmt, simTrip: simTrip, canShare: canShare, score: score,
    planCopilot: planCopilot, planBaseline: planBaseline, metrics: metrics };
})();
