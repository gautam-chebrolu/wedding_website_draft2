# Wedding Website

The sibling [wedding messaging app](../wedding_messaging/README.md) contains the organizer
dashboard, Twilio/Firebase backend, local demo and setup guide. It is a separate
deployment; the website keeps its current chat until the messaging adapter is
configured. Guest personalization, campaigns and photo storage are later phases.

## Architecture

The website uses **Firebase Firestore** as its primary database. Google Sheets is kept as a backup (written to automatically on every RSVP submission via Apps Script).

- **Guest lookup, RSVP read/write** → Firestore `guests` collection
- **ATL walk-in RSVPs** → Firestore `atl_rsvps` collection
- **Google Sheet** → backup (fire-and-forget via Apps Script after each submit)

---

## Repository Layout

| Folder | Purpose |
|---|---|
| `pages/` | Secondary HTML pages; `index.html` remains at the project root |
| `assets/css/` | Browser stylesheets |
| `assets/js/` | Browser-side JavaScript |
| `media/` | Images, audio, and public data files |
| `scripts/firebase/` | Firestore sync, import, and export utilities |
| `api/` | Vercel serverless functions and chatbot data |
| `apps-script/` | Local source for the Google Sheets backup integration |

Vercel rewrites the existing clean public URLs (for example, `/schedule`) to
their files under `pages/`, so reorganizing the repository does not change any
guest-facing links.

---

## Managing the Guest List

Guests can be managed through the password-protected **Guest List Manager** at
`/guests`, or directly in **Firebase Console**. The manager supports editing all
guest details, duplicating a selected person to quickly add a party member, manual
RSVP updates, and document-ID changes for spelling corrections.

The manager uses the same browser-to-Firebase approach as the RSVP pages, with no
Vercel environment variables. Its password is currently `password`; change it in
`pages/guests.html` if desired. Changing a Document ID moves the record and preserves
other existing fields.

Deploy the revised Firestore rules before using the manager:

```bash
cd ../wedding_messaging
firebase deploy --only firestore:rules,firestore:indexes --project wedding-website-backend-5a8df
```

**Firebase Console:** https://console.firebase.google.com/project/wedding-website-backend-5a8df/firestore

### To add a guest
1. Open Firestore → `guests` collection
2. Click **Add document**
3. Set the Document ID to `firstname_lastname` (lowercase, underscore-separated), e.g. `gautam_chebrolu`
4. Add these fields:

| Field | Type | Example |
|---|---|---|
| `firstName` | string | `Gautam` |
| `lastName` | string | `Chebrolu` |
| `party` | string | `Chebrolu Family 1` |
| `groupName` | string | `Chebrolu Family` |
| `envelopeName` | string | `Gautam Chebrolu` |
| `displayName` | string | `Gautam Chebrolu` |
| `events` | array | `["Ganesh Puja", "Wedding", "Reception"]` |
| `tags` | string | `Ganesh Puja, Wedding, Reception` |
| `rsvp` | map | `{}` (empty for new guests) |
| `rsvpStatus` | string | `` (empty) |
| `rsvpTimestamp` | string | `` (empty) |
| `nutAllergy` | string | `` |
| `dietaryRestrictions` | string | `` |
| `songRequests` | string | `` |
| `email` | string | `` |
| `phone` | string | `` |

### `party` vs `groupName`
- **`party`** — the household that RSVPs together. Looking up any one member on the
  website pulls up everyone sharing the same `party` value.
- **`groupName`** — the high-level bucket used for the filter pills and section
  headers on `pages/tracking.html`. Maintained on the **GroupLookup** tab of the Google
  Sheet (`Name`, `Group`) and pushed into Firestore by `scripts/firebase/sync_from_sheet.js`.
  Current values: `Gupta Family`, `Gupta Friends`, `Chebrolu Family`,
  `Chebrolu Friends`, `Priya Friends`, `Gautam Friends`.

### Event tag names (use exactly as shown)
- `Ganesh Puja`
- `Haldi`
- `Sangeet`
- `Wedding`
- `Reception`
- `Satyanarayana Puja`
- `Atlanta Reception`

### To edit a guest
Open Firebase Console → `guests` → find the document by ID → click any field to edit inline.

### To remove a guest
Open Firebase Console → `guests` → find the document → click the three-dot menu → **Delete document**.

---

## Syncing from the Google Sheet

If you edit guest info in the Sheet (including the **GroupLookup** tab), push those
edits into Firestore with `scripts/firebase/sync_from_sheet.js`. It reads the live Sheet, diffs it
against Firestore, and writes only what actually changed.

Requires `service-account-key.json` in the project root (gitignored), and the Sheet
shared as *Anyone with the link → Viewer*.

Always preview first — the dry run prints a field-by-field diff and writes nothing:

```bash
node scripts/firebase/sync_from_sheet.js --dry-run
```

**Roster fields always come from the Sheet** — `firstName`, `lastName`, `party`,
`groupName`, `envelopeName`, `displayName`, `tags`, `events`, and the address fields.

**RSVP fields need you to pick a winner** — `rsvp`, `rsvpStatus`, `rsvpTimestamp`,
`nutAllergy`, `dietaryRestrictions`, `songRequests`, `email`, `phone`. These are
contested because the website writes RSVPs straight to Firestore and only mirrors
them to the Sheet best-effort, while you also edit the Sheet by hand.

| Command | RSVP fields |
|---|---|
| `node scripts/firebase/sync_from_sheet.js` | **Firestore wins.** The Sheet only fills in what Firestore leaves blank, so a guest's submitted RSVP is never overwritten. Use for routine roster updates. |
| `node scripts/firebase/sync_from_sheet.js --sheet-wins` | **Sheet wins where it has a value**, but a blank Sheet cell leaves a populated Firestore field alone. **Use this after editing RSVPs by hand in the Sheet.** |
| `node scripts/firebase/sync_from_sheet.js --full` | **Sheet wins absolutely, blanks included.** This *erases* Firestore values whose Sheet cell is empty — including ~56 phone numbers that came from the original CSV import and were never copied into the Sheet. Rarely what you want. |

Other flags:

```bash
node scripts/firebase/sync_from_sheet.js --groups-only # only refresh groupName
node scripts/firebase/sync_from_sheet.js --prune       # delete Firestore docs missing from the Sheet
```

Without `--prune`, documents present in Firestore but absent from the Sheet are only
*reported*, flagged if they hold submitted RSVP data. These are usually the old
spelling of a renamed guest — check the list before pruning.

The sync also refuses to let two guests with the same name overwrite each other: the
document id is `firstname_lastname`, so identical names collide. Only the first row is
synced and the collision is reported — fix it in the Sheet (e.g. add a middle initial),
since the website lookup cannot tell such guests apart either.

## Deployment

The site is deployed on **Vercel** and updates automatically on push to `main`.

### RSVP notification emails

RSVP confirmation emails are sent by the separate Google Apps Script in the local
`apps-script/Code.gs`, after the website mirrors the submission to the guest Sheet.
They include each submitted guest's email, phone, nut allergy, dietary restrictions
and song requests, including empty values shown as **Not provided**. Changed fields
are marked **Updated** and show the previous value from the Sheet backup captured
before the submission is written. That comparison reflects the last successful
Sheet backup, which can lag Firestore if a previous mirror failed. Both HTML and
plain-text emails contain these details; the couple still receives the existing
BCC (or a direct notification when no guest email is supplied).

The configured Apps Script directory is deliberately gitignored. To activate a
local change, copy the updated `apps-script/Code.gs` into **Code.gs** in the existing
Google Apps Script project. Save it, then use **Deploy > Manage deployments > Edit**,
select **New version**, and deploy the existing web app so its URL stays the same.
A Vercel deployment alone does not update these emails.

Run the local email checks without sending messages or modifying live guest data:

```bash
node --test scripts/tests/rsvp-email.test.js
```

The shared Firebase rules and indexes are owned by the messaging repository.
Run database deployments from that checkout; this website has no Firebase deployment config:
```bash
cd ../wedding_messaging
firebase deploy --only firestore:rules,firestore:indexes --project wedding-website-backend-5a8df
```

---

## Live Event Pages (`/sangeet`, `/wedding`)

Public pages that update in real time during the events: a countdown before
things start, a highlighted **Live** card, faded upcoming items, collapsed past
items, the Sangeet "Now Showing" food-station posters, and the reception
seating search.

| What to change | Where |
|---|---|
| Schedule times, titles, performance lineup, food stations | `media/live_schedule_data.js` |
| Look & feel | `assets/css/live.css` (posters: `.poster--<theme>`) |
| Engine (states, countdown, seating search) | `assets/js/live.js` |

**Preview any moment:** add `?now=` (Eastern time) to the URL, e.g.
`/sangeet?now=2026-11-20T19:40` or `/wedding?now=2026-11-21T17:15`. Add
`&speed=60` to fast-forward one minute per second. A "Preview" badge shows
while this is active.

A pulsing **● Live** pill is added to the nav automatically, but only on
Nov 20–21 (`assets/js/main.js`).

### Live controls (`/live-admin`)
Password-protected page for your phone during the event:
- **Announcement**: a banner on every guest's screen within seconds
- **Running late**: shifts the schedule from a chosen item onward
- **Now performing**: Sangeet act tracker ("Next act →")

It writes to the Firestore `live/{sangeet|wedding}` docs through
`/api/live-admin`. Browsers can only *read* those docs.

### Seating chart
```bash
node scripts/firebase/import_seating.js --dry-run   # check the CSV
node scripts/firebase/import_seating.js             # upload → Firestore seating/reception
```
Default CSV: `media/Reception Seating Chart - A-Z Seating Chart.csv`
(gitignored). Re-run whenever the chart changes.

---

## Chatbot

Answers guest questions at the bottom of `/sangeet` and `/wedding`.

- Edit published public answers in the messaging dashboard's **Knowledge** tab.
  Changes apply to SMS and website chat without redeployment.
- `api/chat.js` validates requests and streams answers through
  `api/_lib/messaging-proxy.js` to the shared messaging backend.
- Website chat requires `MESSAGING_ASSISTANT_URL` and `WEB_CHAT_SERVICE_TOKEN`.
  Missing configuration returns an unavailable response; there is no local bot.
- The OpenAI key and model are configured only in the messaging backend.
- Website event and live schedule files still power their existing pages.

### Secrets (never committed)
| Variable | Used by |
|---|---|
| `MESSAGING_ASSISTANT_URL` | shared assistant endpoint |
| `WEB_CHAT_SERVICE_TOKEN` | authenticates the website to the messaging backend |
| `LIVE_ADMIN_PASSWORD` | `/live-admin` |
| `FIREBASE_SERVICE_ACCOUNT` | `/live-admin` on Vercel (paste the whole service-account JSON) |

Store `FIREBASE_SERVICE_ACCOUNT` as a Vercel **Secret** for both Production and
Preview environments, then redeploy. The deployed API reads this credential only
from the environment variable; it never reads a credential file. Local credential
files remain excluded from Git-based deployments through `.gitignore`.

The Firebase web configuration in `assets/js/` and the HTML pages is intentionally
public and is not a service-account credential. Access to Firestore data is
controlled by the canonical `firestore.rules` in the messaging repository.

- **Vercel:** Project → Settings → Environment Variables → add each one →
  redeploy.
- **Local:** copy `.env.example` → `.env.local`, fill it in, then run
  `node scripts/dev-server.js` and open http://localhost:3001. `.env*` and
  `.vercel/` are gitignored. Before pushing, `git status` should never list
  `.env.local`.

## Shared chat knowledge

Website chat uses the messaging API through the server-only
MESSAGING_ASSISTANT_URL and WEB_CHAT_SERVICE_TOKEN variables. Published facts live
in Firestore and are edited in the messaging dashboard. The browser never reads
private knowledge collections directly. Removing either setting disables website
chat; it does not switch to a separate facts file or assistant.

The website deploys independently from its own repository root. Moving this local
checkout does not require changing Vercel's repository root-directory setting.
Database rules/indexes have one deployment owner in messaging.

Website schedule files remain the source for its live pages; schedule changes
also require a reviewed Firestore snapshot publication in messaging. Editing a
written Knowledge fact does not update schedule times.


## Food menus (`/food`, `/food-sangeet`, `/food-haldi`)

Text-first, printable menus with dietary checkboxes. Matches must satisfy every
selected preference; highlighting keeps the full menu visible by default. Guests
can optionally show only matches. The pages work as complete menus without JavaScript.

- `/food`: Wedding (breakfast, post-baraat refreshments and lunch) + Reception.
- `/food-sangeet`: Sangeet + Wedding + Reception.
- `/food-haldi`: Haldi + Sangeet + Wedding + Reception.

Food is hidden from the main navigation while testing. Open the menu URLs directly.
Share the expanded links directly with the appropriate invitees; the pages do not link to the other audience versions. These
are public, unlisted pages with `noindex`, not authenticated invitation checks.

**To change dishes, labels or event assignments:** edit `media/food-menu.json`,
then run `node scripts/build-food-pages.js` and include the regenerated three
`pages/food*.html` files. Move an item or course between events in that data file.
Each item’s `translation` field supplies the small italic English description beneath its name.
To change layout or interactions, edit `assets/css/food.css`, `assets/js/food.js`
and the HTML template in `scripts/build-food-pages.js`.

Initial source: the supplied Uthsaav Lunch, Reception and Sangeet PDFs (November
11 draft). Equipment quantities, serving instructions and source-document links
are omitted from guest menus. The Haldi menu was supplied separately by the organizer;
its dietary labels are awaiting confirmation. Labels remain provisional.
Tags: `v` vegetarian, `vg` vegan, `df` dairy-free, `gf` gluten-free, `nuts` contains
nuts. Vegan implies vegetarian and dairy-free for matching. Missing labels never
imply ingredient absence; no nut-free or soy-free claims are inferred. Use `review`
to explain conflicting labels; do not include a disputed tag until confirmed.
Yogurt rice and reception raita have disputed vegan labels withheld. Cross-contact
and soy-oil notes stay visible even when filtering. Ingredient subcomponents do
not qualify an entire dish (for example, chole alone is listed gluten-free, while
the chole bhatura dish is not).

Run the local food checks with `node --test scripts/tests/food.test.js`.
