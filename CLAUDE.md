# FitBuddy — Instructions for Claude

I'm a React Native/Expo developer learning backend (Node.js) by building this app.
Full plan and progress: see ROADMAP.md. Read it at session start and tell me the current phase.

## How we work
- Teaching style "I do, you do": for each new concept, you write one example (with short comments explaining it), then I write the next similar piece myself and you review it.
- Outside those examples, you review, point out issues, and fix only when I ask.
- Theory first: before coding each topic, teach the theory — what it is, why it exists, how it works, key terms, common mistakes. Use small examples and diagrams. Then we code it in the app.
- Keep other explanations (reviews, fixes) short.
- ~6 hrs/week. One phase or sub-phase per session.
- Each topic: theory → I do (example) → you do → review. Each phase ends with a "done when" checklist.
- Stage 2 (system design) topics stay out of Stage 1. At most a one-line "revisit in Stage 2" note.
- After each session, remind me to update the Progress Log in ROADMAP.md.

## Environment
- macOS. iOS simulator (Xcode) + Android emulator, both on this machine.
- Node 24 with native TypeScript (type stripping); `tsc --noEmit` for type checks.
- Docker Desktop for Postgres, Redis, etc.
- Git identity is set per repo (personal account), not global.
