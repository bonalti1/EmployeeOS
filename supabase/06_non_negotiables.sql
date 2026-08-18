-- ============================================================================
-- NON-NEGOTIABLES — two lists, two owners
-- ============================================================================
-- Run this AFTER supabase/assistant_workspace.sql (it reuses ws_role()).
-- Safe to re-run.
--
-- The workspace already had daily non-negotiables, but only Rolando's: the
-- list lives in ws_settings under `nn_list`, and because ws_settings is
-- owner-write-only, Carlos could tick items off and nothing else. That is the
-- right half of the rule — the standard Rolando sets is not Carlos's to edit —
-- but it left no room for Carlos to hold himself to anything of his own.
--
-- So there are now two lists rather than one shared list with mixed
-- permissions:
--
--   nn_list            Rolando's. Owner writes, Carlos reads. Unchanged.
--   nn_list_assistant  Carlos's own. Carlos writes, Rolando reads.
--   nn_done_<date>     today's ticks, written by whoever is doing the work.
--
-- Splitting the storage is what makes the rule enforceable in the database
-- rather than merely hidden in the UI. A single list could only ever be
-- protected by hiding the edit button, and a hidden button is not a
-- permission — anyone who can reach the API can still write the row.
-- ---------------------------------------------------------------------------

-- The assistant may write exactly two things in settings: the daily tick
-- state, and their OWN non-negotiables list. Everything else in ws_settings —
-- brand kits, company context, and crucially `nn_list` — stays owner-only, so
-- Rolando's standards cannot be edited by the person they apply to.
drop policy if exists "assistant checks off non-negotiables" on public.ws_settings;
create policy "assistant checks off non-negotiables" on public.ws_settings
  for insert to authenticated
  with check (
    public.ws_role() = 'assistant'
    and (key like 'nn_done_%' or key = 'nn_list_assistant')
  );

drop policy if exists "assistant updates non-negotiable checks" on public.ws_settings;
create policy "assistant updates non-negotiable checks" on public.ws_settings
  for update to authenticated
  using (
    public.ws_role() = 'assistant'
    and (key like 'nn_done_%' or key = 'nn_list_assistant')
  )
  with check (
    public.ws_role() = 'assistant'
    and (key like 'nn_done_%' or key = 'nn_list_assistant')
  );

-- Note there is deliberately no delete policy for the assistant. Removing an
-- item is an edit of the list value, not a delete of the settings row, so the
-- update policy above already covers it — and the row itself can only ever be
-- dropped by the owner.
