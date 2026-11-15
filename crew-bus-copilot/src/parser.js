import { Engine } from "./engine.js";
/* Rule-based disruption parser. No AI, no network. Returns command objects; app.js applies them. */
var Parser = (function () {
  var LOC_PATTERNS = [
    ['Crew Center', /\b(crew\s*cent(?:er|re)|crew\s*base|cc)\b/],
    ['Pier A', /\bpier\s*a\b/],
    ['Pier B', /\bpier\s*b\b/],
    ['Pier C', /\bpier\s*c\b/],
    ['Pier D', /\bpier\s*d\b/],
    ['Pier E', /\bpier\s*e\b/],
    ['Pier Z', /\bpier\s*z\b/],
    ['Apron V', /\bapron\s*v\b/],
    ['Apron F', /\bapron\s*f\b/],
    ['Bus Depot', /\b(bus\s*depot|depot)\b/]
  ];

  var HELP = [
    'LH400 delayed 30 min',
    'B03 broke down  (or: B03 out of service from 06:20)',
    'B03 back in service',
    'add task LH999 DEP 6 crew Crew Center to Pier A ready 06:30 due 06:45',
    'cancel LH1500',
    'undo  /  reset'
  ];

  function normFlight(s) { return s.toUpperCase().replace(/\s+/g, ''); }
  function normBus(n) { return 'B' + String(parseInt(n, 10)).padStart(2, '0'); }
  function normTime(s) { var p = s.split(':'); return String(+p[0]).padStart(2, '0') + ':' + p[1]; }

  function findLocs(lc) {
    var hits = [];
    LOC_PATTERNS.forEach(function (lp) {
      var re = new RegExp(lp[1].source, 'g'), m;
      while ((m = re.exec(lc))) hits.push({ loc: lp[0], idx: m.index });
    });
    hits.sort(function (a, b) { return a.idx - b.idx; });
    var out = [];
    hits.forEach(function (h) { if (!out.length || out[out.length - 1] !== h.loc) out.push(h.loc); });
    return out;
  }

  function parseLine(raw) {
    var line = raw.trim();
    var lc = line.toLowerCase();
    if (!line) return null;

    if (/^(undo|revert last)\b/.test(lc)) return { type: 'undo', text: line };
    if (/^(reset|start over|clear all)\b/.test(lc)) return { type: 'reset', text: line };

    var flightM = line.match(/\bLH\s?\d{2,4}\b/i);
    var flight = flightM ? normFlight(flightM[0]) : null;

    // Add task
    if (/^(add|new|extra|insert)\b/.test(lc)) return parseAdd(line, lc, flight);

    // Cancel flight
    if (/\b(cancel|cancell?ed|scrap|drop)\b/.test(lc)) {
      if (!flight) return err(line, 'Which flight? e.g. "cancel LH1500".');
      return { type: 'cancel', flight: flight, text: line };
    }

    // Bus events
    var busM = lc.match(/\bb\s?-?0?(\d{1,2})\b/);
    if (busM && !flight) {
      var bus = normBus(busM[1]);
      var timeM = lc.match(/\b(?:at|from|since|after|as of)\s*(\d{1,2}:\d{2})\b/) || lc.match(/\b(\d{1,2}:\d{2})\b/);
      var at = timeM ? normTime(timeM[1]) : null;
      if (/out of service|not available|unavailable|out of order/.test(lc)) return { type: 'busOut', bus: bus, at: at, text: line };
      if (/\b(back|repaired|fixed|restored|available|in service|returns?)\b/.test(lc)) return { type: 'busBack', bus: bus, text: line };
      if (/\b(broke|broken|breaks|breakdown|break down|down|defect|defective|flat|fault|faulty|failure|failed|accident|stuck|off|out|sick)\b/.test(lc))
        return { type: 'busOut', bus: bus, at: at, text: line };
      return err(line, 'What happened to ' + bus + '? e.g. "' + bus + ' broke down" or "' + bus + ' back in service".');
    }

    // Flight delay
    if (flight && /(delay|late|postpon|later|\+\s*\d|push(ed)? back|slip)/.test(lc)) {
      var rest = lc.replace(/\blh\s?\d{2,4}\b/g, ' ').replace(/\b\d{1,2}:\d{2}\b/g, ' ');
      var h = rest.match(/(\d+(?:[.,]\d+)?)\s*(h|hr|hrs|hour|hours)\b/);
      var mm = rest.match(/(\d{1,3})\s*(m|min|mins|minute|minutes)?\b/);
      var minutes = h ? Math.round(parseFloat(h[1].replace(',', '.')) * 60) : (mm ? parseInt(mm[1], 10) : null);
      if (!minutes) return err(line, 'How many minutes? e.g. "' + flight + ' delayed 30 min".');
      if (minutes > 600) return err(line, 'Delay of ' + minutes + ' min looks wrong (max 600).');
      return { type: 'delay', flight: flight, minutes: minutes, text: line };
    }
    if (flight && /\b(early|earlier|ahead)\b/.test(lc)) {
      var e = lc.replace(/\blh\s?\d{2,4}\b/g, ' ').match(/(\d{1,3})\s*(m|min|mins|minutes)?\b/);
      if (!e) return err(line, 'How many minutes early?');
      return { type: 'delay', flight: flight, minutes: -parseInt(e[1], 10), text: line };
    }

    return err(line, 'Not understood.');
  }

  function parseAdd(line, lc, flight) {
    if (!flight) return err(line, 'Add needs a flight number, e.g. "add task LH999 DEP 6 crew Crew Center to Pier A ready 06:30 due 06:45".');
    var dir = /\b(arr|arrival|arriving|inbound)\b/.test(lc) ? 'ARR' : (/\b(dep|departure|departing|outbound)\b/.test(lc) ? 'DEP' : null);
    var locs = findLocs(lc);
    var from = null, to = null;
    // "from X to Y" explicit
    if (locs.length >= 2) { from = locs[0]; to = locs[1]; }
    else if (locs.length === 1) {
      if (locs[0] === 'Crew Center') {
        if (dir === 'ARR') to = 'Crew Center'; else from = 'Crew Center';
      } else if (dir === 'ARR') { from = locs[0]; to = 'Crew Center'; }
      else { from = 'Crew Center'; to = locs[0]; }
    }
    if (!dir && from) dir = from === 'Crew Center' ? 'DEP' : 'ARR';
    if (!from || !to) return err(line, 'Add needs a pickup and destination, e.g. "Crew Center to Pier A".');
    if (from === to) return err(line, 'Pickup and destination are the same.');
    if (dir === 'DEP' && from !== 'Crew Center') return err(line, 'DEP tasks start at Crew Center in this prototype.');
    if (dir === 'ARR' && to !== 'Crew Center') return err(line, 'ARR tasks end at Crew Center in this prototype.');

    var readyM = lc.match(/\bready\s*(?:at|from)?\s*(\d{1,2}:\d{2})/);
    var dueM = lc.match(/\b(?:due|by|until|latest)\s*(?:at|by)?\s*(\d{1,2}:\d{2})/);
    var times = (lc.match(/\b\d{1,2}:\d{2}\b/g) || []);
    var ready = readyM ? readyM[1] : times[0];
    var due = dueM ? dueM[1] : (times.filter(function (t) { return t !== ready; })[0]);
    if (!ready) return err(line, 'Add needs a ready time, e.g. "ready 06:30".');
    ready = normTime(ready);
    var assumed = [];
    if (!due) {
      var rm = Engine.toMin(ready) + (dir === 'DEP' ? 15 : 10);
      due = Engine.fmt(rm);
      assumed.push('due ' + due + ' (ready + ' + (dir === 'DEP' ? 15 : 10) + ' min)');
    } else due = normTime(due);

    var stripped = lc.replace(/\blh\s?\d{2,4}\b/g, ' ').replace(/\b\d{1,2}:\d{2}\b/g, ' ');
    var paxM = stripped.match(/(\d{1,3})\s*(?:pax|crew|people|persons|members|seats)\b/) || stripped.match(/\b(\d{1,3})\b/);
    var pax = paxM ? parseInt(paxM[1], 10) : null;
    if (!pax) { pax = 6; assumed.push('6 pax'); }

    var crew = /full crew/.test(lc) ? 'Full crew' : /cockpit|pilots?/.test(lc) ? 'Cockpit' : /cabin/.test(lc) ? 'Cabin' : 'Crew';
    var busM = lc.match(/\b(?:on|bus)\s*b\s?0?(\d{1,2})\b/);
    return { type: 'add', text: line, assumed: assumed,
      task: { flight: flight, dir: dir, crew: crew, pax: pax, from: from, to: to, ready: ready, due: due,
        dispatcherBus: busM ? normBus(busM[1]) : null } };
  }

  function err(line, hint) { return { type: 'error', text: line, hint: hint }; }

  function parse(text) {
    return String(text).split(/\n|;/).map(parseLine).filter(Boolean);
  }

  return { parse: parse, HELP: HELP };
})();

export { Parser };
