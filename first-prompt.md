We are starting a new project from scratch. Build a complete working MVP for recording Icelandic table tennis league team matches.

I want you to implement this directly in the current VS Code workspace. Do not just explain how to build it — create the files, install/configure what is needed, and implement the app.

PRIMARY GOAL
Build the simplest, cleanest, reliable phone-first web app possible for entering and recording one Icelandic table tennis league match.

Optimize for:
1. Fast implementation
2. Simple maintainable code
3. Excellent mobile usability
4. Correct scoring logic
5. Easy future conversion to an iOS/Android app using Capacitor

TECH STACK
Use:
- React
- TypeScript
- Vite
- Plain CSS or a similarly lightweight styling approach
- No backend for this MVP
- No authentication
- No database
- Keep dependencies minimal

Use localStorage to preserve the current match in case the page is accidentally refreshed.

All visible UI text must be in Icelandic.
Code, variables and comments can be in English.

DESIGN
The design should be:
- Clean
- Minimal
- Modern
- Neat
- Phone-first
- Large touch targets
- Easy to use quickly during a table tennis match
- Plenty of whitespace
- Clear hierarchy
- No unnecessary animations
- No clutter

It should still look good on desktop, but mobile is the priority.

APP FLOW

The app should have three main stages:

1. UPPSETNING
2. SKRÁNING LEIKJA
3. LOKANIÐURSTAÐA

--------------------------------------------------
1. UPPSETNING
--------------------------------------------------

Create a setup screen where the user enters:

- Name of home team
- Name of away team

HOME TEAM:
Allow the user to add players to the complete home-team roster.

AWAY TEAM:
Allow the user to add players to the complete away-team roster.

There can be more than 3 players on a roster.

Then select exactly three singles players for each team.

Home singles positions:
- A
- B
- C

Away singles positions:
- X
- Y
- Z

A player cannot occupy more than one singles position.

Clearly show the position next to each selected player.

Example:
A — Jón Jónsson
B — Pétur Pétursson
C — Ari Arason

X — ...
Y — ...
Z — ...

Have a prominent button:
„Hefja leik“

Do not allow the match to begin unless:
- Both team names exist
- Both teams have at least 3 roster players
- A, B, C are assigned to three different home players
- X, Y, Z are assigned to three different away players

Once „Hefja leik“ is pressed, lock the singles assignments.

The user should not accidentally be able to change A/B/C/X/Y/Z during the match.

Provide an explicit „Byrja upp á nýtt“ or similar reset option, with a confirmation dialog, if they really need to restart.

--------------------------------------------------
2. MATCH ORDER
--------------------------------------------------

There are a maximum of 10 matches.

Use EXACTLY this order:

Leikur 1: A vs Y
Leikur 2: B vs Z
Leikur 3: C vs X
Leikur 4: A vs Z
Leikur 5: B vs X
Leikur 6: C vs Y
Leikur 7: Tvíliðaleikur
Leikur 8: A vs X
Leikur 9: B vs Y
Leikur 10: C vs Z

For singles matches, display the players' actual names prominently, not just the letters.

For example:

Leikur 1
Jón Jónsson (A)
gegn
Magnús Magnússon (Y)

--------------------------------------------------
3. DOUBLES
--------------------------------------------------

Match 7 is doubles.

The doubles players do NOT need to be one of the three singles players.

Any registered player from that team's roster may play doubles.

When match 7 is reached, require the user to select:

- Two different home-team players
- Two different away-team players

from the complete team rosters.

Display the actual doubles names in the match.

Example:

Jón Jónsson / Ari Arason
gegn
Magnús Magnússon / Karl Karlsson

Store these selections so they appear in the final report.

Do not require doubles players to be selected during initial setup. They can be selected when match 7 is reached.

--------------------------------------------------
4. INDIVIDUAL MATCH SCORING
--------------------------------------------------

Every singles and doubles match is best of 5 sets („lotur“).

First player/team to win 3 sets wins the match.

For every set, the user enters the actual point score, for example:

11 - 8
7 - 11
12 - 10
11 - 6

Use two numeric inputs, one for each side.

Validate official table tennis scoring.

A completed set is valid when:
- One side has at least 11 points
- The winner leads by at least 2 points
- If the winner has more than 11 points, the final margin must be exactly 2 because the set should have ended as soon as a two-point lead was reached

Examples:

VALID:
11-0
11-8
11-9
12-10
13-11
18-16

INVALID:
10-8
11-10
12-9
15-12
10-10

Do not accept tied scores.

Give a clear Icelandic validation message for invalid scores.

Suggested text:
„Ógild lotustaða. Leikmaður þarf að ná að minnsta kosti 11 stigum og vinna með tveggja stiga mun.“

As soon as one side has won 3 sets:
- The individual match is complete
- Do not allow extra sets to be entered
- Determine the match winner automatically
- Add one match win to that team
- Advance to the next match

Allow a completed match to be edited if the user notices an input mistake, but make this safe and ensure all team totals recalculate correctly.

Do NOT maintain totals through fragile increment/decrement logic.
Derive totals from the saved match results so editing an earlier result cannot corrupt the score.

--------------------------------------------------
5. TEAM MATCH LOGIC
--------------------------------------------------

Continuously display the overall team score prominently.

For example:

Víkingur 3 – 2 KR

After each completed individual match, update the overall score automatically.

The team contest ends immediately when either team reaches 6 match wins.

Example:
6-2 = match is finished.

When one team reaches 6:
- Mark the league match as complete
- Do not play any remaining individual matches
- Display the remaining matches as „Ekki leikinn“
- Go to/show the final result

A 5-5 result is a draw.

A draw can only happen after all 10 matches have been completed.

Use Icelandic text such as:
„Jafntefli 5–5“

For a winner:
„[Lið] vinnur 6–X“

--------------------------------------------------
6. SCORING SCREEN UI
--------------------------------------------------

At the top, show a persistent compact score header:

Home team name | overall score | Away team name

Example:

Víkingur     3 – 2     KR

Also show progress:
„Leikur 6 af 10“

The current match should be the main visual focus.

Display:
- Match number
- Player name(s)
- Position letters for singles
- Sets won
- Individual set scores

Make score entry extremely easy on a phone.

Use numeric inputmode so the numeric keyboard opens on mobile.

After entering a valid set score, make it obvious how to save/confirm it.

After completing an individual match, automatically move to the next match or provide one obvious button to continue.

Below the current match, provide a compact overview of all 10 matches showing:
- Match number
- Participants
- Completed result if available
- Current match
- Upcoming matches
- „Ekki leikinn“ if the team contest ended before that match

Do not make the screen visually overwhelming.

--------------------------------------------------
7. FINAL REPORT
--------------------------------------------------

When the team match finishes, show a clean final report screen.

It must contain:

- Home team name
- Away team name
- Final team score
- Winner, or „Jafntefli“
- A/B/C assignments with names
- X/Y/Z assignments with names
- Doubles players if match 7 was played
- All individual matches that were played
- Score of each individual match in sets, e.g. 3–1
- Actual set scores, e.g. 11–8, 9–11, 11–7, 11–6
- Which side won each match
- Any unplayed matches marked „Ekki leikinn“

Make this visually similar in spirit to a clean digital match report rather than a complicated dashboard.

Add a button:
„Nýr leikur“

It should clear the existing match only after confirmation and return to setup.

For now we do NOT need:
- PDF generation
- Email sending
- Login
- Cloud storage
- League standings
- Multiple saved matches
- Player database
- Team database
- Admin panel

Do not implement those yet.

--------------------------------------------------
8. DATA MODEL / ARCHITECTURE
--------------------------------------------------

Keep the application architecture straightforward.

Use strongly typed TypeScript interfaces/types for:
- Team
- Player
- SinglesAssignments
- DoublesSelection
- SetScore
- IndividualMatch
- LeagueMatch

Keep scoring/business logic separate from UI components where practical.

Create pure utility functions for things such as:
- isValidSetScore()
- determineSetWinner()
- determineMatchWinner()
- calculateTeamScore()
- isLeagueMatchFinished()

The team score must always be calculated from completed individual matches.

Do not duplicate derived state unnecessarily.

Persist the active league match to localStorage and restore it after refresh.

--------------------------------------------------
9. EDGE CASES
--------------------------------------------------

Handle these correctly:

- User enters 11-10 -> invalid
- User enters 12-10 -> valid
- User enters 12-9 -> invalid
- A player wins first 3 sets -> match ends 3-0
- Match reaches 2-2 -> fifth set is available
- After 3 set wins, further set inputs are unavailable
- Editing an old match changes the overall team score correctly
- If editing an old result means a team no longer has 6 wins, later matches should become available again as appropriate
- If editing creates an earlier point where a team reaches 6 wins, subsequent matches must become unplayed
- 5-5 after match 10 -> draw
- Doubles participants must be two distinct players from each roster
- Doubles selections must remain stored when navigating away or refreshing
- Refreshing the browser should not destroy the current match

--------------------------------------------------
10. ICELANDIC UI TERMINOLOGY
--------------------------------------------------

Use natural Icelandic UI language.

Prefer terminology such as:

„Heimalið“
„Útilið“
„Leikmaður“
„Leikmenn“
„Leikur“
„Lota“
„Lotur“
„Tvíliðaleikur“
„Keppnisstaða“
„Hefja leik“
„Næsti leikur“
„Lokaniðurstaða“
„Jafntefli“
„Ekki leikinn“
„Nýr leikur“
„Byrja upp á nýtt“

Avoid English text appearing in the user-facing interface.

--------------------------------------------------
11. QUALITY
--------------------------------------------------

Before you finish:

- Run the app
- Run TypeScript/build checks
- Fix any errors
- Test the scoring logic
- Test the 6-win early finish
- Test the 5-5 draw
- Test doubles selection
- Test refreshing/restoring from localStorage
- Check the layout at approximately 375px phone width
- Ensure there are no obvious console errors

If appropriate, add small automated tests for the pure scoring utility functions, especially set validation and overall match completion logic. Do not spend excessive time setting up a complicated test framework if it slows down the MVP.

IMPORTANT:
Do not overengineer this.
Do not add features I did not request.
Prioritize having a polished, fully working MVP as quickly as possible.

When finished, give me:
1. A very short summary of what you built
2. Exact command to start the development server
3. Any decisions you had to make
4. Any known issues still remaining

Start implementing now.
