# Wedding Website

## Architecture

The website uses **Firebase Firestore** as its primary database. Google Sheets is kept as a backup (written to automatically on every RSVP submission via Apps Script).

- **Guest lookup, RSVP read/write** → Firestore `guests` collection
- **ATL walk-in RSVPs** → Firestore `atl_rsvps` collection
- **Google Sheet** → backup (fire-and-forget via Apps Script after each submit)

---

## Managing the Guest List

Guests are now managed directly in **Firebase Console** — no CSV editing or script running needed.

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
| `envelopeName` | string | `Gautam Chebrolu` |
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
