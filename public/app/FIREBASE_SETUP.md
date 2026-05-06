# Firebase wiring — Lesson Teacher

This document describes how to enable Firebase auth + cloud sync for
the Lesson Teacher app. **You don't have to do this** — without a
config the app stays in localStorage-only mode, exactly as today.

## What was wired up

| File (new) | What it does |
|---|---|
| `public/app/js/firebase-0.js` | Loads Firebase v10 (auth + firestore). Exposes `window.LTAuth` (sign up / sign in / sign out / reset) and `window.LTCloud` (read/write helpers for profile, progress, parent state, arena, social). When a user signs in, it patches the existing data layers (`saveProgress`, `phSave`, `ArenaDB.saveProfile`, `ArenaDB.recordMatch`, `SocialDB.saveMe`) so every local write also queues a debounced cloud sync. |
| `public/app/js/auth-ui-0.js` | The sign-up / sign-in modal, role picker (student vs parent), level + class selector for students, and the "👤 Sign in" chip in the landing-page nav. |
| `public/app/js/firebase-wiring-0.js` | Glue between cloud and existing UI: prefills `enterCL()` from the signed-in profile, adds the **"Link a real student"** panel to the Parent Hub > Progress tab, and wires the arena leaderboard to a cloud-first `topLeadersAsync()` fetcher. |
| `public/app/firestore.rules` | The Firestore security rules to paste into the Firebase Console. |

`public/app/index.html` was edited to (a) load the three new scripts, (b) hold the Firebase config block, and (c) fix a small piece of malformed HTML at the end (an orphaned `<script>` body had been merged into the `</html>` line).

## Step-by-step setup

### 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and **Add project**. Skip Google Analytics if you don't need it (you can add it later).
2. In your project, click the **Web app** icon (`</>`) under "Get started by adding Firebase to your app". Give it any nickname (e.g. *Lesson Teacher Web*). You **don't** need Firebase Hosting.
3. The console will show a snippet that looks like:

   ```js
   const firebaseConfig = {
     apiKey: "AIza…",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project-id",
     storageBucket: "your-project.appspot.com",
     messagingSenderId: "0000000000",
     appId: "1:0000000000:web:abc123"
   };
   ```

   Copy those six values.

### 2. Paste the config into `index.html`

Open `public/app/index.html` and find the block that starts with `<!-- ═══════════ FIREBASE CONFIG ═══════════ -->`. Uncomment the lines and paste your values:

```html
<script id="lt-firebase-config">
  window.LT_FIREBASE_CONFIG = {
    apiKey:            "AIza…",
    authDomain:        "your-project.firebaseapp.com",
    projectId:         "your-project-id",
    storageBucket:     "your-project.appspot.com",
    messagingSenderId: "0000000000",
    appId:             "1:0000000000:web:abc123"
  };
</script>
```

> **Heads up:** the Firebase web `apiKey` is **not** a secret — it's a public identifier. Security is enforced by the Firestore rules (next step), not by hiding the key. So you can commit it to git without worrying.

### 3. Enable Email/Password auth

In the Firebase Console:

1. **Build → Authentication → Get started**.
2. Click the **Email/Password** provider, toggle the first switch (Email/Password) to **Enabled**, and **Save**.
3. (Optional) Under **Settings → Authorized domains** add the domain you'll deploy to (e.g. `your-project.vercel.app` and any custom domain). `localhost` is already there for development.

### 4. Create the Firestore database + paste the rules

1. **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** and pick a region close to your users (e.g. `eur3` for Europe/Africa, `nam5` for North America). The region cannot be changed later.
3. Once the database is created, go to the **Rules** tab.
4. Replace the default content with the contents of `public/app/firestore.rules` (in this repo).
5. Click **Publish**.

That's it on the Firebase side.

### 5. Verify it works

Reload the deployed app. You should see:

- A small **🔐 Sign in** chip in the top-right of the landing-page nav.
- Clicking it opens a modal with **Sign in / Sign up** tabs.

Smoke test:

1. **Create a student account.** Pick "Student", fill in name + level + class, submit. You should land back on the landing page with your name on the chip.
2. Open the in-page console (`F12 → Console`) and type `await LTCloud.loadProfile()` — you should see the profile doc you just created.
3. Open the Parent Hub from the nav, switch to the **Progress** tab. The "🔗 Link your child's real account" panel should appear and prompt you to sign in as a parent.
4. Sign out (👤 chip → Sign out), then sign up again as a parent with a different email. Back on the Progress tab, type the student's email into the link box → **Link**. The student's live XP / topics / streak appear in real time.
5. As the student, complete a lesson → open Firestore Console → `users/{uid}/progress/main` should now have `xp`, `topicsCompleted`, etc. that match the UI.

### 6. (Optional) Quick testing without editing index.html

You can pass the Firebase config as a base64-encoded JSON in the URL:

```
https://your-app.com/app/?fbConfig=eyJhcGlLZXkiOiJBSXph…
```

The bootstrap will pick it up from the query string. Useful for QA in a separate Firebase project without touching the deployed config.

## How data flows

### Student (signed in)

```
local action  →  saveProgress()  →  localStorage (instant)
                                  ↘
                                   debounced 600ms  →  LTCloud.saveProgress()
                                                   →   users/{uid}/progress/main
```

On sign-in, `LTCloud.hydrate()` runs and merges the cloud document back into `window._sessionProgress`, then triggers `_renderProgressBadges()` so XP, streaks, and topic counts update instantly.

### Parent (signed in)

- Adds children manually (existing flow) — local-only quick reference, syncs to `users/{uid}/parent/state`.
- **Or** links by email (new flow) — pulls live progress from the linked student's account through `parent_links/{parentUid_childUid}`. Security rules let parents read but never write the child's progress.

### Arena

- Local matches still record to `localStorage` immediately (so spectator UI etc. keep working).
- When signed-in, the same match is published to `arena_leaders/{uid}_{classGroup}_{scope}_{weekKey}` with merge semantics so concurrent matches don't overwrite each other.
- The arena UI can call the new `ArenaDB.topLeadersAsync(...)` to fetch the cloud leaderboard.

### Social

- The local `SocialDB` keeps its sample classmates so UI never looks empty.
- Real users get a `users/{uid}/social/profile` doc that mirrors `getMe()`.
- DM threads / messages still live in localStorage in this revision — they're a more involved migration (real-time listeners, per-pair message subcollections). The hooks in `firebase-0.js` make adding that next a small change.

## What guests still see

If you don't paste a config, or if Firebase init fails for any reason, **nothing breaks**: every cloud method falls through to a no-op promise and the existing localStorage layers handle storage as before. The only visible change is that the "🔐 Sign in" chip will show a "Cloud not configured" hint if a guest tries to use the parent-link feature.

## Files touched

```
public/app/index.html                NEW: firebase config block + 3 script tags + small HTML fix
public/app/js/firebase-0.js          NEW: auth + cloud data layer
public/app/js/auth-ui-0.js           NEW: sign-up / sign-in modal + account chip
public/app/js/firebase-wiring-0.js   NEW: glue (enterCL prefill, parent-link panel, arena cloud leaders)
public/app/firestore.rules           NEW: paste these into Firebase Console → Firestore → Rules
public/app/FIREBASE_SETUP.md         NEW: this file
```

Nothing else was modified — every existing data layer is wrapped, not rewritten, so all of today's tested behaviour is preserved.
