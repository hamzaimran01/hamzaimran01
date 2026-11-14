# Crew Bus Copilot (prototype)

Open `index.html` by double-clicking it. No server, no install, no network calls. It uses only the synthetic sample data in `data.js`.

1. **Tasks & disruptions** – the task list, the bus status, and a plain-words box for disruptions, e.g.
   `LH400 delayed 30 min`, `B03 broke down`, `B05 out of service from 06:30`, `B03 back in service`,
   `add task LH999 DEP 6 crew Crew Center to Pier A ready 06:30 due 06:45`, `cancel LH1500`, `undo`, `reset`.
2. **Copilot plan** – a timeline per bus. Each assignment has a one-line "why" and Accept / Overrule buttons. The Overrule picker shows what the choice does to the plan.
3. **Overview** – today's dispatching (the `dispatcher_bus` column) next to the copilot plan for the same day: crews on time, late minutes, empty and total km, buses used, and overrides.
4. **Live board** – one row per driver showing what they are doing at the current time (standby, driving empty, waiting for crew, boarding, crew on board, drop-off, out of service), their next run, and a timeline with a moving "now" line. Below it, every task's live status: planned, bus on the way, boarding, on board, delivered or late. The clock replays the sample day (play/pause, 1× / 10× / 60×, slider) or follows the computer's clock. It shows the current plan (including disruptions and overrides) or today's dispatching. It shows planned positions only, not tracked vehicles.

## Model assumptions
- DEP: the crew counts as arrived when drop-off is done; the task is late if that is after the due time. ARR: the task is late if pickup is after the due time.
- Boarding takes 3 min per pickup stop and drop-off 2 min per drop stop. Empty driving is any driving with nobody on board.
- Sharing is allowed for the same direction, ready times within 10 min, stops at most 3 driving min apart, at most 20 seats and 3 stops, and only when nobody is late.
- Score = 40 × late min + empty min. Ties go to less driving, then to a bus already in use, then to the lower bus ID.
- Km are estimated from driving minutes at an assumed 20 km/h.
- In today's column, a task with no usable recorded bus (an added task, or its bus is out of service) goes to the first bus that can reach the pickup.
- Decisions and disruptions are saved in this browser (localStorage). Use **Reset day** to clear them.

Planning use only, no performance monitoring of drivers. Drivers are shown only by pseudonymous ID.
