/* ============================================================
   WEDDING WEBSITE — firestore_data.js
   The site's data layer. Reads come from Cloud Firestore;
   writes go to Firestore and (optionally) mirror to the old
   Apps Script so Google Sheets stays in sync during cutover.

   Load AFTER the Firebase compat SDKs and BEFORE schedule.js.
   Exposes: window.WeddingData
   ============================================================ */

(function (global) {
  'use strict';

  // ── Configuration ───────────────────────────────────────────
  var FIREBASE_CONFIG = {
    apiKey: "AIzaSyD6gi-yVGhFNFaUVdj783_nrnWInfooGas",
    authDomain: "wedding-website-backend-5a8df.firebaseapp.com",
    projectId: "wedding-website-backend-5a8df",
    storageBucket: "wedding-website-backend-5a8df.firebasestorage.app",
    messagingSenderId: "110097299269",
    appId: "1:110097299269:web:f412e7eaac9188639ef02c",
    measurementId: "G-FCHBTGM4PX"
  };

  // The legacy Apps Script. Used only for mirroring writes back to the
  // Sheet while both systems run side by side. Set MIRROR_TO_SHEET to
  // false (or blank the URL) for a clean Firestore-only cutover.
  var LEGACY_API_URL = 'https://script.google.com/macros/s/AKfycbwJJOaKdTIcPv9ZdqX44sgSbYeUPF4Lu6OuOPM28Kfva7LJZ_eLjj-yrlROV2h0dniv/exec';
  var MIRROR_TO_SHEET = true;

  // Canonical display order for events.
  var EVENT_ORDER = [
    'Ganesh Puja',
    'Haldi',
    'Sangeet',
    'Wedding',
    'Reception',
    'Satyanarayana Puja',
    'Atlanta Reception'
  ];

  // ── Firestore handle (lazy) ─────────────────────────────────
  var _db = null;
  function db() {
    if (_db) return _db;
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK not loaded');
    }
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    _db = firebase.firestore();
    // Serve repeat visits from the local cache — this is what makes the
    // roster appear instantly instead of waiting on a round trip.
    try { _db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* not fatal */ }
    return _db;
  }

  // ── Helpers ─────────────────────────────────────────────────
  function nameKeyOf(first, last) {
    return (String(first || '').trim() + '_' + String(last || '').trim())
      .toLowerCase().replace(/\s+/g, '_');
  }

  function orderedEvents(invites) {
    var keys = Object.keys(invites || {}).filter(function (k) { return invites[k]; });
    keys.sort(function (a, b) {
      var ia = EVENT_ORDER.indexOf(a), ib = EVENT_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return keys;
  }

  /** Firestore document → the member shape the existing UI already expects. */
  function toMember(doc) {
    var d = doc.data() || {};
    return {
      _docId: doc.id,
      firstName: d.firstName || '',
      lastName: d.lastName || '',
      displayName: d.displayName || ((d.firstName || '') + ' ' + (d.lastName || '')).trim(),
      envelopeName: d.displayName || '',
      events: orderedEvents(d.invites),
      rsvp: d.rsvp || {},
      nutAllergy: d.nutAllergy || '',
      dietaryRestrictions: d.dietaryRestrictions || '',
      songRequests: d.songRequests || '',
      email: d.email || '',
      phone: d.phone || '',
      sheetRow: typeof d.sheetRow === 'number' ? d.sheetRow : 1e9
    };
  }

  // ── Read: look up a guest and their whole party ──────────────
  async function lookupParty(fname, lname) {
    var key = nameKeyOf(fname, lname);
    var guests = db().collection('guests');

    // nameKey rather than document id, so guests who share a name
    // (stored as `name__2`) are still found.
    var matches = await guests.where('nameKey', '==', key).get();

    if (matches.empty) {
      var err = new Error('Guest not found');
      err.code = 'not-found';
      throw err;
    }

    var me = toMember(matches.docs[0]);
    var partyKey = (matches.docs[0].data() || {}).partyKey || '';
    var members;

    if (partyKey) {
      var partySnap = await guests.where('partyKey', '==', partyKey).get();
      members = partySnap.docs.map(toMember);
      // Keep Sheet order, but always show the guest who logged in first.
      members.sort(function (a, b) {
        if (a._docId === me._docId) return -1;
        if (b._docId === me._docId) return 1;
        return a.sheetRow - b.sheetRow;
      });
    } else {
      members = [me];
    }

    return {
      success: true,
      party: (matches.docs[0].data() || {}).party || '',
      displayName: (matches.docs[0].data() || {}).party || '',
      members: members,
      timestamp: new Date().toISOString()
    };
  }

  // ── Write: save one member's RSVP ───────────────────────────
  async function submitRSVP(payload) {
    var member = (payload.members || [])[0];
    if (!member) throw new Error('Nothing to submit');

    var docId = member._docId || nameKeyOf(member.firstName, member.lastName);
    var timestamp = new Date().toISOString();

    // Keep rsvpRaw in step with rsvp so the Sheet-shaped mirror of the
    // data never drifts from the friendly one.
    var rsvp = member.rsvp || {};
    var rsvpRaw = {};
    Object.keys(rsvp).forEach(function (ev) {
      rsvpRaw[ev] = rsvp[ev] === 'accepted' ? '1' : (rsvp[ev] === 'declined' ? '0' : '');
    });

    await db().collection('guests').doc(docId).update({
      rsvp: rsvp,
      rsvpRaw: rsvpRaw,
      rsvpTimestamp: timestamp,
      email: member.email || '',
      phone: member.phone || '',
      nutAllergy: member.nutAllergy || '',
      dietaryRestrictions: member.dietaryRestrictions || '',
      songRequests: member.songRequests || ''
    });

    // Mirror to the Sheet so both systems agree until the cutover is final.
    if (MIRROR_TO_SHEET && LEGACY_API_URL) {
      mirrorToSheet(payload);
    }

    return { success: true, timestamp: timestamp };
  }

  /** Best-effort, non-blocking write back to the old Apps Script. */
  function mirrorToSheet(payload) {
    try {
      fetch(LEGACY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      }).catch(function (e) { console.warn('Sheet mirror failed:', e && e.message); });
    } catch (e) {
      console.warn('Sheet mirror failed:', e && e.message);
    }
  }

  // ── Read: everything, for the tracking dashboard ────────────
  async function fetchTracking() {
    var snap = await db().collection('guests').get();

    var guests = snap.docs.map(function (doc) {
      var d = doc.data() || {};
      var row = {};
      // Emit each Sheet column under BOTH its original header and a
      // lowercased alias, so the dashboard's mixed-case lookups all resolve.
      Object.keys(d.raw || {}).forEach(function (h) {
        row[h] = d.raw[h];
        row[h.toLowerCase()] = d.raw[h];
      });
      row._docId = doc.id;
      row._sheetRow = d.sheetRow;
      return row;
    });

    guests.sort(function (a, b) { return (a._sheetRow || 0) - (b._sheetRow || 0); });

    var atlSnap = await db().collection('atl_rsvps').get();
    var atlRsvps = atlSnap.docs.map(function (doc) {
      var d = doc.data() || {};
      return {
        name: d.name || '',
        guests: typeof d.guests === 'number' ? d.guests : 1,
        phone: d.phone || '',
        email: d.email || ''
      };
    });

    return { success: true, guests: guests, atlRsvps: atlRsvps };
  }

  // ── Write: an Atlanta reception sign-up ─────────────────────
  async function submitAtl(entry) {
    var doc = {
      name: String(entry.name || '').trim(),
      guests: parseInt(entry.guests, 10) || 1,
      phone: String(entry.phone || '').trim(),
      email: String(entry.email || '').trim(),
      timestamp: new Date().toISOString()
    };

    // Auto-id: several households can legitimately share a surname.
    await db().collection('atl_rsvps').add(doc);

    if (MIRROR_TO_SHEET && LEGACY_API_URL) {
      mirrorToSheet({ action: 'atl_submit', pwd: 'pg2026', name: doc.name,
                      guests: doc.guests, phone: doc.phone, email: doc.email });
    }

    return { success: true, timestamp: doc.timestamp };
  }

  global.WeddingData = {
    lookupParty: lookupParty,
    submitRSVP: submitRSVP,
    fetchTracking: fetchTracking,
    submitAtl: submitAtl,
    nameKeyOf: nameKeyOf,
    EVENT_ORDER: EVENT_ORDER,
    get mirrorToSheet() { return MIRROR_TO_SHEET; },
    set mirrorToSheet(v) { MIRROR_TO_SHEET = !!v; }
  };
})(window);
