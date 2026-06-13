// Business knowledge for samarapix. This is the single source of truth the
// bot answers from. Edit freely — the more accurate and specific this is, the
// more Claude can answer confidently without escalating to you.
//
// Keep prices, packages, and policies here up to date. Anything NOT covered
// here, the bot is instructed to escalate rather than invent.

export const business = {
  name: "samarapix",
  trade: "Balloon decoration & event styling",
  // How the bot should sound.
  voice:
    "Warm, friendly, and professional. Use simple language. A tasteful emoji " +
    "now and then (🎈🎉) is fine. Never over-promise. Always invite the " +
    "customer to share their date, venue, and budget so we can help properly.",

  hours: "Mon–Sat, 10am–8pm IST. Closed Sundays.",
  serviceArea: "Bengaluru and surrounding areas (travel charges may apply outside city limits).",

  // Known offerings. Be specific — vague entries cause the bot to escalate.
  packages: [
    {
      name: "Birthday Basic",
      price: "₹3,500",
      includes: "Balloon arch (single colour theme) + 'Happy Birthday' foil letters. Setup at one location.",
    },
    {
      name: "Birthday Premium",
      price: "₹7,500",
      includes:
        "Balloon arch (multi-colour/organic), themed backdrop, foil numbers/letters, table balloons. Setup + teardown.",
    },
    {
      name: "Baby Shower / Welcome Baby",
      price: "from ₹6,000",
      includes: "Themed backdrop, organic balloon garland, props. Customised to colours you choose.",
    },
    {
      name: "Corporate / Store Launch",
      price: "Custom quote",
      includes: "Brand-colour balloon work, entrance arches, ribbon-cutting setup. Needs a site discussion.",
    },
  ],

  // Plain facts the bot may state directly.
  facts: [
    "We need at least 48 hours' notice for most bookings; rush jobs may be possible — ask.",
    "A 50% advance confirms the booking; balance is due on the event day.",
    "We bring everything — balloons, stands, backdrops, and do the setup.",
    "Colours and themes are fully customisable.",
    "We share photos of past work on request.",
  ],

  // Topics the bot must NOT handle on its own — always escalate these.
  alwaysEscalate: [
    "Custom quotes or any final price negotiation",
    "Complaints, refunds, or anything where the customer is unhappy",
    "Confirming/locking a specific date or taking payment",
    "Anything not clearly covered by the packages/facts above",
  ],
};
