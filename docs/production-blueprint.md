# LifeQuest Production Blueprint — meeting rooms, channels, bots, checkout (1k → 10k users)

Target: end-to-end meeting rooms + Discord-like live channels + bots/integrations +
user accounts + paid checkout, production-grade. Everything below is license-checked
today via the GitHub license API (agent-reach dev channel: `gh`).

## 1. License-verified stack (MIT or MIT-compatible only)

| Job | Pick | License (verified) | Why |
|---|---|---|---|
| Video/voice SFU | **mediasoup v3** | ISC | Production SFU, multi-worker, `pipeToRouter` across hosts |
| Custom WebRTC pieces | **Pion** | MIT | Go WebRTC if we ever need our own media logic |
| TURN/STUN | **coturn** | BSD | Mandatory. ~15–20% of users (symmetric NATs) need TURN relay |
| Realtime signaling/presence/chat | **Socket.io** + **Valkey** | MIT / BSD-3-Clause | Rooms, typing, presence, study timers. Valkey, not Redis (Redis is no longer permissive) |
| Chat reference UI | **Rocket.Chat core** | MIT core, EE excluded | Channel model + bot webhooks to copy (we build our own slim client, not a fork) |
| Bots | **Botpress** | MIT | Visual flows for study-bot, standup-bot, LeetCode-bot; or our own Bot API on the WS layer |
| Auth | **Better Auth** | MIT | Email + OAuth, sessions, org plugin later; Postgres-backed |
| Checkout | **Stripe** (API) | Proprietary service | Fastest compliant checkout (Checkout + Billing + webhooks). Self-hosted storefront later with **Medusa** (MIT core, EE excluded) |
| File storage | **SeaweedFS** | Apache-2.0 | Avatars, room exports, recordings (S3-compatible) |
| Database | **PostgreSQL** | PostgreSQL licence | Profiles, rooms, messages, entitlements |
| Load testing | **Artillery** | MIT | (k6 is AGPL — avoid for our license rule) |
| Uptime/status | **Uptime Kuma** | MIT | Self-hosted status page |

Not MIT, noted and rejected for this rule: LiveKit (Apache-2.0), Jitsi (Apache-2.0),
MinIO (AGPL), Redis (RSAL/SSPL), k6 (AGPL).

## 2. Architecture

```text
Web / Exe client (same UI)
  │  HTTPS/WSS
  ▼
API service (Node, Fastify/Nest — MIT)
  ├─ Auth (Better Auth) ──► Postgres (users, sessions, entitlements)
  ├─ Rooms/Channels API ──► Postgres (workspaces, channels, members, messages)
  ├─ Billing webhooks (Stripe) ──► entitlements
  └─ Room timers (server-authoritative study clock)
  │  WS (Socket.io) ──► Valkey pub/sub + presence
  ▼
SFU pool (mediasoup workers, N hosts, pipeToRouter between rooms)
  ▲
TURN pool (coturn, bandwidth-heavy — scale separately)
Object storage (SeaweedFS) for uploads/recordings
```

Discord mapping: workspace = server, text channel = chat, voice channel =
always-on audio SFU room, study room = voice + shared server timer + bot.

## 3. Scaling math (why this shape survives 10k users)

Assume 10k registered, ~10% concurrent in voice/video (1k), rooms of ~8.

- SFU forwarding: publisher ~1.5 Mbps up; each subscriber ~1.5 Mbps down per
  remote. An 8-person room ≈ 8 × 7 × 1.5 ≈ 84 Mbps through the server.
- 125 such rooms ≈ 10 Gbps → needs ~4–6 SFU hosts (2×10Gbps each) + headroom.
  Audio-only study rooms are ~40 kbps/stream — 20× cheaper; default study
  rooms to audio-first, video opt-in.
- TURN relay for ~20% of media users; TURN hosts are pure bandwidth boxes.
- Text chat/presence is trivial: one API host + Valkey handles 10k easily.
- Postgres: single primary is fine to ~10k; add read replica when dashboard
  queries pile up. Media never touches the DB (only join/leave events).

Rough infra sketch (Hetzner-class pricing): start ~$30/mo (1 API + 1 SFU/TURN
combo + DB + Valkey on one box via Compose). At 1k concurrent media: ~$250–400/mo
(SFU pool + TURN + storage + backups). Scale SFU/TURN horizontally only.

## 4. Checkout (users pay)

- Plans: Free (rooms ≤ 5 people, 720p) / Pro (big rooms, 1080p, bots, recordings).
- Stripe Checkout + Customer Portal + `entitlements` table filled by webhooks
  (idempotency keys, signature verification, reconcile job).
- Upgrade path: Medusa storefront when we want our own merch/coupons/gifting.

## 5. Production checklist

Docker Compose for dev AND prod; Postgres migrations in CI; nightly DB +
storage backups with restore drill; secrets in env/vault (never repo);
Sentry-style error tracking (self-hosted or SaaS); Uptime Kuma status;
Artillery load scripts for signaling + a 200-room SFU soak; abuse limits
(rate limits, max room size per plan, recording consent banner); data
retention + delete-my-data job; staging env mirroring prod.

## 6. Phased build plan

- **Phase 0** — monorepo (`apps/web`, `services/api`, `services/sfu`, `infra/`),
  Better Auth + profiles, Postgres + Valkey via Compose. Web client keeps
  working offline (current local-first build stays as fallback).
- **Phase 1** — text channels + presence + file-share + Bot API v1
  (study-bot, LeetCode-board bot). Migrate LifeQuest rooms from JSON
  file-exchange to server rooms (keep export/import as backup).
- **Phase 2** — voice/video study rooms on mediasoup + coturn, server timers,
  recordings to SeaweedFS.
- **Phase 3** — Stripe checkout, plans, entitlements gating room size/quality.
- **Phase 4** — scale-out: SFU pool + pipeToRouter, TURN pool, read replica,
  Artillery soaks, status page, abuse tooling.

## 7. What this means for the current app

`lifequest-app/js/rooms.js` (file-exchange rooms) becomes the offline fallback.
Online mode: same UI, but create/join/leaderboard hit the API, and Meet links
graduate to native in-app rooms. No repo/project-name rule stays in force for
all public surfaces.
