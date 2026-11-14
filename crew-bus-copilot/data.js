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
