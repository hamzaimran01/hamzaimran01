# Apron Dispatch Board (prototype)

A standalone, real-time **crew bus dispatch board** for an airport apron. It follows the way established ground-operations resource-management systems work, and it is built from scratch as original code with [Palantir Blueprint](https://github.com/palantir/blueprint) (React). It runs offline: open `index.html` by double-clicking it.

## What it does
| Function | In the app |
|---|---|
| **Rule-based task generation** from the flight schedule | *Flights & rules*: 166 flights → 195 crew jobs. Editable rules: crew ready / due relative to STD and STA, widebody cockpit and cabin split, dispatch lead time |
| **Automatic initial allocation** by an optimizer | On load, and with **Optimize open work**: the closest suitable bus, crews share when safe, score = 40 × late minutes + empty minutes |
| **Dispatch board (Gantt)** | One row per bus and driver ID on a time axis, job bars coloured by lifecycle, empty drives hatched, off-shift and out-of-service zones, a moving "now" line, and the **unassigned lane** at the bottom |
| **Manual override** | Drag a job to another bus, or onto the unassigned lane. Or select it and use *Move to bus… / Unassign* |
| **Manage by exception** | Side panel: unassigned jobs, late jobs, unconfirmed jobs (sent but not confirmed after 3 min) and conflicts. **Auto-fix** runs a minimal re-plan |
| **Real-time re-planning** | Delay a flight, break a bus down, or add a short-notice departure. With auto re-plan on, only affected, late or stranded jobs move, and jobs already sent to drivers stay put |
| **Driver terminal** | *Driver tablet*: jobs arrive at a set lead time before departure; the driver confirms, reports incidents (traffic delay, crew not at pickup, vehicle defect → breakdown) and reads dispatcher messages. Other buses confirm automatically |
| **Positions** | *Map*: planned positions of all buses on a schematic apron (planned, not GPS) |
| **KPIs** | On-time share, late jobs and minutes, buses in use, runs, crews per run, total and empty km, jobs per hour, vehicle utilisation |

Job lifecycle: **Planned → Sent to driver → Confirmed → In progress → Done** (or **Unassigned**).

## Data
Synthetic and seeded (the same on every load): 20 crew buses (`CB01`–`CB20`, drivers `D-01`–`D-20`) and a 05:30–11:00 flight wave on the schematic Frankfurt apron used by the Crew Bus Copilot. The 20-bus fleet mirrors public figures for Frankfurt crew-bus operations (up to 20 crew buses at once, about 1,100 jobs a day).

## Build
```
npm install
npm run build   # bundles src/ into dist/ with esbuild (only the icons used)
```
`src/data.js` holds the geometry, fleet, schedule and rules. `src/model.js` holds task generation, the optimizer wrapper, evaluation, lifecycle and exceptions. `src/engine.js` is the planning engine, shared design with the Crew Bus Copilot. The views are in `src/views/`.

## Research basis (public sources)
The functions above follow publicly described capabilities of airport ground-operations dispatch systems: automatic task generation from rules, an optimizer that does the initial assignment, dispatchers managing by exception, real-time re-assignment, drivers confirming jobs on in-vehicle tablets, Gantt-based dispatcher views, and crew-bus allocation using bus and aircraft positions.
- INFORM GroundStar product pages: https://www.inform-software.com/en/software/groundstar
- GroundStar demo clips: https://www.inform-software.com/en/lp/groundstar-demo-clips
- GS TeamWork (decentralised task allocation): https://www.inform-software.com/en/lp/gs-teamwork
- Lufthansa LEOS crew transport: https://lufthansa-leos.com/en/transportation-services

This is an **original prototype**. It contains no vendor code, branding or screens, and it is not affiliated with or endorsed by any vendor.

## Works council
Planning view, not vehicle tracking. Drivers appear only as IDs, and there is no per-driver performance data (utilisation is per vehicle).
