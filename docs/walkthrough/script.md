# Dispatch HQ — Walkthrough (Narration Script)

**Card video:** `dispatch-hq-walkthrough-60s.mp4` (1280×720, 30 fps, H.264 + AAC, 60.0 s)
**Gameplay video:** `dispatch-hq-walkthrough-gameplay.mp4` (1280×720, 30 fps, H.264 + AAC, 59.3 s) — five of the seven sections are **real captured gameplay**
**Vertical (9:16) video:** `dispatch-hq-walkthrough-vertical.mp4` (1080×1920, 30 fps, H.264 + AAC, 59.3 s) — same structure for TikTok/Shorts/Reels: square cards centered with a red-glow backdrop + Ken Burns; gameplay blur-padded
**Cards (editable sources):** `cards/card0.svg` … `cards/card6.svg`

## Gameplay video — section map

The gameplay cut splices live footage (recorded from the running game in
headless Chrome via CDP screencast) in place of matching cards:

| # | Section | Source |
|---|---------|--------|
| 0 | Title card (card0) | rendered card |
| 1 | **The Living City** — zoomed-out Memphis overview, slow pan | `s1-city` |
| 2 | **Build Your Department** — stations sidebar + map click | `s5-stations` |
| 3 | **Dispatch & Respond** — mission popup + quick dispatch | `s2-dispatch` |
| 4 | **Live Ops** — CAD console | `s3-cad` |
| 5 | **Coverage** — crime-heat / station-coverage / coverage-gap overlays | `s4-overlays` |
| 6 | Seasons & Crisis card (card4) — disasters are random live events | rendered card |
| 7 | Outro card (card6) | rendered card |

Weather/disaster footage is deliberately left as the Seasons card: those events
fire on long random cooldowns (6–15 min) and can't be reliably captured inside
a single guest session. Everything else is the real game, driven live.

---

*The table below is the narration script for the 60-second card version.*

Read at a calm, confident pace (~150 words total). Each section lands on its card.
Re-record your own voiceover over the music bed (currently a synthesized ambient
pad — fade music under the voice to about −20 dB).

---

| Time | Card | Narration |
|------|------|-----------|
| 0:00–0:08 | **Title** — logo + DISPATCH HQ | "Dispatch HQ — the real-time emergency dispatch game. Command the chaos. Save the city." |
| 0:08–0:16 | **The Living City** | "Start in West Memphis, Memphis, or Nashville. Real streets, real roads — every unit navigates with true GPS routes, day and night, in live weather." |
| 0:16–0:24 | **Build Your Department** | "Build your department from the ground up. Fire, police, and EMS stations with upgrades and specializations, twelve unit types, and crews with fatigue, morale, and personality traits. A coverage-gap overlay shows exactly where the city needs you next." |
| 0:24–0:32 | **Dispatch & Respond** | "Missions are everywhere — fires, crimes, medical calls. One tap dispatches the nearest units, and every call is a race against the clock. Answer Mutual Aid requests for bonus pay." |
| 0:32–0:40 | **Seasons & Crisis** | "The city fights back. Tornadoes, floods, and wildfires roll in with recovery phases after. Holiday events like July 4th and Christmas bring live contests — your rank in the top bar, a day-by-day countdown, and winner badges for the top clearer." |
| 0:40–0:48 | **Play Together** | "You're not alone. Form alliances, climb shared leaderboards, chat live, and watch other players' fleets patrol the same map — with a founder Admin Console for grants, promos, bug triage, and contests." |
| 0:48–1:00 | **Outro** | "Dispatch HQ — free to play in your browser. Command the chaos, save the city. Play now at dispatch-hq.onrender.com." |

---

## Production notes
- **Gameplay capture:** `record.mjs` drives the live game as a guest (Enter →
  Quick Play → New Campaign → city → service) and records each scene via CDP
  `Page.screencastFrame` piped into ffmpeg; `build-gameplay.sh` decimates the
  high-rate screencast back to real-time pacing, trims each scene to its action
  window, adds fades, concats, and muxes the music bed. All build scripts live
  in `.record-tmp/` at the repo root.
- **Vertical cut:** `build-vertical.sh` re-renders the same card SVGs at
  1080×1080, centers them in 1080×1920 with a red-glow radial backdrop and a
  slow Ken Burns zoom, and blur-pads the gameplay scenes (darkened, saturated)
  into the same frame. It re-encodes the final concat with the `concat` filter
  (`setsar=1` per input) — stream-copy concat breaks playback when the card and
  gameplay segments carry different encode params (both bugs hit during build).
- **Swap in more gameplay:** record OBS footage per section (map view, station
  build, dispatch, disaster banner, alliance panel) and replace the matching
  cards — durations are sized for a ~60 s total; keep each section ±0.5 s.
- **Audio:** the bed is a soft C–Am–F–G pad (synthesized, no licensing needed).
  Record VO in one take at 60 words/15 s per section; duck the music under it.
- **Export:** same container as delivered (H.264 High, AAC 128 k, yuv420p) so it
  plays everywhere — YouTube, X, Discord, and the game's social pages.
- **Regenerate from source:** the cards are plain SVG with the real game logo
  embedded (data URI); tweak text/colors and re-render via Quick Look
  (`qlmanage -t -s 1280 -o out card.svg`), then re-assemble with ffmpeg
  (zoompan + fades + concat + music), as documented in this thread.
