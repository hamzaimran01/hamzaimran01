/* Synthetic sample data only. No real or confidential data. Drivers are pseudonymized (D-01 ...). */

var SAMPLE_TASKS = [
  { id: 'T01', flight: 'LH1132', dir: 'DEP', crew: 'Crew',      pax: 6,  from: 'Crew Center', to: 'Pier A',      ready: '06:05', due: '06:20', dispatcherBus: 'B01' },
  { id: 'T02', flight: 'LH1420', dir: 'DEP', crew: 'Crew',      pax: 6,  from: 'Crew Center', to: 'Pier B',      ready: '06:08', due: '06:23', dispatcherBus: 'B02' },
  { id: 'T03', flight: 'LH400',  dir: 'DEP', crew: 'Cabin',     pax: 14, from: 'Crew Center', to: 'Pier Z',      ready: '06:10', due: '06:30', dispatcherBus: 'B03' },
  { id: 'T04', flight: 'LH400',  dir: 'DEP', crew: 'Cockpit',   pax: 3,  from: 'Crew Center', to: 'Pier Z',      ready: '06:15', due: '06:30', dispatcherBus: 'B04' },
  { id: 'T05', flight: 'LH1098', dir: 'ARR', crew: 'Crew',      pax: 6,  from: 'Apron V',     to: 'Crew Center', ready: '06:12', due: '06:22', dispatcherBus: 'B05' },
  { id: 'T06', flight: 'LH1302', dir: 'DEP', crew: 'Crew',      pax: 6,  from: 'Crew Center', to: 'Apron V',     ready: '06:20', due: '06:35', dispatcherBus: 'B01' },
  { id: 'T07', flight: 'LH1210', dir: 'DEP', crew: 'Crew',      pax: 6,  from: 'Crew Center', to: 'Pier A',      ready: '06:22', due: '06:37', dispatcherBus: 'B02' },
  { id: 'T08', flight: 'LH1455', dir: 'ARR', crew: 'Crew',      pax: 6,  from: 'Pier B',      to: 'Crew Center', ready: '06:25', due: '06:35', dispatcherBus: 'B06' },
  { id: 'T09', flight: 'LH440',  dir: 'ARR', crew: 'Full crew', pax: 17, from: 'Pier Z',      to: 'Crew Center', ready: '06:30', due: '06:40', dispatcherBus: 'B03' },
  { id: 'T10', flight: 'LH1176', dir: 'DEP', crew: 'Crew',      pax: 6,  from: 'Crew Center', to: 'Apron F',     ready: '06:35', due: '06:50', dispatcherBus: 'B04' },
  { id: 'T11', flight: 'LH1388', dir: 'DEP', crew: 'Crew',      pax: 6,  from: 'Crew Center', to: 'Apron F',     ready: '06:38', due: '06:53', dispatcherBus: 'B05' },
  { id: 'T12', flight: 'LH1027', dir: 'ARR', crew: 'Crew',      pax: 6,  from: 'Apron V',     to: 'Crew Center', ready: '06:40', due: '06:50', dispatcherBus: 'B01' },
  { id: 'T13', flight: 'LH1290', dir: 'DEP', crew: 'Crew',      pax: 6,  from: 'Crew Center', to: 'Pier B',      ready: '06:45', due: '07:00', dispatcherBus: 'B06' },
  { id: 'T14', flight: 'LH1311', dir: 'DEP', crew: 'Crew',      pax: 6,  from: 'Crew Center', to: 'Pier B',      ready: '06:47', due: '07:02', dispatcherBus: 'B02' },
  { id: 'T15', flight: 'LH1500', dir: 'ARR', crew: 'Crew',      pax: 6,  from: 'Pier A',      to: 'Crew Center', ready: '06:50', due: '07:00', dispatcherBus: 'B03' }
];

var SAMPLE_BUSES = [
  { id: 'B01', driver: 'D-01', start: 'Crew Center', shift: '04:00-12:30' },
  { id: 'B02', driver: 'D-02', start: 'Crew Center', shift: '04:00-12:30' },
  { id: 'B03', driver: 'D-03', start: 'Bus Depot',   shift: '05:30-14:00' },
  { id: 'B04', driver: 'D-04', start: 'Bus Depot',   shift: '05:30-14:00' },
  { id: 'B05', driver: 'D-05', start: 'Apron V',     shift: '04:00-12:30' },
  { id: 'B06', driver: 'D-06', start: 'Pier B',      shift: '05:30-14:00' }
];

var LOCATIONS = ['Crew Center', 'Pier A', 'Pier B', 'Pier Z', 'Apron V', 'Apron F', 'Bus Depot'];

/* Driving minutes, symmetric. Any pair not listed = RULES.defaultDrive. */
var DRIVE_MINUTES = [
  ['Crew Center', 'Pier A', 3],
  ['Crew Center', 'Pier B', 4],
  ['Crew Center', 'Pier Z', 4],
  ['Crew Center', 'Apron V', 6],
  ['Crew Center', 'Apron F', 8],
  ['Crew Center', 'Bus Depot', 7],
  ['Pier A', 'Pier B', 2],
  ['Pier A', 'Pier Z', 2],
  ['Pier B', 'Pier Z', 3],
  ['Apron V', 'Apron F', 10],
  ['Bus Depot', 'Apron F', 5]
];

var RULES = {
  boarding: 3,        // min per pickup stop
  dropoff: 2,         // min per drop-off stop
  capacity: 20,       // seats per bus
  shareWindow: 10,    // ready times within 10 min may share
  maxStops: 3,        // max stops on the "spread" side of a shared trip
  nearbyMax: 3,       // stops are "nearby" if <= 3 driving min apart
  latePenalty: 40,    // score = 40 x late min + empty driving min
  defaultDrive: 6,
  kmPerMin: 20 / 60   // assumed average apron speed 20 km/h
};

/* Public Frankfurt Airport facts (sources listed). Crew tasks and buses above remain synthetic. */
var FRA_FACTS = {
  items: [
    { value: '61.6 M', label: 'passengers in 2024', note: '+3.7% on 2023' },
    { value: '440,853', label: 'aircraft movements in 2024', note: 'about 1,200 a day' },
    { value: '2.1 M t', label: 'cargo in 2024', note: '+6.2% on 2023' },
    { value: '60+', label: 'gates in Terminal 1', note: 'Concourses A, B, C and Z' }
  ],
  brief: [
    { value: '≈ 1,100', label: 'crew bus trips a day', note: 'from the project brief' },
    { value: '€47 M', label: 'delay compensation, Q1 2025', note: 'Lufthansa Group, from the project brief' }
  ],
  sources: [
    { label: 'Fraport traffic figures 2024', url: 'https://www.fraport.com/en/newsroom/press-releases/2025/traffic-figures/fraport-traffic-figures-2024--frankfurt-remains-the-leading-airp.html' },
    { label: 'Fraport: airside and terminal operations', url: 'https://www.fraport.com/en/business-areas/operations/airside-and-terminal-operations.html' },
    { label: 'Wikipedia: Frankfurt Airport', url: 'https://en.wikipedia.org/wiki/Frankfurt_Airport' }
  ]
};

/* Product tour video chapters (seconds into tour.mp4) */
var TOUR_CHAPTERS = [{"t": 0.0, "title": "Intro"}, {"t": 7.4, "title": "The problem"}, {"t": 14.4, "title": "Tasks"}, {"t": 20.3, "title": "Disruptions"}, {"t": 27.6, "title": "Plan"}, {"t": 34.5, "title": "Accept"}, {"t": 41.1, "title": "Live map"}, {"t": 49.6, "title": "Drivers on duty"}, {"t": 55.5, "title": "Details"}, {"t": 61.9, "title": "Alerts"}, {"t": 74.0, "title": "Results"}, {"t": 81.0, "title": "Summary"}];

/* ---------- Scaled synthetic fleet: 80 buses, ~315 crew jobs (seeded, same every load) ----------
   The first 6 buses and 15 tasks above are the original brief's sample; the rest are generated. */
LOCATIONS.push('Pier C', 'Pier D', 'Pier E');
DRIVE_MINUTES.push(
  ['Crew Center', 'Pier C', 3], ['Crew Center', 'Pier D', 5], ['Crew Center', 'Pier E', 5],
  ['Pier A', 'Pier C', 4], ['Pier A', 'Pier D', 6], ['Pier A', 'Pier E', 7],
  ['Pier Z', 'Pier C', 6], ['Pier Z', 'Pier D', 8], ['Pier Z', 'Pier E', 9],
  ['Pier B', 'Pier C', 3], ['Pier B', 'Pier D', 4], ['Pier B', 'Pier E', 5],
  ['Apron V', 'Pier C', 7], ['Apron V', 'Pier D', 9], ['Apron V', 'Pier E', 10],
  ['Apron F', 'Pier C', 3], ['Apron F', 'Pier D', 2], ['Apron F', 'Pier E', 2],
  ['Bus Depot', 'Pier C', 5], ['Bus Depot', 'Pier D', 3], ['Bus Depot', 'Pier E', 2],
  ['Pier C', 'Pier D', 2], ['Pier C', 'Pier E', 3], ['Pier D', 'Pier E', 2]
);
var DATA_VERSION = 'fleet40-v1';
var FLEET_SIZE = 40;
(function generate() {
  var seed = 20261115;
  function rnd() { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  // buses B07..B80
  var starts = ['Bus Depot', 'Bus Depot', 'Bus Depot', 'Bus Depot', 'Crew Center', 'Crew Center', 'Crew Center', 'Pier A', 'Pier B', 'Pier C', 'Pier D', 'Pier E', 'Pier Z', 'Apron V', 'Apron F'];
  for (var i = 7; i <= FLEET_SIZE; i++) {
    var n = String(i).padStart(2, '0');
    SAMPLE_BUSES.push({ id: 'B' + n, driver: 'D-' + n, start: pick(starts), shift: rnd() < 0.5 ? '04:00-12:30' : '05:30-14:00' });
  }
  // crew tasks T16..T315 between 06:00 and 07:35
  var stands = ['Pier A', 'Pier A', 'Pier B', 'Pier B', 'Pier C', 'Pier C', 'Pier D', 'Pier E', 'Pier Z', 'Pier Z', 'Apron V', 'Apron F'];
  var used = {}; SAMPLE_TASKS.forEach(function (t) { used[t.flight] = 1; });
  function flight() { var f; do { f = 'LH' + (100 + Math.floor(rnd() * 1900)); } while (used[f]); used[f] = 1; return f; }
  var id = 16;
  function push(t) { t.id = 'T' + String(id++).padStart(2, '0'); t.dispatcherBus = null; SAMPLE_TASKS.push(t); }
  while (SAMPLE_TASKS.length < 250) {
    var ready = 360 + Math.floor(rnd() * 80);
    var stand = pick(stands), fl = flight(), r = rnd();
    if (r < 0.6) {
      if (rnd() < 0.3) {
        // a long-haul departure: cabin and cockpit as two tasks on one flight
        push({ flight: fl, dir: 'DEP', crew: 'Cabin', pax: 10 + Math.floor(rnd() * 5), from: 'Crew Center', to: stand, ready: hhmm(ready), due: hhmm(ready + 20) });
        push({ flight: fl, dir: 'DEP', crew: 'Cockpit', pax: 3, from: 'Crew Center', to: stand, ready: hhmm(ready + 5), due: hhmm(ready + 20) });
      } else {
        push({ flight: fl, dir: 'DEP', crew: 'Crew', pax: pick([4, 5, 6, 6, 6, 7, 8]), from: 'Crew Center', to: stand, ready: hhmm(ready), due: hhmm(ready + 15) });
      }
    } else {
      var full = rnd() < 0.2;
      push({ flight: fl, dir: 'ARR', crew: full ? 'Full crew' : 'Crew', pax: full ? 14 + Math.floor(rnd() * 4) : pick([4, 5, 6, 6, 7]), from: stand, to: 'Crew Center', ready: hhmm(ready), due: hhmm(ready + 10) });
    }
  }
  while (SAMPLE_TASKS.length > 250) SAMPLE_TASKS.pop();
})();

export { SAMPLE_TASKS, SAMPLE_BUSES, LOCATIONS, DRIVE_MINUTES, RULES, FRA_FACTS, TOUR_CHAPTERS, DATA_VERSION, FLEET_SIZE };
