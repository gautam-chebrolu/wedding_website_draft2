/* ============================================================
   WEDDING WEBSITE — schedule.js
   Handles: password validation, client-side decryption,
            party roster, individual schedule + RSVP
   ============================================================ */

// ── Configuration ───────────────────────────────────────────
// After deploying the Google Apps Script web app, paste the
// deployment URL here.  Leave empty to run in schedule-only mode.
const RSVP_API_URL = 'https://script.google.com/macros/s/AKfycbwJJOaKdTIcPv9ZdqX44sgSbYeUPF4Lu6OuOPM28Kfva7LJZ_eLjj-yrlROV2h0dniv/exec';

// ── Firebase / Firestore (backup write) ─────────────────────
// The website writes directly to Firestore after each successful
// RSVP submission.  This is purely a backup — Google Sheets
// remains the source of truth.
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyD6gi-yVGhFNFaUVdj783_nrnWInfooGas",
  authDomain: "wedding-website-backend-5a8df.firebaseapp.com",
  projectId: "wedding-website-backend-5a8df",
  storageBucket: "wedding-website-backend-5a8df.firebasestorage.app",
  messagingSenderId: "110097299269",
  appId: "1:110097299269:web:f412e7eaac9188639ef02c",
  measurementId: "G-FCHBTGM4PX"
};

// Lazy-init: only initialise once the first time we need it
let _db = null;
function getFirestore() {
  if (_db) return _db;
  if (typeof firebase === 'undefined') return null;
  if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }
  _db = firebase.firestore();
  return _db;
}

// Best-effort Firestore write — never blocks or throws to the caller
async function writeToFirestore(payload, timestamp) {
  try {
    var db = getFirestore();
    if (!db) { console.warn('Firestore SDK not loaded'); return; }

    var members = payload.members || [];
    var party = payload.party || '';

    for (var i = 0; i < members.length; i++) {
      var m = members[i];
      var docId = (m.firstName + '_' + m.lastName).toLowerCase().replace(/\s+/g, '_');

      // Build the rsvp sub-map (mirrors what Apps Script used to write)
      var rsvpMap = {};
      if (m.rsvp) {
        Object.keys(m.rsvp).forEach(function (k) { rsvpMap[k] = m.rsvp[k]; });
      }

      await db.collection('rsvp_guests').doc(docId).set({
        firstName: m.firstName || '',
        lastName: m.lastName || '',
        party: party,
        nutAllergy: m.nutAllergy || '',
        dietaryRestrictions: m.dietaryRestrictions || '',
        email: m.email || '',
        phone: m.phone || '',
        rsvpTimestamp: timestamp || new Date().toISOString(),
        rsvp: rsvpMap
      }, { merge: true });   // merge:true so a partial update never wipes other fields

      console.log('Firestore write OK:', docId);
    }
  } catch (err) {
    // Non-fatal — log but don't surface to the user
    console.warn('Firestore backup write failed:', err.message || err);
  }
}

document.addEventListener('DOMContentLoaded', function () {

  // ── DOM References ────────────────────────────────────────
  const stepPassword = document.getElementById('step-password');
  const stepName = document.getElementById('step-name');
  const stepParty = document.getElementById('step-party');       // NEW: party roster
  const stepSchedule = document.getElementById('step-schedule'); // individual view

  const passwordForm = document.getElementById('password-form');
  const passwordInput = document.getElementById('password-input');
  const passwordError = document.getElementById('password-error');

  const nameForm = document.getElementById('name-form');
  const fnameInput = document.getElementById('fname-input');
  const lnameInput = document.getElementById('lname-input');
  const nameError = document.getElementById('name-error');

  const guestGreeting = document.getElementById('guest-greeting');
  const partyInfoEl = document.getElementById('party-info');
  const partyRoster = document.getElementById('party-roster');

  const backToPartyBtn = document.getElementById('back-to-party-btn');
  const memberScheduleName = document.getElementById('member-schedule-name');
  const memberRsvpBadge = document.getElementById('member-rsvp-badge');

  const scheduleContainer = document.getElementById('schedule-container');
  const calendarBtn = document.getElementById('calendar-btn');

  const rsvpLoadingEl = document.getElementById('rsvp-loading');
  const rsvpErrorBanner = document.getElementById('rsvp-error-banner');
  const rsvpQuestionsEl = document.getElementById('rsvp-questions-section');
  const rsvpSaveBar = document.getElementById('rsvp-save-bar');
  const submitRsvpBtn = document.getElementById('submit-rsvp-btn');
  const updateRsvpBtn = document.getElementById('update-rsvp-btn');
  const rsvpSuccessEl = document.getElementById('rsvp-success');

  // ── State ─────────────────────────────────────────────────
  let currentGuestEvents = [];   // For ICS export (current individual)
  let currentPartyData = null;   // Full API response (all members)
  let currentMember = null;      // The member whose schedule is open
  let isSubmitting = false;
  let isDirty = false;           // True when unsaved toggle changes exist

  const CORRECT_PASSWORD = 'pg2026';
  const LS_PASSWORD_KEY = 'pg_pwd_verified';

  // ── Auto-restore session ──────────────────────────────────
  (function restoreSession() {
    if (localStorage.getItem(LS_PASSWORD_KEY) === 'true') {
      stepPassword.style.display = 'none';
      stepName.style.display = 'block';
    }
  })();

  // ── Step 1: Password ──────────────────────────────────────
  passwordForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var inputPwd = passwordInput.value.trim().toLowerCase();
    if (inputPwd === CORRECT_PASSWORD) {
      localStorage.setItem(LS_PASSWORD_KEY, 'true');
      passwordError.style.display = 'none';
      stepPassword.style.display = 'none';
      stepName.style.display = 'block';
    } else {
      passwordError.textContent = 'Incorrect password. Please check your invitation.';
      passwordError.style.display = 'block';
    }
  });

  // ── Step 2: Name Lookup ───────────────────────────────────
  nameForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var fname = fnameInput.value.trim().toLowerCase();
    var lname = lnameInput.value.trim().toLowerCase();

    if (!fname || !lname) {
      showNameError('Please enter both First and Last Name.');
      return;
    }

    if (typeof GUEST_DATA_SECURE === 'undefined') {
      showNameError('Guest data is not loaded yet.');
      return;
    }

    var normalizedName = fname + ' ' + lname;
    var nameHash = hashString(normalizedName);
    var encryptedTags = GUEST_DATA_SECURE[nameHash];

    if (!encryptedTags) {
      showNameError("That name doesn't exist.");
      return;
    }

    nameError.style.display = 'none';
    var key = normalizedName + CORRECT_PASSWORD;
    var decryptedStr = decrypt(encryptedTags, key);

    var realFirstName = fname;
    if (decryptedStr.includes('|')) {
      realFirstName = decryptedStr.split('|')[0];
    }

    // Show party step
    stepName.style.display = 'none';
    stepParty.style.display = 'block';

    var formattedName = capitalize(realFirstName);
    guestGreeting.textContent = 'Welcome, ' + formattedName + '!';

    if (RSVP_API_URL) {
      rsvpLoadingEl.style.display = 'flex';
      try {
        var partyData = await fetchRSVPData(fname, lname);
        currentPartyData = partyData;
        rsvpLoadingEl.style.display = 'none';
        renderPartyRoster(partyData);
      } catch (err) {
        console.error('RSVP API error:', err);
        rsvpLoadingEl.style.display = 'none';
        rsvpErrorBanner.style.display = 'block';
        // Fall back: create a single-member roster from the encrypted local data
        var tagsStr = decryptedStr.includes('|') ? decryptedStr.split('|').slice(1).join('|') : decryptedStr;
        renderPartyRosterFallback(realFirstName, fname, lname, tagsStr);
      }
    } else {
      // No API — schedule-only fallback
      var tagsStr = decryptedStr.includes('|') ? decryptedStr.split('|').slice(1).join('|') : decryptedStr;
      renderPartyRosterFallback(realFirstName, fname, lname, tagsStr);
    }
  });

  // ── Back button: individual → party roster ────────────────
  backToPartyBtn.addEventListener('click', function () {
    stepSchedule.style.display = 'none';
    stepParty.style.display = 'block';
    currentMember = null;
    currentGuestEvents = [];
    rsvpSuccessEl.style.display = 'none';
    hideSaveBar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ── Save bar helpers ──────────────────────────────────────
  function showSaveBar() {
    if (rsvpSaveBar.style.display === 'flex') return; // already visible
    rsvpSaveBar.style.display = 'flex';
    requestAnimationFrame(function () { rsvpSaveBar.classList.add('visible'); });
  }

  function hideSaveBar() {
    isDirty = false;
    rsvpSaveBar.classList.remove('visible');
    setTimeout(function () {
      if (!isDirty) rsvpSaveBar.style.display = 'none';
    }, 350);
  }

  // ── Calendar Export ───────────────────────────────────────
  calendarBtn.addEventListener('click', function () {
    if (currentGuestEvents.length === 0) return;

    var ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Priya and Gautam Wedding//EN\n';

    currentGuestEvents.forEach(function (e) {
      ics += 'BEGIN:VEVENT\n';
      ics += 'UID:' + Math.random().toString(36).substring(2) + '@priyaandgautam.com\n';
      ics += 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z\n';
      ics += 'DTSTART:' + e.icsStart + '\n';
      ics += 'DTEND:' + e.icsEnd + '\n';
      ics += 'SUMMARY:' + e.name + ' - Priya & Gautam\'s Wedding\n';
      ics += 'LOCATION:' + e.address + '\n';
      var icsDescText = e.description ? e.description.join('\\n') : '';
      ics += 'DESCRIPTION:' + icsDescText + '\\n\\nMap: ' + e.mapLink + '\\nTime: ' + e.time + '\n';
      ics += 'END:VEVENT\n';
    });

    ics += 'END:VCALENDAR';

    var blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'Priya_Gautam_Wedding.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  });


  // ════════════════════════════════════════════════════════════
  //  API
  // ════════════════════════════════════════════════════════════

  async function fetchRSVPData(fname, lname) {
    var url = RSVP_API_URL +
      '?action=lookup' +
      '&fname=' + encodeURIComponent(fname) +
      '&lname=' + encodeURIComponent(lname) +
      '&pwd=' + encodeURIComponent(CORRECT_PASSWORD);

    var response = await fetch(url, { redirect: 'follow' });
    var data = await response.json();

    if (!data.success) throw new Error(data.error || 'Lookup failed');
    return data;
  }

  async function submitRSVPToAPI(payload) {
    try {
      var response = await fetch(RSVP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });
      return await response.json();
    } catch (postErr) {
      console.warn('POST failed, trying GET fallback:', postErr);
      var encodedData = encodeURIComponent(JSON.stringify(payload));
      var url = RSVP_API_URL +
        '?action=submit' +
        '&pwd=' + encodeURIComponent(CORRECT_PASSWORD) +
        '&data=' + encodedData;
      var response = await fetch(url, { redirect: 'follow' });
      return await response.json();
    }
  }


  // ════════════════════════════════════════════════════════════
  //  STEP 3: PARTY ROSTER
  // ════════════════════════════════════════════════════════════

  function renderPartyRoster(partyData) {
    var members = partyData.members;
    var isParty = members.length > 1;

    // Party name is internal — do not expose it to guests.
    partyInfoEl.style.display = 'none';

    partyRoster.innerHTML = '';

    members.forEach(function (member) {
      var card = buildMemberRosterCard(member, isParty, true);
      partyRoster.appendChild(card);
    });
  }

  // Fallback when API is unavailable — single-member roster from local data
  function renderPartyRosterFallback(firstName, fname, lname, tagsStr) {
    var fakeMember = {
      firstName: capitalize(firstName),
      lastName: capitalize(lname),
      envelopeName: '',
      events: tagsStr.split(',').map(function (t) { return t.trim(); }),
      rsvp: {},
      nutAllergy: '',
      dietaryRestrictions: '',
      email: '',
      phone: ''
    };
    currentPartyData = { party: '', members: [fakeMember] };

    partyRoster.innerHTML = '';
    var card = buildMemberRosterCard(fakeMember, false, false);
    partyRoster.appendChild(card);
  }

  function buildMemberRosterCard(member, showLastName, apiAvailable) {
    var rsvpEntries = Object.keys(member.rsvp || {});
    var totalEvents = member.events ? member.events.length : 0;
    var answeredCount = rsvpEntries.length;
    var declinedCount = 0;
    rsvpEntries.forEach(function (k) {
      if (member.rsvp[k] === 'declined') declinedCount++;
    });

    var badgeHtml = '';
    if (answeredCount === 0) {
      // No answers at all
      badgeHtml = '<span class="roster-badge pending">RSVP Pending</span>';
    } else if (answeredCount < totalEvents) {
      // Some events still unanswered
      badgeHtml = '<span class="roster-badge partial">Partially Responded</span>';
    } else if (declinedCount > 0) {
      // All answered, at least one decline
      badgeHtml = '<span class="roster-badge attending-some">Attending Some</span>';
    } else {
      // All answered, all accepted
      badgeHtml = '<span class="roster-badge attending">Attending All</span>';
    }

    var eventCountHtml = '<span class="roster-event-count">' + totalEvents + ' event' + (totalEvents !== 1 ? 's' : '') + '</span>';

    var displayName = showLastName
      ? member.firstName + ' ' + member.lastName
      : member.firstName;

    var card = document.createElement('button');
    card.className = 'party-roster-card';
    card.setAttribute('type', 'button');
    card.innerHTML = '\
      <div class="roster-card-left">\
        <div class="roster-avatar">' + (member.firstName.charAt(0) + member.lastName.charAt(0)).toUpperCase() + '</div>\
        <div class="roster-card-info">\
          <span class="roster-name">' + displayName + '</span>\
          ' + eventCountHtml + '\
        </div>\
      </div>\
      <div class="roster-card-right">\
        ' + badgeHtml + '\
        <svg class="roster-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>\
      </div>';

    card.addEventListener('click', function () {
      openMemberSchedule(member, apiAvailable);
    });

    // Store a reference so we can update the card after RSVP save
    card.dataset.memberKey = memberKey(member);

    return card;
  }


  // ════════════════════════════════════════════════════════════
  //  STEP 4: INDIVIDUAL SCHEDULE + RSVP
  // ════════════════════════════════════════════════════════════

  function openMemberSchedule(member, apiAvailable) {
    currentMember = member;
    currentGuestEvents = [];
    isDirty = false;

    // Update header
    memberScheduleName.textContent = member.firstName + ' ' + member.lastName;
    updateMemberBadge(member);

    // Clear previous state
    scheduleContainer.innerHTML = '';
    rsvpQuestionsEl.innerHTML = '';
    rsvpQuestionsEl.style.display = 'none';
    rsvpSuccessEl.style.display = 'none';
    hideSaveBar();

    // Correct save bar buttons for this member
    var hasExistingRsvp = member.rsvp && Object.keys(member.rsvp).length > 0;
    submitRsvpBtn.style.display = hasExistingRsvp ? 'none' : 'inline-block';
    updateRsvpBtn.style.display = hasExistingRsvp ? 'inline-block' : 'none';
    submitRsvpBtn.textContent = 'Save RSVP';
    updateRsvpBtn.textContent = 'Update RSVP';
    submitRsvpBtn.disabled = false;
    updateRsvpBtn.disabled = false;

    // Switch views
    stepParty.style.display = 'none';
    stepSchedule.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Render events
    var memberEvents = member.events || [];

    for (var tagKey in EVENTS) {
      if (memberEvents.indexOf(tagKey) === -1) continue;

      var eventDetails = EVENTS[tagKey];
      currentGuestEvents.push(eventDetails);

      var card = createEventCard(eventDetails, tagKey, member, apiAvailable);
      scheduleContainer.appendChild(card);
    }

    if (currentGuestEvents.length === 0) {
      scheduleContainer.innerHTML = '<p class="no-events-msg">No events found. Please contact Priya or Gautam.</p>';
      return;
    }

    if (apiAvailable) {
      renderSupplementalQuestions(member);

      // Bind submit buttons (remove old listeners first by cloning)
      var newSubmit = submitRsvpBtn.cloneNode(true);
      var newUpdate = updateRsvpBtn.cloneNode(true);
      submitRsvpBtn.parentNode.replaceChild(newSubmit, submitRsvpBtn);
      updateRsvpBtn.parentNode.replaceChild(newUpdate, updateRsvpBtn);

      // Re-reference after clone
      document.getElementById('submit-rsvp-btn').addEventListener('click', handleRSVPSubmit);
      document.getElementById('update-rsvp-btn').addEventListener('click', handleRSVPSubmit);
    }
  }


  function createEventCard(eventDetails, tagKey, member, apiAvailable) {
    var icsDescText = eventDetails.description ? eventDetails.description.join('\\n') : '';
    var evtName = encodeURIComponent(eventDetails.name + " - Priya & Gautam's Wedding");
    var evtDesc = encodeURIComponent(icsDescText + '\\n\\nMap: ' + eventDetails.mapLink + '\\nTime: ' + eventDetails.time);
    var evtLoc = encodeURIComponent(eventDetails.address);

    var googleLink = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + evtName +
      '&dates=' + eventDetails.icsStart + '/' + eventDetails.icsEnd +
      '&details=' + evtDesc + '&location=' + evtLoc;
    var outlookLink = 'https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent' +
      '&subject=' + evtName + '&startdt=' + eventDetails.icsStart +
      '&enddt=' + eventDetails.icsEnd + '&body=' + evtDesc + '&location=' + evtLoc;
    var singleIcs = 'BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:' + eventDetails.icsStart +
      '\nDTEND:' + eventDetails.icsEnd + '\nSUMMARY:' + eventDetails.name +
      " - Priya & Gautam's Wedding\nLOCATION:" + eventDetails.address +
      '\nDESCRIPTION:' + icsDescText + '\\n\\nMap: ' + eventDetails.mapLink +
      '\\nTime: ' + eventDetails.time + '\nEND:VEVENT\nEND:VCALENDAR';
    var appleLink = 'data:text/calendar;charset=utf8,' + encodeURIComponent(singleIcs);

    var descHtml = eventDetails.description
      ? '<div class="schedule-description">' +
      eventDetails.description.map(function (d) { return '<p>' + d + '</p>'; }).join('') +
      '</div>'
      : '';

    // RSVP toggles column (only when API available) — vertical stack on the right
    var rsvpHtml = '';
    if (apiAvailable) {
      var currentRsvp = (member.rsvp && member.rsvp[tagKey]) ? member.rsvp[tagKey] : '';
      var acceptClass = currentRsvp === 'accepted' ? ' selected' : '';
      var declineClass = currentRsvp === 'declined' ? ' selected' : '';

      rsvpHtml =
        '<div class="card-rsvp-col">' +
        '<button type="button" class="rsvp-toggle accept' + acceptClass + '" ' +
        'data-event="' + tagKey + '" data-value="accepted">Joyfully Accept</button>' +
        '<button type="button" class="rsvp-toggle decline' + declineClass + '" ' +
        'data-event="' + tagKey + '" data-value="declined">Regretfully Decline</button>' +
        '</div>';
    }

    // Card: left = event info, right = RSVP col
    var card = document.createElement('div');
    card.className = 'schedule-card';
    card.innerHTML =
      '<div class="schedule-card-body">' +
      '<div class="schedule-card-info">' +
      '<div class="schedule-date">' + eventDetails.date + '<br><span class="schedule-time">' + eventDetails.time + '</span></div>' +
      '<h3>' + eventDetails.name + '</h3>' +
      descHtml +
      '<p class="schedule-location">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>' +
      '<strong>' + eventDetails.location + '</strong>' +
      '</p>' +
      '<a href="' + eventDetails.mapLink + '" class="schedule-address-link" target="_blank" rel="noopener noreferrer">' +
      eventDetails.address +
      '</a>' +
      '<div class="event-calendar-links">' +
      '<span>Add to:</span>' +
      '<a href="' + googleLink + '" target="_blank" rel="noopener noreferrer">Google</a>' +
      '<a href="' + outlookLink + '" target="_blank" rel="noopener noreferrer">Outlook</a>' +
      '<a href="' + appleLink + '" download="' + eventDetails.name.replace(/\s+/g, '_') + '.ics">Apple / ICS</a>' +
      '</div>' +
      '</div>' +
      rsvpHtml +
      '</div>';

    // Bind toggle clicks — clicking an already-selected button deselects it
    if (apiAvailable) {
      card.querySelectorAll('.rsvp-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var wasSelected = btn.classList.contains('selected');
          btn.closest('.card-rsvp-col').querySelectorAll('.rsvp-toggle').forEach(function (b) {
            b.classList.remove('selected');
          });
          if (!wasSelected) btn.classList.add('selected');

          // Mark dirty and show the save bar
          isDirty = true;
          showSaveBar();
          rsvpSuccessEl.style.display = 'none';
        });
      });
    }

    return card;
  }


  function renderSupplementalQuestions(member) {
    var mid = memberKey(member);
    var html = '<div class="rsvp-questions-container">';
    html += '<h3 class="rsvp-questions-title">Additional Information</h3>';
    html += '<div class="rsvp-member-questions">';

    // Nut allergy
    var nutYes = member.nutAllergy && member.nutAllergy.toLowerCase() === 'yes' ? ' checked' : '';
    var nutNo = !nutYes ? ' checked' : '';
    html += '<div class="rsvp-field">';
    html += '<label>Nut Allergy?</label>';
    html += '<div class="rsvp-radio-group">';
    html += '<label class="rsvp-radio"><input type="radio" name="nut_' + mid + '" value="No"' + nutNo + '><span>No</span></label>';
    html += '<label class="rsvp-radio"><input type="radio" name="nut_' + mid + '" value="Yes"' + nutYes + '><span>Yes</span></label>';
    html += '</div></div>';

    // Dietary restrictions
    var dietaryVal = member.dietaryRestrictions || '';
    html += '<div class="rsvp-field">';
    html += '<label for="dietary_' + mid + '">Dietary Restrictions</label>';
    html += '<input type="text" id="dietary_' + mid + '" class="rsvp-input" placeholder="e.g. Vegetarian, Gluten-free" value="' + escapeAttr(dietaryVal) + '">';
    html += '</div>';

    // Email
    var emailVal = member.email || '';
    html += '<div class="rsvp-field">';
    html += '<label for="email_' + mid + '">Email Address <span class="rsvp-required">*</span></label>';
    html += '<input type="email" id="email_' + mid + '" class="rsvp-input" placeholder="your@email.com" value="' + escapeAttr(emailVal) + '" autocomplete="email" required>';
    html += '<span class="rsvp-field-error" id="email_err_' + mid + '" aria-live="polite"></span>';
    html += '</div>';

    // Phone
    var phoneVal = member.phone || '';
    html += '<div class="rsvp-field">';
    html += '<label for="phone_' + mid + '">Phone Number <span class="rsvp-required">*</span></label>';
    html += '<input type="tel" id="phone_' + mid + '" class="rsvp-input" placeholder="(555) 123-4567" value="' + escapeAttr(phoneVal) + '" autocomplete="tel" required>';
    html += '<span class="rsvp-field-error" id="phone_err_' + mid + '" aria-live="polite"></span>';
    html += '</div>';

    html += '</div></div>'; // .rsvp-member-questions / .rsvp-questions-container

    rsvpQuestionsEl.innerHTML = html;
    rsvpQuestionsEl.style.display = 'block';

    // ── Inline validation listeners ───────────────────────────
    var emailInput = document.getElementById('email_' + mid);
    var emailErr   = document.getElementById('email_err_' + mid);
    var phoneInput = document.getElementById('phone_' + mid);
    var phoneErr   = document.getElementById('phone_err_' + mid);

    function validateEmail(val) {
      if (!val) return 'Email address is required';
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? '' : 'Please enter a valid email address (e.g. name@example.com)';
    }

    function validatePhone(val) {
      if (!val) return 'Phone number is required';
      // Accept digits, spaces, dashes, dots, parentheses; must have at least 7 digits
      var digits = val.replace(/\D/g, '');
      if (digits.length < 7)  return 'Phone number must have at least 7 digits';
      if (digits.length > 15) return 'Phone number seems too long';
      return '';
    }

    function showFieldError(input, errEl, msg) {
      errEl.textContent = msg;
      if (msg) {
        input.classList.add('rsvp-input-error');
      } else {
        input.classList.remove('rsvp-input-error');
      }
    }

    if (emailInput) {
      emailInput.addEventListener('blur', function () {
        showFieldError(emailInput, emailErr, validateEmail(emailInput.value.trim()));
      });
      emailInput.addEventListener('input', function () {
        // Clear the error as soon as the user starts correcting
        if (emailInput.classList.contains('rsvp-input-error')) {
          showFieldError(emailInput, emailErr, validateEmail(emailInput.value.trim()));
        }
      });
    }

    if (phoneInput) {
      phoneInput.addEventListener('blur', function () {
        showFieldError(phoneInput, phoneErr, validatePhone(phoneInput.value.trim()));
      });
      phoneInput.addEventListener('input', function () {
        if (phoneInput.classList.contains('rsvp-input-error')) {
          showFieldError(phoneInput, phoneErr, validatePhone(phoneInput.value.trim()));
        }
      });
    }
  }


  // ════════════════════════════════════════════════════════════
  //  RSVP SUBMISSION (single member)
  // ════════════════════════════════════════════════════════════

  async function handleRSVPSubmit() {
    if (isSubmitting || !currentMember) return;

    var mid = memberKey(currentMember);

    // Collect per-event RSVP — include ALL member events, even unclicked ones ('' = clear cell)
    var rsvp = {};
    var memberEvents = currentMember.events || [];
    memberEvents.forEach(function (tagKey) {
      // Default to empty (no selection / cleared)
      rsvp[tagKey] = '';
    });
    // Overwrite with any buttons that are currently selected
    scheduleContainer.querySelectorAll('.rsvp-toggle.selected').forEach(function (btn) {
      rsvp[btn.dataset.event] = btn.dataset.value;
    });

    // Collect supplemental questions
    var nutRadio = document.querySelector('input[name="nut_' + mid + '"]:checked');
    var dietary  = document.getElementById('dietary_' + mid);
    var email    = document.getElementById('email_' + mid);
    var phone    = document.getElementById('phone_' + mid);

    // ── Pre-submit validation ─────────────────────────────────
    var emailVal = email ? email.value.trim() : '';
    var phoneVal = phone ? phone.value.trim() : '';

    function _validateEmail(val) {
      if (!val) return 'Email address is required';
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? '' : 'Please enter a valid email address';
    }
    function _validatePhone(val) {
      if (!val) return 'Phone number is required';
      var digits = val.replace(/\D/g, '');
      if (digits.length < 7)  return 'Phone number must have at least 7 digits';
      if (digits.length > 15) return 'Phone number seems too long';
      return '';
    }

    var emailErr = _validateEmail(emailVal);
    var phoneErr = _validatePhone(phoneVal);

    if (emailErr || phoneErr) {
      // Surface errors on the fields and abort
      var emailErrEl = document.getElementById('email_err_' + mid);
      var phoneErrEl = document.getElementById('phone_err_' + mid);
      if (emailErrEl && email) {
        emailErrEl.textContent = emailErr;
        email.classList.toggle('rsvp-input-error', !!emailErr);
        if (emailErr) email.focus();
      }
      if (phoneErrEl && phone) {
        phoneErrEl.textContent = phoneErr;
        phone.classList.toggle('rsvp-input-error', !!phoneErr);
        if (phoneErr && !emailErr) phone.focus();
      }
      showToast('Please fix the highlighted fields before saving.');
      return;
    }
    var payload = {
      action: 'submit',
      pwd: CORRECT_PASSWORD,
      party: currentPartyData ? currentPartyData.party : '',
      displayName: currentPartyData ? (currentPartyData.displayName || currentPartyData.party || '') : '',
      members: [{
        firstName: currentMember.firstName,
        lastName: currentMember.lastName,
        rsvp: rsvp,
        nutAllergy: nutRadio ? nutRadio.value : '',
        dietaryRestrictions: dietary ? dietary.value.trim() : '',
        email: email ? email.value.trim() : '',
        phone: phone ? phone.value.trim() : ''
      }]
    };

    // Submit
    isSubmitting = true;
    var hasExisting = currentMember.rsvp && Object.keys(currentMember.rsvp).length > 0;
    var activeBtn = hasExisting ? document.getElementById('update-rsvp-btn') : document.getElementById('submit-rsvp-btn');
    var originalLabel = hasExisting ? 'Update RSVP' : 'Save RSVP';

    // Turn the entire save bar into a loading indicator
    rsvpSaveBar.classList.add('loading');
    activeBtn.disabled = true;

    try {
      var result = await submitRSVPToAPI(payload);

      if (result.success) {
        // Update local member state
        currentMember.rsvp = rsvp;
        if (nutRadio) currentMember.nutAllergy = nutRadio.value;
        if (dietary) currentMember.dietaryRestrictions = dietary.value.trim();
        if (email) currentMember.email = email.value.trim();
        if (phone) currentMember.phone = phone.value.trim();

        // Update roster card and header badge
        updateRosterCard(currentMember);
        updateMemberBadge(currentMember);

        // Hide save bar — changes are now saved
        rsvpSaveBar.classList.remove('loading');
        hideSaveBar();

        // Best-effort Firestore backup (non-blocking, never surfaces errors)
        var firestoreTimestamp = result.timestamp || new Date().toISOString();
        writeToFirestore(payload, firestoreTimestamp);

        // Gold glitter if at least one event was accepted
        var anyAccepted = Object.values(rsvp).some(function (v) { return v === 'accepted'; });
        if (anyAccepted) launchGoldGlitter();

        // Show success
        rsvpSuccessEl.style.display = 'block';
        rsvpSuccessEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Switch to Update mode
        var newSubmitBtn = document.getElementById('submit-rsvp-btn');
        var newUpdateBtn = document.getElementById('update-rsvp-btn');
        newSubmitBtn.style.display = 'none';
        newUpdateBtn.style.display = 'inline-block';
        newUpdateBtn.textContent = 'Update RSVP';
        newUpdateBtn.disabled = false;
      } else {
        showToast('Something went wrong: ' + (result.error || 'Please try again.'));
        rsvpSaveBar.classList.remove('loading');
        activeBtn.textContent = originalLabel;
        activeBtn.disabled = false;
      }
    } catch (err) {
      console.error('Submit error:', err);
      showToast('Network error. Please check your connection and try again.');
      rsvpSaveBar.classList.remove('loading');
      activeBtn.textContent = originalLabel;
      activeBtn.disabled = false;
    }

    isSubmitting = false;
  }


  // ════════════════════════════════════════════════════════════
  //  GOLD GLITTER CELEBRATION
  // ════════════════════════════════════════════════════════════

  function launchGoldGlitter() {
    var canvas = document.createElement('canvas');
    canvas.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:9999'
    ].join(';');
    document.body.appendChild(canvas);

    var W = canvas.width  = window.innerWidth;
    var H = canvas.height = window.innerHeight;
    var ctx = canvas.getContext('2d');

    // Gold-themed palette
    var COLORS = [
      'rgba(201,169,110,1)',  // site gold
      'rgba(240,210,140,1)',  // light gold
      'rgba(255,235,180,1)',  // champagne
      'rgba(255,255,255,1)',  // white sparkle
      'rgba(230,190, 90,1)',  // deep gold
    ];

    var PARTICLE_COUNT = 180;
    var particles = [];

    for (var i = 0; i < PARTICLE_COUNT; i++) {
      // Spawn from top, spread across width
      var angle = (Math.random() * Math.PI) + Math.PI; // downward hemisphere
      var speed = 4 + Math.random() * 8;
      particles.push({
        x:    W * (0.2 + Math.random() * 0.6),   // spread across middle 60%
        y:    -10,
        vx:   Math.cos(angle) * speed * 1.4,
        vy:   Math.sin(angle) * speed - 6,        // initial upward kick
        size: 3 + Math.random() * 6,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3,
        shape: Math.random() < 0.5 ? 'rect' : 'circle',
        aspectRatio: 0.3 + Math.random() * 0.7,
        opacity: 1,
        gravity: 0.25 + Math.random() * 0.15,
        drag:   0.98 + Math.random() * 0.01,
      });
    }

    var startTime = null;
    var DURATION  = 3500; // ms

    function drawParticle(p) {
      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(
          -p.size * p.aspectRatio / 2, -p.size / 2,
           p.size * p.aspectRatio,      p.size
        );
      } else {
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size * p.aspectRatio / 2, p.size / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function animate(ts) {
      if (!startTime) startTime = ts;
      var elapsed = ts - startTime;
      var progress = elapsed / DURATION;

      ctx.clearRect(0, 0, W, H);

      particles.forEach(function (p) {
        p.vy       += p.gravity;
        p.vx       *= p.drag;
        p.vy       *= p.drag;
        p.x        += p.vx;
        p.y        += p.vy;
        p.rotation += p.rotSpeed;
        // Fade out in the last 40% of the animation
        p.opacity   = Math.max(0, 1 - Math.max(0, (progress - 0.6) / 0.4));
        drawParticle(p);
      });

      if (elapsed < DURATION) {
        requestAnimationFrame(animate);
      } else {
        canvas.remove();
      }
    }

    requestAnimationFrame(animate);
  }


  // ════════════════════════════════════════════════════════════
  //  HELPERS
  // ════════════════════════════════════════════════════════════

  // Shared badge-state logic: returns { cls, label } based on answered vs total events
  function getBadgeState(rsvp, totalEvents) {
    var rsvpEntries = Object.keys(rsvp || {});
    var answeredCount = rsvpEntries.length;
    var declinedCount = 0;
    rsvpEntries.forEach(function (k) {
      if (rsvp[k] === 'declined') declinedCount++;
    });

    if (answeredCount === 0) {
      return { cls: 'pending', label: 'RSVP Pending' };
    } else if (answeredCount < totalEvents) {
      return { cls: 'partial', label: 'Partially Responded' };
    } else if (declinedCount > 0) {
      return { cls: 'attending-some', label: 'Attending Some' };
    } else {
      return { cls: 'attending', label: 'Attending All' };
    }
  }

  // Re-render the roster card badge for a given member after save
  function updateRosterCard(member) {
    if (!currentPartyData) return;
    var key = memberKey(member);
    var card = partyRoster.querySelector('[data-member-key="' + key + '"]');
    if (!card) return;

    var totalEvents = member.events ? member.events.length : 0;
    var state = getBadgeState(member.rsvp, totalEvents);

    var badge = card.querySelector('.roster-badge');
    if (!badge) return;

    badge.className = 'roster-badge ' + state.cls;
    badge.textContent = state.label;
  }

  // Update the top badge on the individual schedule view
  function updateMemberBadge(member) {
    var totalEvents = member.events ? member.events.length : 0;
    var state = getBadgeState(member.rsvp, totalEvents);
    memberRsvpBadge.textContent = state.label;
    memberRsvpBadge.className = 'member-rsvp-badge ' + state.cls;
  }

  function showNameError(msg) {
    nameError.textContent = msg;
    nameError.style.display = 'block';
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function memberKey(member) {
    return (member.firstName + '_' + member.lastName).toLowerCase().replace(/\s+/g, '_');
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function showToast(message) {
    var existing = document.querySelector('.rsvp-toast');
    if (existing) existing.remove();

    var toast = document.createElement('div');
    toast.className = 'rsvp-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(function () { toast.classList.add('show'); });

    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { toast.remove(); }, 400);
    }, 4000);
  }

  // Clear saved password (browser console: clearScheduleSession())
  window.clearScheduleSession = function () {
    localStorage.removeItem(LS_PASSWORD_KEY);
    location.reload();
  };

  function hashString(str) {
    var hash = 5381;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  }

  function decrypt(base64text, key) {
    var text = atob(base64text);
    var result = '';
    for (var i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  }

});
