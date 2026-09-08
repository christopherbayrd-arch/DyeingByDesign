// Links, handles, and facts about the business that show up in more than
// one place (header, footer, search engine data). Change them here once.

export const SITE_NAME = "Dyeing By Design";
export const SITE_SHORT = "DBD"; // the mark on the shirts; search engines learn it as the short name
export const SLOGAN = "One of a kind. By design.";

// Where the shop is based. Only town/state — no street address is published.
export const TOWN = "Brunswick";
export const STATE = "ME";
export const STATE_NAME = "Maine";
export const FOUNDED = "2026";

export const INSTAGRAM_URL = "https://www.instagram.com/dyeingbydesign?utm_source=qr";
export const INSTAGRAM_PROFILE = "https://www.instagram.com/dyeingbydesign"; // clean URL for search engines
export const INSTAGRAM_HANDLE = "@dyeingbydesign";

// Public address of the site, no trailing slash (www is the primary host).
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://www.dyeingbydesign.com"
).replace(/\/$/, "");
