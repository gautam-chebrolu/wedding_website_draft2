# Wedding Website

## Architecture

The website uses **Firebase Firestore** as its primary database. Google Sheets is kept as a backup (written to automatically on every RSVP submission via Apps Script).

- **Guest lookup, RSVP read/write** → Firestore `guests` collection
- **ATL walk-in RSVPs** → Firestore `atl_rsvps` collection
- **Google Sheet** → backup (fire-and-forget via Apps Script after each submit)

---

## Managing the Guest List

Guests can be managed through the password-protected **Guest List Manager** at
`/guests`, or directly in **Firebase Console**. The manager supports editing all
guest details, duplicating a selected person to quickly add a party member, manual
RSVP updates, and document-ID changes for spelling corrections.

The manager uses the same browser-to-Firebase approach as the RSVP pages, with no
Vercel environment variables. Its password is currently `password`; change it in
`guests.html` if desired. Changing a Document ID moves the record and preserves
other existing fields.

Deploy the revised Firestore rules before using the manager:

```bash
firebase deploy --only firestore:rules --project wedding-website-backend-5a8df
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
  headers on `tracking.html`. Maintained on the **GroupLookup** tab of the Google
  Sheet (`Name`, `Group`) and pushed into Firestore by `sync_from_sheet.js`.
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
edits into Firestore with `sync_from_sheet.js`. It reads the live Sheet, diffs it
against Firestore, and writes only what actually changed.

Requires `service-account-key.json` in the project root (gitignored), and the Sheet
shared as *Anyone with the link → Viewer*.

Always preview first — the dry run prints a field-by-field diff and writes nothing:

```bash
node sync_from_sheet.js --dry-run
```

**Roster fields always come from the Sheet** — `firstName`, `lastName`, `party`,
`groupName`, `envelopeName`, `displayName`, `tags`, `events`, and the address fields.

**RSVP fields need you to pick a winner** — `rsvp`, `rsvpStatus`, `rsvpTimestamp`,
`nutAllergy`, `dietaryRestrictions`, `songRequests`, `email`, `phone`. These are
contested because the website writes RSVPs straight to Firestore and only mirrors
them to the Sheet best-effort, while you also edit the Sheet by hand.

| Command | RSVP fields |
|---|---|
| `node sync_from_sheet.js` | **Firestore wins.** The Sheet only fills in what Firestore leaves blank, so a guest's submitted RSVP is never overwritten. Use for routine roster updates. |
| `node sync_from_sheet.js --sheet-wins` | **Sheet wins where it has a value**, but a blank Sheet cell leaves a populated Firestore field alone. **Use this after editing RSVPs by hand in the Sheet.** |
| `node sync_from_sheet.js --full` | **Sheet wins absolutely, blanks included.** This *erases* Firestore values whose Sheet cell is empty — including ~56 phone numbers that came from the original CSV import and were never copied into the Sheet. Rarely what you want. |

Other flags:

```bash
node sync_from_sheet.js --groups-only # only refresh groupName
node sync_from_sheet.js --prune       # delete Firestore docs missing from the Sheet
```

Without `--prune`, documents present in Firestore but absent from the Sheet are only
*reported*, flagged if they hold submitted RSVP data. These are usually the old
spelling of a renamed guest — check the list before pruning.

The sync also refuses to let two guests with the same name overwrite each other: the
document id is `firstname_lastname`, so identical names collide. Only the first row is
synced and the collision is reported — fix it in the Sheet (e.g. add a middle initial),
since the website lookup cannot tell such guests apart either.

---

## One-Time Migration (already done)

The initial guest list was migrated from the CSV using `migrate_to_firestore.js`. You should not need to run this again, but if you ever need to re-seed from a CSV:

1. Download a service account key from Firebase Console → Project Settings → Service Accounts → **Generate New Private Key**
2. Save it as `service-account-key.json` in the project root (this file is gitignored — never commit it)
3. Run:
   ```bash
   node migrate_to_firestore.js
   ```

---

## Deployment

The site is deployed on **Vercel** and updates automatically on push to `main`.

The Firebase security rules are in `firestore.rules`. To deploy rule changes:
```bash
firebase deploy --only firestore:rules --project wedding-website-backend-5a8df
```

---

## Deprecated Files (kept as archive)

| File | Status |
|---|---|
| `encrypt_guests.js` | Deprecated — no longer needed |
| `setup_sheet.js` | Deprecated — no longer needed |
| `media/guest_data.js` | Deprecated — no longer loaded by the site |
| `media/wedding_guest_list_july3.csv` | Archived — source data for initial migration |
