/* Synthetic data only. Airport geometry matches the Crew Bus Copilot prototype (schematic Frankfurt apron). */

export const LOCATIONS = ['Crew Center', 'Pier A', 'Pier B', 'Pier C', 'Pier D', 'Pier E', 'Pier Z', 'Apron V', 'Apron F', 'Bus Depot'];

/* Driving minutes (symmetric). Pairs not listed use RULES.defaultDrive. */
export const DRIVE_MINUTES = [
  ['Crew Center', 'Pier A', 3], ['Crew Center', 'Pier B', 4], ['Crew Center', 'Pier Z', 4], ['Crew Center', 'Apron V', 6],
  ['Crew Center', 'Apron F', 8], ['Crew Center', 'Bus Depot', 7], ['Pier A', 'Pier B', 2], ['Pier A', 'Pier Z', 2],
  ['Pier B', 'Pier Z', 3], ['Apron V', 'Apron F', 10], ['Bus Depot', 'Apron F', 5],
  ['Crew Center', 'Pier C', 3], ['Crew Center', 'Pier D', 5], ['Crew Center', 'Pier E', 5],
  ['Pier A', 'Pier C', 4], ['Pier A', 'Pier D', 6], ['Pier A', 'Pier E', 7],
  ['Pier Z', 'Pier C', 6], ['Pier Z', 'Pier D', 8], ['Pier Z', 'Pier E', 9],
  ['Pier B', 'Pier C', 3], ['Pier B', 'Pier D', 4], ['Pier B', 'Pier E', 5],
  ['Apron V', 'Pier C', 7], ['Apron V', 'Pier D', 9], ['Apron V', 'Pier E', 10],
  ['Apron F', 'Pier C', 3], ['Apron F', 'Pier D', 2], ['Apron F', 'Pier E', 2],
  ['Bus Depot', 'Pier C', 5], ['Bus Depot', 'Pier D', 3], ['Bus Depot', 'Pier E', 2],
  ['Pier C', 'Pier D', 2], ['Pier C', 'Pier E', 3], ['Pier D', 'Pier E', 2]
];

/* Optimizer rules (same model as the copilot). */
export const RULES = {
  boarding: 3, dropoff: 2, capacity: 20, shareWindow: 10, maxStops: 3, nearbyMax: 3,
  latePenalty: 40, defaultDrive: 6, kmPerMin: 20 / 60
};

/* Task-generation rules: how crew transport tasks are derived from the flight schedule. Editable in the app. */
export const DEFAULT_TASK_RULES = {
  depReadyBefore: 50,   // departing crew is ready at the Crew Center this many min before STD
  depDueBefore: 35,     // and must be at the aircraft this many min before STD
  arrReadyAfter: 8,     // arriving crew leaves the aircraft this many min after STA
  arrDueAfter: 18,      // and must be picked up by this many min after STA
  splitWidebody: true,  // widebody: cockpit and cabin travel as two tasks (cockpit 5 min later)
  dispatchLead: 10      // a task is sent to the driver's tablet this many min before the bus sets off
};

/* Stands per area (synthetic stand numbers). */
export const STANDS = {
  'Pier A': ['A12', 'A14', 'A16', 'A20', 'A22', 'A26'],
  'Pier B': ['B20', 'B22', 'B24', 'B26', 'B28'],
  'Pier C': ['C4', 'C6', 'C8', 'C14'],
  'Pier D': ['D1', 'D4', 'D8'],
  'Pier E': ['E2', 'E5', 'E8'],
  'Pier Z': ['Z15', 'Z18', 'Z22', 'Z25'],
  'Apron V': ['V104', 'V107', 'V112', 'V118'],
  'Apron F': ['F209', 'F212', 'F215']
};

export const AIRCRAFT = {
  A319: { body: 'narrow', cockpit: 2, cabin: 3 }, A320: { body: 'narrow', cockpit: 2, cabin: 4 }, A321: { body: 'narrow', cockpit: 2, cabin: 5 },
  A333: { body: 'wide', cockpit: 3, cabin: 10 }, A359: { body: 'wide', cockpit: 3, cabin: 12 }, B748: { body: 'wide', cockpit: 3, cabin: 16 }, A388: { body: 'wide', cockpit: 4, cabin: 20 }
};

const fmt = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

/* Seeded generator: 20 buses and a 05:30–10:30 flight wave (same data on every load). */
export function generateWorld() {
  let seed = 4711;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];

  const starts = ['Bus Depot', 'Bus Depot', 'Bus Depot', 'Crew Center', 'Crew Center', 'Pier A', 'Pier B', 'Apron V'];
  const buses = [];
  for (let i = 1; i <= 20; i++) {
    const n = String(i).padStart(2, '0');
    const early = i % 2 === 1;
    buses.push({ id: 'CB' + n, driver: 'D-' + n, start: i <= 4 ? ['Crew Center', 'Crew Center', 'Bus Depot', 'Apron V'][i - 1] : pick(starts), shift: early ? '04:30-13:00' : '05:15-13:45', seats: 20 });
  }

  const areas = Object.keys(STANDS);
  const weights = ['Pier A', 'Pier A', 'Pier A', 'Pier B', 'Pier B', 'Pier C', 'Pier C', 'Pier D', 'Pier E', 'Pier Z', 'Pier Z', 'Apron V', 'Apron V', 'Apron F'];
  const narrow = ['A319', 'A320', 'A320', 'A320', 'A321', 'A321'];
  const wide = ['A333', 'A359', 'A359', 'B748', 'A388'];
  const flights = [];
  const used = {};
  const flightNo = () => { let f; do { f = 'LH ' + (100 + Math.floor(rnd() * 1900)); } while (used[f]); used[f] = 1; return f; };
  // departures: STD 06:20–11:00, arrivals: STA 05:20–10:10
  for (let k = 0; k < 92; k++) {
    const area = pick(weights), isWide = (area === 'Pier Z' || area === 'Pier B' || area === 'Apron F') ? rnd() < 0.55 : rnd() < 0.12;
    const std = 380 + Math.floor(rnd() * 280);
    flights.push({ flight: flightNo(), type: 'DEP', time: fmt(std), stand: pick(STANDS[area]), area, aircraft: pick(isWide ? wide : narrow) });
  }
  for (let k = 0; k < 74; k++) {
    const area = pick(weights), isWide = (area === 'Pier Z' || area === 'Pier B' || area === 'Apron F') ? rnd() < 0.5 : rnd() < 0.1;
    const sta = 320 + Math.floor(rnd() * 290);
    flights.push({ flight: flightNo(), type: 'ARR', time: fmt(sta), stand: pick(STANDS[area]), area, aircraft: pick(isWide ? wide : narrow) });
  }
  flights.sort((a, b) => a.time.localeCompare(b.time) || a.flight.localeCompare(b.flight));
  return { buses, flights };
}

export const WINDOW = { start: 330, end: 660 }; // board shows 05:30–11:00
