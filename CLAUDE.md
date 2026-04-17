# YouTube Clip Downloader

## What this project is
A client-side web app for clipping and downloading segments from public YouTube videos. Hosted on GitHub Pages.

## Tech approach
- Frontend: plain HTML/CSS/JS (no framework)
- YouTube stream resolution via Invidious/Piped API
- Video clipping via FFmpeg.wasm (runs in browser)
- Accessible: time input boxes alongside visual drag handles, full keyboard nav, ARIA labels

## Hosting
GitHub Pages — fully static, no server required.

## Key files
- `PLAN.md` — the full implementation plan, locked in during the 2026-04-17 kickoff. Read this first.
- (more to be filled in as the project develops)

## Telegram reporting
The user follows progress on this project primarily via Telegram. Keep them in the loop proactively:

- **Send progress updates** when you finish a meaningful chunk of work (e.g. "scaffolded the repo and pushed the first commit", "YouTube adapter resolving metadata now", "FFmpeg clipping path working end-to-end"). Roughly one update per meaningful milestone — not per file touched.
- **Report big problems immediately** when they happen: Piped instances all dead, FFmpeg.wasm failing to load, a YouTube change broke everything, you hit a design decision the plan didn't cover. Include what you've tried and what you need from the user.
- **Do not send code or internal thinking** over Telegram. Summarise outcomes in plain English — "fixed the MP3 encoder bug" not a diff. The user reads code in the terminal, not on their phone.
- **Keep the tone brief and human.** Short paragraphs, no walls of text. Telegram is a notification channel, not documentation.
- A quick emoji reaction on an inbound voice message is fine as "received, working on it."
