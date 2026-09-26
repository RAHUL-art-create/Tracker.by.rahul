

---

# Personal Tracker Web Application

**Personal Tracker** is a simple yet powerful web-based application that allows users to track events, salaries, and milk consumption. The app ensures user data persistence across sessions with local storage, and provides an option to export and import data to handle potential loss due to cache clearing.

## Live Demo

A demo of the app is available [here](https://rahul-art-create.github.io/Tracker.by.rahul/).


## Key Features

1. **Event Tracker**
   - Add events (e.g., birthdays, anniversaries) with names, types, and dates.
   - Mark events as celebrated or delete them.
   - Get reminders for upcoming events, with a snooze option.

2. **Salary Tracker**
   - Record salary details by entering the student's name, salary amount, and the respective month.
   - View, edit, or delete salary entries.

3. **Milk Consumption Calendar**
   - Track daily milk consumption in a calendar view.
   - Analyze milk consumption over a specific date range.
   - Customize milk quantities and their respective prices.

4. **PDF Export**
   - Export event, salary, and milk consumption data into a PDF file for backup or offline usage.

5. **Upload & Download Data**
   - **Download Data**: Save all event, salary, and milk consumption data into a JSON file. This allows you to back up your data before clearing your cache.
   - **Upload Data**: Restore data by uploading a previously downloaded JSON file. This ensures that users can easily retrieve their information after clearing cache or using the app across multiple devices.

## Purpose of the Upload & Download Buttons

The upload and download functionality was introduced to prevent the loss of data due to cache clearing. Since the app uses browser-based local storage, data can be lost if the cache is cleared, or when accessing the app from a new device or browser. To mitigate this:

- **Download Data** allows users to save all tracked data (events, salaries, milk consumption) to a JSON file. This file can be stored locally or on external storage for safekeeping.
- **Upload Data** enables users to restore their saved data by importing the previously downloaded JSON file, ensuring continuity even after cache clearance or switching devices.

This mechanism provides users with control over their data, ensuring that important information isn't lost due to technical issues or browser behavior.

## How to Use

### Adding Events
- Fill in the event name, type (e.g., Birthday), and date.
- Click the **Add Event** button to save it.
- Events for the current day will trigger reminders with options to dismiss or snooze.

### Tracking Salaries
- Enter the student’s name, salary amount, and select the month.
- Click the **Add Salary** button to log the information.
- View, edit, or remove salary entries for any month.

### Monitoring Milk Consumption
- Navigate through the calendar to mark daily milk consumption.
- Analyze consumption data for a specific range of dates by selecting a start and end date.

### Exporting Data to PDF
- Click the **Export to PDF** button to generate a PDF file containing your event, salary, and milk consumption records.

### Downloading and Uploading Data
- **Download Data**: Click the **Download Data** button to save your current data as a JSON file.
- **Upload Data**: Click the **Upload Data** button to restore data from a previously saved JSON file.

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript
- **Libraries**:
  - [jsPDF](https://github.com/parallax/jsPDF) for PDF export
  - [jsPDF AutoTable Plugin](https://github.com/simonbengtsson/jsPDF-AutoTable) for table generation in PDFs
  - [localForage](https://github.com/localForage/localForage) for primary local storage (IndexedDB)
  - [Supabase JS](https://github.com/supabase/supabase-js) for cloud backup
- **Cloud Backup**: [Supabase](https://supabase.com) (free tier) — a private, secured Postgres database

---

## Cloud Backup (Supabase) — how it works

The app still saves everything locally first (localForage / IndexedDB), exactly like before. On top of that, a **cloud backup** mirrors every change to a private Supabase database in the background:

- **Additive & non-blocking** — cloud sync is fire-and-forget; if you are offline it silently retries, and the app never slows down or breaks.
- **Organized by name** — each dataset (`events`, `salaryData`, `milkData`, `milkQuantities`, `milkQuantities2`, `milkBillType`, `userName`, `selectedCategories`, `quickAmounts`, `quickQuantities`) is stored in the cloud under its own key, mirroring the local storage layout.
- **Auto-restore** — if your browser data ever gets cleared, the app automatically restores the missing data from the cloud backup the next time you open it (you will see a toast notification).
- **Sign-in required** — only a signed-in owner can read/write their rows. There is **no public sign-up**: your personal account is created privately in the Supabase dashboard, so strangers cannot use your database.
- **Credentials never in the repo** — the Supabase URL + anon key live in **GitHub repo secrets** and are injected only at deploy time by `.github/workflows/deploy.yml`. `supabase-config.js` is gitignored.

> Note: the anon key is *designed* to be public — it is safe because Row Level Security (RLS) in `supabase-setup.sql` locks every row to its owner. Never put the `service_role` key in the website.

### One-time setup (≈5 minutes)

1. **Create a free account** at [supabase.com](https://supabase.com) → **New project** (choose a strong database password).
2. **Create the table + security rules**: open **SQL Editor** in the Supabase dashboard, paste the full contents of [`supabase-setup.sql`](supabase-setup.sql), and click **Run**.
3. **Create your personal login** (no public sign-up):
   - Dashboard → **Authentication → Users → Add user → Create new user**
   - Enter your email + a strong password, and tick **Auto Confirm User**.
   - Optional hardening: **Authentication → Providers → Email** → turn **off** "Allow new users to sign up".
4. **Get the two values**: Dashboard → **Project Settings → API** → copy the **Project URL** and the **anon / publishable key** (NOT the `service_role` key!).
5. **Add GitHub secrets**: in this repository → **Settings → Secrets and variables → Actions → New repository secret** (twice):
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_ANON_KEY` = your anon key
6. **Add the deploy workflow** (one time): in the repo on GitHub → **Add file → Create new file** → name it exactly `.github/workflows/deploy.yml` (typing the `/` auto-creates folders) → paste the full contents of [`github-pages-deploy.yml.example`](github-pages-deploy.yml.example) → **Commit**. It deploys the site while injecting the secrets only at deploy time — the credentials never enter the repo.
7. **Switch GitHub Pages to deploy via Actions**: **Settings → Pages → Build and deployment → Source → GitHub Actions**.
8. The workflow runs automatically (committing it in step 6 triggers it). Open the site, tap the **👤 icon** next to ⚙️, and sign in with the account from step 3. It turns into ☁️ once active.

### Free tier notes

- Free plan: 500 MB database, unlimited API requests — this app uses a few KBs, so you will never come close.
- Free projects pause after **1 week of inactivity**. Simply opening the app counts as activity (it makes a full backup on every open). If it ever pauses, restore it with one click in the Supabase dashboard.

### Local development

Copy `supabase-config.example.js` to `supabase-config.js`, paste your URL + anon key, and open `index.html`. The copy is gitignored, so it can never be committed by accident. Without the file, the app simply runs local-only (cloud stays dormant — nothing breaks).

---

This README file explains the primary goal of data protection via upload/download options, ensuring users have a backup before clearing cache or switching devices.
