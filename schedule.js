/* ============================================================
   WEDDING WEBSITE — schedule.js
   Handles: password validation, client-side decryption, event rendering
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  const stepPassword = document.getElementById('step-password');
  const stepName = document.getElementById('step-name');
  const stepSchedule = document.getElementById('step-schedule');

  const passwordForm = document.getElementById('password-form');
  const passwordInput = document.getElementById('password-input');
  const passwordError = document.getElementById('password-error');

  const nameForm = document.getElementById('name-form');
  const fnameInput = document.getElementById('fname-input');
  const lnameInput = document.getElementById('lname-input');
  const nameError = document.getElementById('name-error');

  const guestGreeting = document.getElementById('guest-greeting');
  const scheduleContainer = document.getElementById('schedule-container');
  const calendarBtn = document.getElementById('calendar-btn');
  let currentGuestEvents = []; // To store events for the ICS export

  // EVENTS dictionary is now loaded from media/events_data.js

  // Fixed password
  const CORRECT_PASSWORD = "pg2026";

  // ── LocalStorage Key ─────────────────────────────────────────
  const LS_PASSWORD_KEY = 'pg_pwd_verified';

  // ── Auto-restore session on page load ───────────────────────
  // If the password was already entered on this device, skip straight
  // to the name step. Each person still enters their own name.
  (function restoreSession() {
    if (localStorage.getItem(LS_PASSWORD_KEY) === 'true') {
      stepPassword.style.display = 'none';
      stepName.style.display     = 'block';
    }
  })();

  // ── Step 1: Password ────────────────────────────────────────
  passwordForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const inputPwd = passwordInput.value.trim().toLowerCase();
    if (inputPwd === CORRECT_PASSWORD) {
      localStorage.setItem(LS_PASSWORD_KEY, 'true'); // Remember password was entered
      passwordError.style.display = 'none';
      stepPassword.style.display = 'none';
      stepName.style.display = 'block';
    } else {
      passwordError.textContent = "Incorrect password. Please check your invitation.";
      passwordError.style.display = 'block';
    }
  });

  // ── Step 2: Name Lookup ─────────────────────────────────────
  nameForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const fname = fnameInput.value.trim().toLowerCase();
    const lname = lnameInput.value.trim().toLowerCase();

    if (!fname || !lname) {
      showNameError("Please enter both First and Last Name.");
      return;
    }

    if (typeof GUEST_DATA_SECURE === 'undefined') {
      showNameError("Guest data is not loaded yet.");
      return;
    }

    // Hash name to find the encrypted data
    const normalizedName = fname + " " + lname;
    const nameHash = hashString(normalizedName);
    const encryptedTags = GUEST_DATA_SECURE[nameHash];

    if (encryptedTags) {
      nameError.style.display = 'none';
      const key = normalizedName + CORRECT_PASSWORD;
      const decryptedStr = decrypt(encryptedTags, key);
      
      let realFirstName = fname;
      let tagsStr = decryptedStr;
      
      if (decryptedStr.includes('|')) {
        const parts = decryptedStr.split('|');
        realFirstName = parts[0];
        tagsStr = parts.slice(1).join('|');
      }
      
      renderSchedule(realFirstName, tagsStr);
      stepName.style.display = 'none';
      stepSchedule.style.display = 'block';
    } else {
      showNameError("That name doesn't exist.");
    }
  });

  // ── Step 3: Calendar Export ───────────────────────────────────
  calendarBtn.addEventListener('click', function () {
    if (currentGuestEvents.length === 0) return;

    let ics = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Priya and Gautam Wedding//EN\n";

    currentGuestEvents.forEach(e => {
      ics += "BEGIN:VEVENT\n";
      ics += `UID:${Math.random().toString(36).substring(2)}@priyaandgautam.com\n`;
      ics += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n`;
      ics += `DTSTART:${e.icsStart}\n`;
      ics += `DTEND:${e.icsEnd}\n`;
      ics += `SUMMARY:${e.name} - Priya & Gautam's Wedding\n`;
      ics += `LOCATION:${e.address}\n`;
      const icsDescText = e.description ? e.description.join('\\n') : '';
      ics += `DESCRIPTION:${icsDescText}\\n\\nMap: ${e.mapLink}\\nTime: ${e.time}\n`;
      ics += "END:VEVENT\n";
    });

    ics += "END:VCALENDAR";

    // Download the file
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "Priya_Gautam_Wedding.ics";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  });


  // ── Helpers ─────────────────────────────────────────────────

  function showNameError(msg) {
    nameError.textContent = msg;
    nameError.style.display = 'block';
  }

  // Clear saved password (call from browser console to reset: clearScheduleSession())
  window.clearScheduleSession = function () {
    localStorage.removeItem(LS_PASSWORD_KEY);
    location.reload();
  };

  // DJB2 Hash for key lookup
  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  }

  // Decrypt XOR + Base64
  function decrypt(base64text, key) {
    const text = atob(base64text);
    let result = "";
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
  }

  function renderSchedule(firstName, tagsStr) {
    // Format greeting
    const formattedName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    guestGreeting.textContent = `Welcome, ${formattedName}!`;

    scheduleContainer.innerHTML = ''; // clear

    const tags = tagsStr.split(',').map(t => t.trim());

    let eventsFound = 0;

    currentGuestEvents = []; // Reset for this guest

    for (const [tagKey, eventDetails] of Object.entries(EVENTS)) {
      if (tags.includes(tagKey)) {
        eventsFound++;
        currentGuestEvents.push(eventDetails);

        // Generate individual calendar links
        const icsDescText = eventDetails.description ? eventDetails.description.join('\\n') : '';
        const evtName = encodeURIComponent(eventDetails.name + " - Priya & Gautam's Wedding");
        const evtDesc = encodeURIComponent(`${icsDescText}\\n\\nMap: ${eventDetails.mapLink}\\nTime: ${eventDetails.time}`);
        const evtLoc = encodeURIComponent(eventDetails.address);

        const googleLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${evtName}&dates=${eventDetails.icsStart}/${eventDetails.icsEnd}&details=${evtDesc}&location=${evtLoc}`;
        const outlookLink = `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${evtName}&startdt=${eventDetails.icsStart}&enddt=${eventDetails.icsEnd}&body=${evtDesc}&location=${evtLoc}`;

        const singleIcs = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nDTSTART:${eventDetails.icsStart}\nDTEND:${eventDetails.icsEnd}\nSUMMARY:${eventDetails.name} - Priya & Gautam's Wedding\nLOCATION:${eventDetails.address}\nDESCRIPTION:${icsDescText}\\n\\nMap: ${eventDetails.mapLink}\\nTime: ${eventDetails.time}\nEND:VEVENT\nEND:VCALENDAR`;
        const appleLink = `data:text/calendar;charset=utf8,${encodeURIComponent(singleIcs)}`;

        const card = document.createElement('div');
        card.className = 'schedule-card';

        // Add description paragraphs
        const descHtml = eventDetails.description ? `<div class="schedule-description">${eventDetails.description.map(d => `<p>${d}</p>`).join('')}</div>` : '';

        card.innerHTML = `
          <div class="schedule-date">${eventDetails.date} &nbsp;|&nbsp; ${eventDetails.time}</div>
          <div class="schedule-content">
            <h3>${eventDetails.name}</h3>
            ${descHtml}
            <p class="schedule-location">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
              <strong>${eventDetails.location}</strong>
            </p>
            <a href="${eventDetails.mapLink}" class="schedule-address-link" target="_blank" rel="noopener noreferrer">
              ${eventDetails.address}
            </a>
            
            <div class="event-calendar-links">
              <span>Add to:</span>
              <a href="${googleLink}" target="_blank" rel="noopener noreferrer">Google</a>
              <a href="${outlookLink}" target="_blank" rel="noopener noreferrer">Outlook</a>
              <a href="${appleLink}" download="${eventDetails.name.replace(/\s+/g, '_')}.ics">Apple / ICS</a>
            </div>
          </div>
        `;
        scheduleContainer.appendChild(card);
      }
    }

    if (eventsFound === 0) {
      scheduleContainer.innerHTML = `<p class="no-events-msg">No events found for your name. Please contact Priya or Gautam.</p>`;
    }
  }
});
