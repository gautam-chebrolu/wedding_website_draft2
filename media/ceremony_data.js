/* Organizer-approved program. All times are November 21, 2026, Eastern (EST).
   Descriptions follow the couple's program; background notes explain traditions,
   which vary by family. Source URLs document background, not this event's timing. */
(function (root) {
  'use strict';
  var sources = {
    haf: { title: 'Hindu American Foundation — Hindu wedding primer', url: 'https://www.hinduamerican.org/hindu-wedding-primer/' },
    academy: { title: 'Himalayan Academy — Hindu Wedding', url: 'https://www.himalayanacademy.com/media/books/hindu-wedding_ei/web/toc.html' },
    telugu: { title: 'Taara Weddings — Telugu wedding rituals', url: 'https://taaraweddings.com/resources/telugu-wedding-rituals' },
    aarti: { title: 'BAPS — Arti, the ceremony of light', url: 'https://londonmandir.baps.org/worship/arti-the-hindu-ceremony-of-light/' },
    baps: { title: 'BAPS — The marriage ceremony', url: 'https://www.baps.org/Article/2011/The-Sixteen-Samskaras-Part-3-2256.aspx' }
  };
  function item(id, start, end, title, duration, description, meaning, refs) {
    return { id: id, start: '2026-11-21T' + start + ':00-05:00', end: '2026-11-21T' + end + ':00-05:00',
      title: title, duration: duration, description: description, meaning: meaning, sources: refs || [],
      details: [description] };
  }
  var program = {
    date: 'Saturday, November 21, 2026', timeZone: 'America/New_York',
    venue: 'Washington Duke Inn & Golf Club', address: '3001 Cameron Blvd, Durham, NC 27705',
    mapLink: 'https://maps.app.goo.gl/Z63vBuTvGSHRSrmQ8', sources: sources,
    items: [
      item('baraat-welcome', '09:30', '09:40', 'Baraat Welcome', '10 minutes',
        'The bride’s family welcomes the groom, his family, and guests as the festive procession arrives.',
        'The welcome brings the two families together before the rites at the mandap, the wedding canopy.', ['haf']),
      item('mandap-entrance', '09:40', '09:55', 'Family & Groom Entrance to Mandap', '15 minutes',
        'The family and groom enter the mandap for the wedding ceremony.',
        'The mandap is the ceremonial canopy where the couple and their families gather with the priest.', ['haf']),
      item('ganesh-puja', '10:00', '10:20', 'Ganesh Puja', '20 minutes',
        'During the wedding ceremony, a prayer to Lord Ganesha seeks blessings, removes obstacles, and invites an auspicious beginning.',
        'During the wedding ceremony, Ganesha is invoked as the remover of obstacles at the beginning of a new undertaking.', ['academy']),
      item('kanya-aagaman', '10:20', '10:25', 'Kanya Aagaman', '5 minutes',
        'Priya makes her entrance, escorted by her parents.',
        'Kanya Aagaman is the bride’s arrival at the mandap; escorts and entrance customs differ among families.', ['haf']),
      item('mangalashtak-varmala', '10:30', '10:37', 'Mangalashtak & Varmala', '7 minutes',
        'Sacred verses are chanted, followed by the exchange of floral garlands, symbolizing mutual acceptance and respect.',
        'Mangalashtak refers to auspicious verses. Varmala, also called Jaimala, is the exchange of garlands.', ['haf']),
      item('kanyadaan', '10:37', '10:52', 'Kanyadaan', '15 minutes',
        'Priya’s parents give her hand in marriage to Gautam, entrusting her to him.',
        'Traditionally described as the giving of the bride’s hand, this rite expresses the parents’ blessing of the marriage. Families interpret and adapt its symbolism differently.', ['baps']),
      item('jeelakarra-bellam', '10:52', '10:53', 'Jeelakarra Bellam', '1 minute',
        'At the auspicious moment, the couple places a paste of cumin and jaggery on each other’s heads, signifying an inseparable union.',
        'In this Telugu tradition, cumin and jaggery symbolize staying together through life’s contrasting experiences. Muhurtham means an auspicious time selected for a rite.', ['telugu']),
      item('mangalya-dharanam', '10:53', '11:03', 'Mangalya Dharanam', '10 minutes',
        'Gautam ties the sacred Mangalsutra necklace around Priya’s neck, formalizing their lifelong bond.',
        'Mangalsutra or mangalyam is a marriage necklace. Its design and the way it is tied vary by community.', ['baps']),
      item('talambralu', '11:03', '11:13', 'Talambralu', '10 minutes',
        'The couple showers each other with colored rice, symbolizing happiness, health, and prosperity.',
        'This joyful Telugu rice-showering custom combines blessings of abundance with playful celebration.', ['telugu']),
      item('ring-game', '11:13', '11:23', 'Ring Game', '10 minutes',
        'The couple searches for a ring submerged in a vessel of water in a playful contest.',
        'In the couple’s program, the game lightheartedly predicts who will lead the way in marriage. It brings laughter and gives the couple a chance to celebrate together.'),
      item('hasta-milaap', '11:23', '11:26', 'Hasta Milaap', '2–3 minutes',
        'The couple’s hands are tied together to symbolize the union of their hearts, minds, and souls.',
        'Joining hands expresses partnership. Ghat Bandhan, during the following fire rites, joins the couple’s garments.', ['haf']),
      item('vivah-homam', '11:26', '11:46', 'Vivah Homam', '20 minutes',
        'Ghat Bandhan, Phera & Saptapadi: the sacred fire is invoked, the couple’s scarves are tied, and they circle the fire and take seven steps together.',
        'Agni, the sacred fire, witnesses the vows. Phera means circling the fire; Saptapadi means seven steps. They are related rites, not necessarily seven circles. The seven steps express commitments for a shared life; wording and the number of rounds vary.', ['academy']),
      item('mettelu', '11:46', '11:48', 'Mettelu · Toe Rings', '1–2 minutes',
        'Gautam places silver toe rings on Priya’s feet as a symbol of her married status.',
        'Toe rings are a visible marriage symbol in several South Indian traditions.', ['academy']),
      item('sindhoor', '11:48', '11:50', 'Sindhoor', '1–2 minutes',
        'Gautam applies vermilion powder to Priya’s hair parting as a mark of devotion and commitment.',
        'Also spelled sindoor or sindur, this red powder is a traditional sign of marriage in many Hindu communities.', ['baps']),
      item('aarti', '11:50', '11:55', 'Aarti', '5 minutes',
        'A sacred flame ceremony invokes blessings, peace, and divine light upon the newlyweds.',
        'Aarti offers light in devotion and thanksgiving. The flame commonly represents illumination and the removal of spiritual darkness.', ['aarti']),
      item('aashirvad', '11:55', '12:05', 'Aashirvad & Recessional', 'About 10 minutes',
        'Elders and guests bless the newlyweds with flowers and heartfelt wishes as they exit.',
        'Aashirvad means blessings. The community offers good wishes as the couple begins married life.', ['baps'])
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = program;
  else root.CEREMONY_PROGRAM = program;
})(this);
