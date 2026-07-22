// ── Travel Map Location Data ───────────────────────────────────────
// Edit this file to add/remove/update pins on the Travel page map.
//
// Categories:
//   'venue'      → gold markers  — wedding event locations
//   'airport'    → blue markers  — airports / transit hubs
//   'restaurant' → rose markers  — favorite restaurants & spots
//   'hotel'      → green markers — accommodation (if separate from venue)

const TRAVEL_LOCATIONS = [

  // ── Wedding Venues ─────────────────────────────────────────────
  {
    id: 'washington-duke',
    category: 'venue',
    name: 'Washington Duke Inn & Golf Club',
    address: '3001 Cameron Blvd, Durham, NC 27705',
    lat: 36.0010,
    lng: -78.9274,
    note: 'Our primary venue for Wedding and Reception and the recommended hotel for the wedding weekend.',
    mapsUrl: 'https://maps.app.goo.gl/Z63vBuTvGSHRSrmQ8'
  },
  {
    id: 'brier-creek',
    category: 'venue',
    name: 'Brier Creek Country Club',
    address: '9400 Club Hill Dr, Raleigh, NC 27617',
    lat: 35.8963,
    lng: -78.7601,
    note: 'Sangeet Venue. Round-trip shuttle available to/from Washington Duke Inn.',
    mapsUrl: 'https://maps.app.goo.gl/6pFxXeqZ9exSPwhj9',
    eventKeys: ['Sangeet']   // Only shown if guest is invited to Sangeet
  },
  {
    id: 'gupta-home',
    category: 'venue',
    name: 'Gupta Home',
    address: '10809 Ashland Mill Ct, Raleigh, NC 27617',
    lat: 35.8788,
    lng: -78.7468,
    note: 'Haldi Venue. Host home for our traditional ceremonies throughout the weekend.',
    mapsUrl: 'https://maps.app.goo.gl/YyQiM6BrSnzfmkYj8',
    eventKeys: ['Haldi', 'Ganesh Puja', 'Satyanarayana Puja']   // Any of these grants access
  },

  // ── Airport ────────────────────────────────────────────────────
  {
    id: 'rdu',
    category: 'airport',
    name: 'RDU International Airport',
    address: '2400 W Terminal Blvd, Morrisville, NC 27560',
    lat: 35.8776,
    lng: -78.7875,
    note: 'The closest airport — about 30 min from Washington Duke Inn and 20 min from Brier Creek.',
    mapsUrl: 'https://maps.google.com/?q=Raleigh-Durham+International+Airport'
  },

  // ── Favorite Restaurants & Spots ──────────────────────────────
  // Add places that are special to you below. Copy and paste a block:
  //
  // {
  //   id: 'unique-id',          // lowercase, no spaces
  //   category: 'restaurant',
  //   name: 'Restaurant Name',
  //   address: 'Full street address',
  //   lat: 36.0000,             // decimal latitude
  //   lng: -78.9000,            // decimal longitude (negative for USA)
  //   note: 'Why this place is special to us.',
  //   mapsUrl: 'https://maps.google.com/?q=...'
  // },

];
