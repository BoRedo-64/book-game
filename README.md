# Pagelings

Read pages, raise a monster, out-read your friends. A mobile-style web app (installable on the phone home screen) with no build step: plain HTML, CSS and JavaScript.

## Try it now (demo mode)

```bash
python3 -m http.server 8765
```

Open <http://127.0.0.1:8765> (use your browser's phone view, or open it on your phone). With `js/config.js` empty the app runs in demo mode: progress is saved in that browser only and your friends are three practice bots.

## Go online with friends

### 1. Create the database (Supabase, free)

1. Sign up at <https://supabase.com> and create a new project.
2. **SQL Editor** → paste the whole of `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers** → turn on **Allow anonymous sign-ins**.
   (The app signs each browser in anonymously, then links it to a trainer name + password. No emails.)
4. **Project Settings → API** (or the **Connect** button): copy the **Project URL** and the **publishable** key (older projects call it the `anon` key).
5. Paste both into `js/config.js`.

The key in `config.js` is meant to be public; the access rules in `schema.sql` are what protect the data.

### 2. Put it on the internet (any static host, free)

The whole folder is a static site. Options:

- **GitHub Pages**: push this folder to a repository, then Settings → Pages → deploy from the `main` branch.
- **Netlify / Cloudflare Pages**: drag the folder onto their dashboard.

Share the link. Friends pick a trainer name and password, then add each other by trainer name. On a phone, "Add to Home Screen" makes it open full-screen like an app.

## Good to know

- Free Supabase projects pause after about a week with no activity at all; resume from the dashboard.
- There is no password reset: a forgotten password means starting a new trainer. Pick memorable passwords.
- Game values (XP, coins) are written by the app itself, so a determined friend could cheat with browser tools. Fine for a friend group, not for strangers. The database does block more than 100 pages a day and flags hand-edited XP or page counts for the admin.

## Admin

1. Register your own trainer in the app as normal.
2. In `supabase/add-admin.sql` (or the end of `schema.sql`), replace `YOUR_TRAINER_NAME` in the last statement with your trainer name, then run the file in **SQL Editor**.
3. Reload the app: a **🛡️ Admin** button appears on your Profile tab.

The admin screen lists suspicious activity (more than 50 pages in a day, blocked attempts to log over 100 or to log on another date, XP or page counts edited by hand) and every trainer with their pages today and this week. **Ban** (tap twice) deletes that account and everything in it; its entries stay in the log under the old name. A banned friend can still register a new trainer.
- `Ressources/` holds the original full-size art; the app uses the optimised copies in `assets/monsters/`.

## How the game works

| | |
|---|---|
| Daily limit | 100 pages (the app and the database both enforce it) |
| Hatch | 30 pages |
| Evolutions | level 10 (about 400 pages) and level 30 (about 2,750 pages) |
| XP | 1 per page, +10% on a 7-day streak, +20% on a 30-day streak, +50 for finishing a book |
| Coins | 1 per 2 pages, plus quests, duels, battles and the weekly raid |
| Battle energy | 1 ⚡ per 10 pages read, a battle costs 1 |
| Elements | Fire beats Plant, Plant beats Water, Water beats Fire |

## Files

- `js/game.js` rules and balance numbers · `js/state.js` data loading · `js/views.js` screens · `js/app.js` actions
- `js/db.js` Supabase and demo-mode storage · `supabase/schema.sql` tables and access rules
