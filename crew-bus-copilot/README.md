# Crew Bus Copilot (prototype)

Open `index.html` by double-clicking it. There is no server, no install and no network call. On first open, a short introduction explains the case.

## Built with Palantir Blueprint
The UI is React 18 + [Palantir Blueprint](https://github.com/palantir/blueprint) v6 (`@blueprintjs/core`, `@blueprintjs/select`, `@blueprintjs/icons`, all published from that repository). Every screen is built from stock Blueprint components and styled with Blueprint's design tokens:
- **Layout:** Navbar and Tabs, a bottom Navbar with ButtonGroup on phones, Section and SectionCard, Card and CardList
- **Data and status:** HTMLTable, Tag and CompoundTag, Callout, ProgressBar, NonIdealState
- **Inputs and controls:** Button, AnchorButton, SegmentedControl, Slider, Switch, TextArea, InputGroup, HTMLSelect
- **Overlays:** Dialog, Alert, Popover and Menu, OverlayToaster, Omnibar, Tooltip
- **Theme:** Blueprint typography classes and dark theme (`bp6-dark`)

The only custom-drawn parts are the airport map, the timelines and the tour spotlight, because Blueprint has no components for these. They use Blueprint palette tokens.

The bundle is prebuilt in `dist/`, so `index.html` works offline. To change the code:
```
npm install
npm run build      # bundles src/ into dist/app.js and dist/app.css with esbuild
```
Source: `src/main.jsx` (entry), `src/App.jsx` (shell, alerts, command bar, dialogs), `src/pages/*.jsx`, `src/Tour.jsx`. The planning logic is UI-free in `src/engine.js`, `src/parser.js`, `src/logic.js`, `src/map.js` and `src/data.js`. Only the Blueprint icons the app uses are bundled, and `build.mjs` generates `src/icons.js`.

## Pages
1. **Tasks**: every crew that needs a bus. Report a disruption in plain words, for example `LH400 delayed 30 min`, `B03 broke down`, `B05 out of service from 06:30`, `B03 back in service`, `add task LH999 DEP 6 crew Crew Center to Pier A ready 06:30 due 06:45`, `cancel LH1500`, `undo` or `reset`.
2. **Plan**: a timeline per bus. Each assignment has a one-line "why" and **Accept** / **Overrule** buttons. Overrule shows what each alternative bus would do to the whole plan.
3. **Live map**: a drawn, schematic map of Frankfurt Airport (runways, Terminal 1 with concourses A/B/C/Z, Terminal 2, the 7 locations). Buses move along their routes in sync with a replay clock (play/pause, 1× / 10× / 60×, slider) or the real clock. Next to the map:
   - an inspector panel for the selected bus, crew task, flight or place
   - layer toggles: airport, routes, labels, waiting crews
   - a timeline row per bus and driver, and a live status table for every crew task

   Selecting something highlights it everywhere: on the map, in the timeline and in the table.
4. **Results**: today's dispatching (the `dispatcher_bus` column) next to the copilot on the same day, with a plain-language headline and public Frankfurt Airport figures (sources cited).

## Product tour
- **Video guide** (`tour.mp4`, 81 s, with chapters): opens from the **Tour** button in the header or the welcome sheet. It is a pitch-style, step-by-step walkthrough: the problem, tasks, a typed disruption, explained proposals, accepting, the live map, details, alerts, results.
- **Interactive tour**: the same story played live inside the app with a spotlight and captions, using pause, back/next, exit and keyboard (space, ←/→, esc). Your own data is set aside during the tour and restored afterwards.
- The video was recorded from the interactive tour with Playwright and encoded with ffmpeg, so it always shows the real product.

## Airfield camera
Live map → **Airfield camera**. Fraport runs no official 24/7 public stream, so this view links to the live Frankfurt plane-spotter streams on YouTube and to weather webcams near FRA. You can also dock a stream link of your choice. A docked stream plays inline when `index.html` is opened locally; shared artifact links can't embed outside video and open it on YouTube instead.

## Across the app
- **⌘K / Ctrl+K or `/`** opens a command bar: search tasks, flights and buses, jump to pages, or type a disruption to apply it.
- **Alerts**: pop-up banners and an alert center (bell) for crews that will be late, tight connections (≤ 1 min spare), buses going out of service, missing buses, and plan updates. Each alert has a "View" button that selects the item on the map. Pop-ups can be switched off.
- **Design**: Blueprint components and palette, light and dark mode (it follows the system), and a bottom tab bar on phones. The motion includes view transitions, count-ups, a pop when you accept, buses gliding on the map, and pulsing live indicators. All of it turns off when the system "reduce motion" setting is on.

## Data
- Crew tasks, buses and driving times are the **synthetic** sample from the brief (`data.js`).
- The map follows Frankfurt Airport's real layout, but schematically: positions are approximate and not to scale, and it shows **planned** positions, not tracked vehicles.
- The airport figures (61.6 M passengers, 440,853 movements and 2.1 M t cargo in 2024, 60+ gates in Terminal 1) come from Fraport's 2024 traffic figures and its terminal page. Links are in `data.js` and on the Results page.

## Model assumptions
- DEP: the crew counts as arrived when drop-off is done; the task is late if that is after the due time. ARR: the task is late if pickup is after the due time.
- Boarding takes 3 min per pickup stop and drop-off 2 min per drop stop. Empty driving is any driving with nobody on board.
- Sharing is allowed for the same direction, ready times within 10 min, stops at most 3 driving min apart, at most 20 seats and 3 stops, and only when nobody is late.
- Score = 40 × late min + empty min. Ties go to less driving, then to a bus already in use, then to the lower bus ID.
- Km are estimated from driving minutes at an assumed 20 km/h.

## Works council
Planning use only, no performance monitoring of drivers. Driver IDs (D-01 …) appear only in planning tables. The map and alerts show bus IDs only.
