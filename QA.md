# Manual QA script

End-to-end check of the full league workflow, run against the **development** Supabase project (dev seed loaded, code `482913` = Umferð 4: **Víkingur-A (home, A/B/C) – KR-B (away, X/Y/Z)**).

**You need:**
- Four player sessions: private/incognito windows, separate browser profiles, or phones.
  - **H1:** Isak Alfredsson (Víkingur-A)
  - **H2:** Stefán Birkisson (Víkingur-A)
  - **A1:** Karl Claesson (KR-B)
  - **A2:** Ellert Georgsson (KR-B)
- An **organizer** window signed in at `/admin`.
- A **public** window, not logged in, on `/live/match/<encounter id>`. The id appears in the address bar after clicking the match on the **Dagskrá** tab (`/schedule`).

Tip: open each player window at phone width (DevTools device toolbar, 390 px).

| # | Step | Expected |
|---|---|---|
| 1 | In each player window: **Leikskýrsla** → search your name → **Þetta er ég**. | The code entry screen appears. **Stillingar** shows the correct name, team and club. |
| 2 | In all four windows, enter `482913` → **Tengjast**. | Each lands on *Víkingur-A – KR-B*, with its own team highlighted. |
| 3 | H1 picks A/B/C → **Leggja fram**. H2 opens the same screen, taps **Breyta**, swaps two players → **Vista breytingu**. | Both see *Uppstilling staðfest* straight away: one confirmation is enough. While KR-B has not submitted, the lineup can still be changed and stays confirmed. |
| 4 | A1 and A2 look at the opponent row; the public window looks at the match. | They see only *Uppstilling staðfest*, **never** Víkingur's names. Public: status only. |
| 5 | A1 picks X/Y/Z → **Leggja fram**. | **Both** lineups are revealed at the same moment in all windows, including public and organizer, with H2's changed order. Matches 1–6 open. No player can change either lineup any more; only an organizer unlock reopens it. |
| 6 | H1 opens match 1, A1 opens match 2, H2 opens match 3 (three "tables" at once). Enter games by tapping a field and typing the points (Next on the keyboard moves to the second field, Done confirms). | *Staðfesta lotu* is only enabled for valid games: 11–9 yes, 11–10 no, 12–10 yes. Each match's games-won count updates everywhere within about a second. The team score follows. |
| 7 | **Conflict:** H1 and A1 both score match 4 game 1: H1 enters 11–8, A1 enters 11–9. | Both scorers see *Lota 1 í staðfestingu* and *Leysa ágreining*. Public shows *Lota í staðfestingu*, never either score. The organizer sees both raw entries highlighted. Scorecard tab: amber **!** badge. |
| 8 | **Resolve:** A1 edits their entry (pencil) to 11–8. | Conflict disappears everywhere. Public shows 11–8. |
| 8b | **Scorer gone:** make a new conflict (H1 11–8, A1 11–9). Then H2 → *Leysa ágreining* → **11–9** → *Staðfesta*. | H2 sees *Þitt lið hefur staðfest 11–9* and *Bíður staðfestingar mótherja*; the game stays in confirmation. |
| 8c | A2 → *Leysa ágreining* → **11–8**, then again → **11–9**. | After 11–8: *Liðin hafa ekki staðfest sömu niðurstöðu*. After 11–9: resolved everywhere (public shows 11–9) and both raw entries are still listed for the organizer, next to the two team confirmations. |
| 9 | Finish matches 1–6. H1 submits the doubles pair, then taps **Breyta** and changes it. Then A1 submits KR-B's pair. | Doubles selection appears only once 1–6 are done. A submitted pair is confirmed at once and can be changed until the other team submits. Opponent/public see status only until **both** pairs are submitted; then names appear (H1's changed pair) and nobody but an organizer can change them. Match 7 unlocks; 8–10 unlock after 7. |
| 10 | Play on until a team reaches **6**, or 5–5 after all ten. | Remaining matches show *Ekki leikinn*. The header shows e.g. *Víkingur-A vann 6–3* or *Jafntefli 5–5*. The confirmation panel appears. |
| 11 | H1 → **Staðfesta úrslit**. Then A1 → **Staðfesta úrslit**. | After H1: public shows *Leik lokið – bíður staðfestingar*. After A1: *Niðurstaða staðfest*, the scorecard becomes read-only, and further entries are refused. |
| 12 | **Staða** tab. | Víkingur-A and KR-B have `L = 1`, with 2/0 points (or 1/1). Other confirmed-only rules hold: before step 11 the table did **not** change. Tap a team to see its matches and games won–lost. |
| 13 | **Staða** tab, *Leikmenn · Topp 5* section under the table, then *Sjá alla leikmenn*. | Topp 5 counts singles only: doubles are not counted, and nobody gets credit for *Ekki leikinn* matches. Order is wins, then fewer losses. Equal records share a rank. *Sjá alla leikmenn* opens the searchable list at `/players`, with **Staða** still highlighted. |
| 14 | **Dagskrá** tab (`/schedule`; old `/live` links redirect there), `/live/round/<id>`, the match page. | The timeline opens at the ongoing round (else the next one, else the last), and **Dagskrá** stays highlighted on round and match pages. Tap a match row to expand its game scores. The **Share** button copies the link on desktop. Reloading any of these URLs works. |
| 15 | **Network loss:** on a joined phone, turn on airplane mode (or DevTools → Network → Offline) and enter a game on an open match. | An *Engin nettenging* banner appears, the game shows *Ósamstillt*, and the pill shows *Ósamstillt (1)*. Other windows do **not** see it. Reconnect → it syncs within seconds, and *Samstillt* flashes. Other windows update. There is no duplicate: the organizer sees one entry. |
| 15b | Offline, enter a score that conflicts with another scorer's online entry, then reconnect. | After sync the game shows *Ósamræmi*; the outbox never picks a winner. |
| 16 | **Organizer correction:** `/admin` → Umferðir → Umferð 4 → the encounter → **Stjórn** → *Leiðrétta lotu*: change one game so a match flips winner, enter a reason. | The result version goes up. Confirmations show *Ógild*, and the status goes back to *Bíður staðfestingar* (or *Í gangi*). The history lists *Lota leiðrétt* with the reason. |
| 17 | Re-confirm from both teams, then check **Staða** (table and Topp 5). | Standings and player records reflect the corrected result immediately. Nothing was edited by hand. |

**Also check:**
- **Organizer controls:**
  - *Fresta* / *Aflýsa* / *Endurvekja* on an encounter work, and players can't change a postponed encounter.
  - Regenerate the round code: new devices need the new code, and already-joined devices keep working.
- **Access boundaries:**
  - Sign out of `/admin` in another tab: the admin page returns to login with *Innskráning rann út*.
  - A non-organizer email account is refused at `/admin`.
- **PWA:**
  - Install it (Chrome: install icon; iOS Safari: Share → Add to Home Screen).
  - It launches standalone on `/scorecard`, and offline the shell still loads with the offline banner.
- **Responsive layout:**
  - At 320 px nothing overflows horizontally.
  - Long names wrap.
  - The bottom nav never covers content, and it hides while the Android keyboard is open.
