# Employee OS — setup (Roberto first)

Field employees get their own operating system on their phone. They sign in
with a short **employee code (PIN)**, with no email or password reset, and land
straight in their OS:

- **Time clock**: Clock in / Clock out, with a GPS location stamp taken only at
  the moment they tap.
- **Buttons to other apps**: Roberto's is **Open STB Scheduling**, which opens
  the scheduling board in view-only mode.
- **Non-negotiables**: your list for them (they can tick it but not edit it),
  plus their own list.
- **Tasks**: the ones you assign, plus any they add for themselves.
- **Journal**: one entry per day.

You see all of it in **Team** in your sidebar (owner only).

## 1. Run the SQL (once)

Supabase → **SQL Editor** → **New query** → paste all of
**`supabase/09_employee_os.sql`** → **Run**. It's safe to re-run.

This creates the `emp_*` tables (only your login can read them), the PIN-login
functions the employee's phone uses, and Roberto's record.

## 2. Set Roberto's code

Reload the app → **Team** → **Roberto** → **Employee code (PIN)** → type it →
**Set PIN**. Codes are case-insensitive and need at least 4 characters. Setting
a new code signs him out on every phone.

## 3. Send him the link

`https://<this-site>/employee` (the **Copy link** button next to the PIN gives
you the exact address). He types his code once and his phone remembers him.
Adding the page to his home screen works too.

## How it is protected

- The PIN is checked inside the database, never in the page code, and is stored
  hashed.
- After 8 wrong codes from one connection, that connection is refused for 15
  minutes.
- The employee's phone can only call the `emp_*` functions, and each one only
  touches that employee's own rows. He can't edit your non-negotiables or delete
  tasks you assigned.
- Unticking **Access on** in Team locks him out immediately.

## The scheduling board link

The board (repo `STB-Scheduling`) has a **viewer** role. A viewer reads
everything and can change nothing, and his phone never writes to the board's
cloud data. The button URL `https://stb-scheduling.netlify.app/#code=<viewer code>`
signs him in as that viewer. The board's viewer code lives in the board's own
`USERS` list. If you change it there, update the button in **Team → Roberto →
Buttons on his home screen**.

**Limit:** the board's codes are written in its public page and its write
protection runs in the browser. The Employee OS doesn't have this weakness.
