/* ============================================================
   LIVE SCHEDULE DATA — Sangeet + Wedding Day
   ------------------------------------------------------------
   This is the ONE file to edit for the live pages
   (/sangeet and /wedding) and it is also read by the chatbot.

   Times are written in Eastern Time with the offset (-05:00).
   Nov 20–21 2026 are on EST, so always use -05:00.

   Item fields
     id        unique, lowercase — used by the live-admin delay tool
     start     when the item goes LIVE
     end       (optional) shown to guests, e.g. "7:30 – 8:30 AM"
     liveUntil (optional) internal only: how long the LAST item of a
               block stays "live" — never shown, so nobody is told
               when they have to leave
     time      (optional) override the displayed time label
     title     headline
     details   bullet lines
     acts      (optional) performance lineup (Sangeet program)
   ============================================================ */

(function (root) {
  'use strict';

  var LIVE_SCHEDULE = {

    // ─────────────────────────────────────────────────────────
    sangeet: {
      key: 'sangeet',
      name: 'Sangeet',
      date: 'Friday, November 20, 2026',
      venue: 'Brier Creek Country Club',
      address: '9400 Club Hill Dr, Raleigh, NC 27617',
      mapLink: 'https://maps.app.goo.gl/6pFxXeqZ9exSPwhj9',
      attire: 'Indian Festive or Cocktail Glam',
      blocks: [
        {
          id: 'sangeet',
          label: 'Sangeet',
          items: [
            {
              id: 'welcome',
              start: '2026-11-20T17:45:00-05:00',
              title: 'Welcome & Dinner',
              details: [
                'Event begins — main food stations and bar open',
                'Henna artists available'
              ]
            },
            {
              id: 'program',
              start: '2026-11-20T19:30:00-05:00',
              title: 'Sangeet Program',
              details: ['Grab a seat — the performances are starting!'],
              acts: [
                { who: 'Sister of the Groom', name: 'Puja' },
                { who: 'Mother of the Bride', name: 'Jyotsna & her friends' },
                { who: 'Father of the Bride', name: 'Pratik & his friends + the groom, Gautam' },
                { who: 'Mother of the Bride', name: 'Jyotsna & her friends — Part 2' },
                { who: 'Aunt of the Bride', name: 'Preeti Gupta' },
                { who: 'Cousins of the Bride', name: 'Prashant & Kritika' },
                { who: 'Cousins & Family of the Groom', name: '' },
                { who: 'Nieces & Nephews of the Groom', name: '' },
                { who: 'Childhood Friends of the Bride', name: '' },
                { who: 'Surprise Dance for the Groom', name: '' },
                { who: 'Priya & Gautam’s Friends from Northwestern Kellogg', name: '' }
              ]
            },
            {
              id: 'dance',
              start: '2026-11-20T20:15:00-05:00',
              time: '8:15 – 8:30 PM',
              title: 'Dance Floor Opens',
              details: [
                'Sangeet program concludes',
                'Dessert & additional food stations open'
              ]
            },
            {
              id: 'chaat-close',
              start: '2026-11-20T21:00:00-05:00',
              title: 'Chaat Stations Close',
              details: ['Indoor chaat stations close — the dance floor keeps going!']
            },
            {
              id: 'last-call',
              start: '2026-11-20T22:30:00-05:00',
              title: 'Last Call',
              details: ['Bar and all food stations close, except biryani & naan']
            },
            {
              id: 'wrap',
              start: '2026-11-20T22:45:00-05:00',
              liveUntil: '2026-11-20T23:15:00-05:00',
              title: 'Event Wrap-Up',
              details: ['Thank you for celebrating with us! Shuttles return to the Washington Duke Inn.']
            }
          ]
        }
      ],

      // ── "Now Showing" food stations ─────────────────────────
      // theme → poster look (see .poster--<theme> in assets/css/live.css)
      stations: [
        { id: 'chole',     title: 'G.P.’s Chole Bhatura',                       tagline: 'A family classic.',                          theme: 'retro',   open: '2026-11-20T17:45:00-05:00', close: '2026-11-20T22:00:00-05:00' },
        { id: 'guac',      title: 'The Guacfather',                              tagline: 'An offer you can’t refuse.',                 theme: 'noir',    open: '2026-11-20T17:45:00-05:00', close: '2026-11-20T22:00:00-05:00' },
        { id: 'coco',      title: 'Coco for Quesadillas',                        tagline: 'Remember me… and my quesadillas.',          theme: 'fiesta',  open: '2026-11-20T17:45:00-05:00', close: '2026-11-20T22:00:00-05:00' },
        { id: 'tandoor',   title: 'Avengers TanDoorsDay',                        tagline: 'Whatever it takes. Straight from the tandoor.', theme: 'hero', open: '2026-11-20T17:45:00-05:00', close: '2026-11-20T22:00:00-05:00' },
        { id: 'chaat',     title: 'Chaat De! India',                             tagline: 'Seventy minutes. Unlimited chaat.',         theme: 'sport',   open: '2026-11-20T17:45:00-05:00', close: '2026-11-20T21:00:00-05:00' },
        { id: 'paani',     title: '3 Paani',                                     tagline: 'All is well. All is paani.',                theme: 'campus',  open: '2026-11-20T17:45:00-05:00', close: '2026-11-20T21:00:00-05:00' },
        { id: 'butterbeer',title: 'Priya Gupta and the Goblet of Butter Beer',   tagline: 'Accio, butter beer!',                       theme: 'wizard',  open: '2026-11-20T18:30:00-05:00', close: '2026-11-20T22:00:00-05:00' },
        { id: 'biryani',   title: 'Biryani',                                     tagline: 'The late-night premiere.',                  theme: 'epic',    open: '2026-11-20T20:30:00-05:00', close: '2026-11-20T22:30:00-05:00' },
        { id: 'jalebi',    title: 'Jalebi We Met',                               tagline: 'Sweet things happen when you least expect them.', theme: 'romance', open: '2026-11-20T20:30:00-05:00', close: '2026-11-20T22:30:00-05:00' }
      ]
    },

    // ─────────────────────────────────────────────────────────
    wedding: {
      key: 'wedding',
      name: 'Wedding Day',
      date: 'Saturday, November 21, 2026',
      venue: 'Washington Duke Inn & Golf Club',
      address: '3001 Cameron Blvd, Durham, NC 27705',
      mapLink: 'https://maps.app.goo.gl/Z63vBuTvGSHRSrmQ8',
      attire: 'Western or Indian Formal — please avoid wearing pink to the wedding ceremony',
      blocks: [
        {
          id: 'ceremony',
          label: 'Wedding',
          items: [
            {
              id: 'breakfast',
              start: '2026-11-21T07:30:00-05:00',
              end: '2026-11-21T08:30:00-05:00',
              title: 'Grab & Go Breakfast',
              details: ['Breakfast & beverages available in the Hospitality Room']
            },
            {
              id: 'baraat',
              start: '2026-11-21T08:45:00-05:00',
              title: 'Baraat Begins',
              details: [
                'The groom’s procession — come dance him in!',
                'Post-baraat snack and drink served'
              ]
            },
            {
              id: 'baraat-welcome',
              start: '2026-11-21T09:30:00-05:00',
              title: 'Baraat Welcome & Guests Seated',
              details: ['Please make your way to your seats']
            },
            {
              id: 'ceremony',
              start: '2026-11-21T09:45:00-05:00',
              title: 'Wedding Ceremony Begins',
              details: ['Hospitality room refreshments indoors will remain open']
            },
            {
              id: 'lunch',
              start: '2026-11-21T12:00:00-05:00',
              liveUntil: '2026-11-21T14:00:00-05:00',
              title: 'Lunch is Served',
              details: ['The wedding concludes — please join us for lunch']
            }
          ]
        },
        {
          id: 'reception',
          label: 'Cocktail Hour & Reception',
          items: [
            {
              id: 'cocktail',
              start: '2026-11-21T18:00:00-05:00',
              title: 'Cocktail Hour Begins',
              details: ['Drinks & appetizers']
            },
            {
              id: 'reception-program',
              start: '2026-11-21T19:30:00-05:00',
              title: 'Reception Program Begins',
              details: ['Please find your table — search your name below']
            },
            {
              id: 'dinner',
              start: '2026-11-21T20:30:00-05:00',
              title: 'Dinner Begins',
              details: []
            },
            {
              id: 'dancing',
              start: '2026-11-21T21:15:00-05:00',
              liveUntil: '2026-11-21T23:45:00-05:00',
              title: 'Dancing Begins!',
              details: ['Hit the dance floor!']
            }
          ]
        }
      ]
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = LIVE_SCHEDULE;
  else root.LIVE_SCHEDULE = LIVE_SCHEDULE;
})(this);
