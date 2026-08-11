# Marketing Studio — setup & operations

The company-scoped marketing intelligence system: Idea → Marketing Lens →
Campaign → Static Creative → Video, for South Texas Builders and ALTO Pro
(more companies addable later). Lives at **Workspace → Marketing** for both
you and Carlos.

## 1. One-time SQL

Run **`supabase/05_marketing_studio.sql`** in Supabase → SQL Editor (after the
earlier workspace files). It creates:

- `mkt_companies` — seeded with South Texas Builders (`stb`) and ALTO Pro (`alto`)
- `mkt_brand_profiles` — one Brand DNA per company (8 sections)
- `mkt_ideas`, `mkt_campaigns`, `mkt_campaign_versions` (append-only versions)
- `mkt_assets`, `mkt_generation_jobs`, `mkt_performance`
- `mkt_lenses` — seeded with the 11 marketing lenses
- the `marketing-assets` storage bucket (public read, member-only write)
- `workspace_members.can_generate_paid_media` — true for you, false for Carlos

All tables carry `company_id`, are RLS-locked to workspace members, and
Brand DNA / lenses / companies are **owner-write only**.

## 2. Environment variables (Netlify)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `OPENAI_API_KEY` | yes (already set) | — | Text + image generation |
| `MARKETING_MODEL` | no | `gpt-4o` | Campaign/Council text model (stronger than the mini model used elsewhere) |
| `MARKETING_IMAGE_MODEL` | no | `gpt-image-1` | Static ad image model |
| `MARKETING_VIDEO_PROVIDER` | no | *(unset)* | Leave unset until you pick a video vendor — everything works in "brief ready" mode without it |

No new keys are needed for launch: text campaigns and static images run on
your existing OpenAI key.

## 3. Providers

- **Text:** OpenAI via `netlify/functions/marketing-generate.ts`. Campaigns
  generate in three sequenced structured-JSON calls (strategy → production →
  distribution) and are stitched — more reliable than one giant response.
- **Image:** OpenAI Images via `marketing-image.ts`. Generated files are
  copied into the `marketing-assets` bucket (provider URLs expire; ours don't).
- **Video:** provider-neutral job system in `marketing-video.ts`. The
  `VideoGenerationProvider` interface (submit/check) is the adapter seam —
  when you choose a vendor (Runway, Kling, etc.), an adapter is added there,
  `MARKETING_VIDEO_PROVIDER` + the vendor key go into Netlify, and the
  existing confirmation flow, job queue and asset attachment light up
  unchanged. Until then, Generate Video produces a complete brief you can
  hand to any human editor.

## 4. Security model

- All generation is server-side; the browser never sees a key.
- Every marketing function requires the caller's Supabase session token,
  verifies it, and checks workspace membership.
- **Company isolation is enforced server-side:** the functions fetch Brand
  DNA and the idea from the database by `company_id` themselves — generation
  context is never accepted from the browser. An idea id paired with the
  wrong company id returns 404.
- DB access from functions runs *as the caller* (no service-role key
  anywhere), so RLS remains the final authority.

## 5. Testing STB vs ALTO isolation

1. Open Marketing Studio → South Texas Builders → capture an idea
   ("Homeowners don't realize poor drainage can damage a foundation").
2. Switch to the ALTO Pro tab → the Ideas list must not contain it (the
   query itself is filtered by ALTO's `company_id`, not hidden client-side).
3. Fill radically different Brand DNA for the two companies, generate a
   campaign under each, and check each output only reflects its own DNA.
4. Belt-and-suspenders: in Supabase → Table Editor, confirm every `mkt_ideas`
   / `mkt_campaigns` row carries the right `company_id`.

## 6. Testing paid video confirmation

1. In a generated campaign → Video tab → **Generate Video**.
2. A job is created as `awaiting_confirmation` and the cost-warning modal
   opens. Nothing has been charged (and with no provider configured, nothing
   ever is).
3. As **Carlos**: the modal says owner approval is required — he cannot
   confirm (enforced server-side by `can_generate_paid_media`, not just UI).
4. As **you**: "Yes, Generate Video" → with no provider it reports
   not-configured and charges $0; with a provider it moves to `queued` and
   the status is pollable. Failed jobs never auto-retry — retry is a fresh
   confirmation.

## 7. How it connects to the rest of the workspace

- **Idea Board → Campaign:** any captured idea can be promoted into
  Marketing Studio under the right company.
- **Campaign → Content Pipeline:** a campaign version pushes into Carlos's
  production pipeline with hook/script/caption pre-filled.
- **Brand DNA is the single brand source:** AI Studio's quick tools now read
  each company's Brand DNA (identity + voice) when it exists, falling back
  to the old brand-voice fields otherwise.

## 8. Current limitations

- Video generation ships as architecture + brief ("bones") until a vendor is
  chosen — deliberate, per spec.
- Performance is manual entry only; the schema is ready for the future
  RJP Intelligence lens (per-company history, never blended).
- The marketing lenses apply publicly documented principles; nothing may
  claim any person's endorsement, and generated output never writes "in the
  voice of" a real person.
- Job status is polled by button press (no background worker) — fine at
  current volume.
