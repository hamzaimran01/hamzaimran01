# Crew Bus Copilot: 4-minute demo script (non-technical audience)

Plain-language talk track. **SAY** is what you say, **DO** is what you click. The numbers below are what the screen shows if you follow the clicks exactly.

## Before you go on stage (2 min, not part of the 4)
1. Double-click `C:\Users\DispatchingAI\crew-bus-copilot\index.html`. If the welcome box appears, close it with the **X**.
2. **Tasks** tab: click **Reset day** and confirm, so old test changes are gone.
3. Press **F11** for full screen and **Ctrl +** twice so the back row can read it.
4. Leave it on the **Tasks** tab. Keep slide 5 with the backup video ready in PowerPoint.

## 0:00–0:30 · The problem
**SAY:** "Every morning at Frankfurt, dispatchers send about 1,100 crew bus trips, one phone call at a time. Crews reach their aircraft late, buses drive around empty, and one late crew can delay a whole flight. We built a copilot that plans the buses, while the dispatcher stays in charge."

**DO:** nothing yet. The Tasks list is on screen.

## 0:30–1:10 · Something goes wrong
**SAY:** "This is one morning's work: 250 crews that need a bus, and 40 buses to do it. Now something changes. Flight LH400 is 30 minutes late. Today, the dispatcher re-plans by phone."

**DO:** in **Report a disruption**, type `LH400 delayed 30 min` and press **Update plan**.

**SAY:** "I just typed it in plain words. The copilot re-planned all 40 buses in about a second and moved over a hundred crews to a better bus, which no one could do by phone."

## 1:10–1:50 · The copilot explains, the human decides
**DO:** click the **Plan** tab. Point at the first **Why** line.

**SAY:** "Every proposal says why: which bus, how far it drives with nobody on board, and which crews share it." (Read the first Why line aloud.)

**DO:** click **Accept** on the first one. Then click **Overrule** on another, show the list of buses, and click **Cancel**.

**SAY:** "The dispatcher accepts with one click, or picks another bus and sees the effect straight away. Every decision is logged."

## 1:50–3:00 · Watch the morning happen
**DO:** click the **Live map** tab. Press **−5** until the clock shows **06:00**. Choose **60×** and press **Play**. Scroll a little so the bus rows and the open jobs are both on screen.

**SAY:** "This is the dispatcher's board. On the map, all 40 buses. Below, every active bus with its driver, and at the bottom the open jobs. Watch: as the morning runs, each job jumps from the open list onto its bus."

**DO:** after about 10 seconds, press **Pause**, scroll up, and click one bus on the map. Optional: click **Today's dispatching** at the top right to show all 40 buses driving, then switch back to **Copilot plan**.

**SAY:** "Click any bus and you see where it is, who it's carrying and what's next. If a crew is at risk of being late, an alert pops up here at the bottom right, before it's too late."

## 3:00–3:40 · The result
**DO:** click the **Results** tab and point at the headline.

**SAY:** "Same morning, two ways. With today's call-by-call dispatching, 15 crews are late and all 40 buses are on the road. With the copilot, all 250 crews are on time, with about 80% less empty driving, using 22 buses. The other 18 stay free as a reserve."

## 3:40–4:00 · Close
**SAY:** "The copilot proposes, the dispatcher decides. We'd test it for 90 days next to the dispatchers, without changing their work, and decide on facts. It runs on test data only, and drivers appear as IDs, so there is no tracking of individual drivers."

**DO:** **Alt+Tab** back to PowerPoint.

## If something goes wrong
- The app won't open, or freezes: go to slide 5 and play the video. Say: "Here is the same demo, recorded."
- You clicked the wrong thing: **Tasks → Reset day** puts everything back, then start again from 0:30.
- The numbers differ from this card: you probably accepted an overrule. Go to **Plan** and click **Back to copilot**.

## Words to avoid → say instead
- "algorithm", "score", "engine" → **"the copilot's rules"**
- "DEP / ARR" → **"to the aircraft" / "back from the aircraft"**
- "empty driving minutes" → **"driving around with nobody on board"**
- "synthetic data" → **"test data"**
