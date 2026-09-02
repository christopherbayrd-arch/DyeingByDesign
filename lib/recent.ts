// ============================================================
//  "Recent work" gallery on the homepage.
//
//  To add a shot: drop a JPG in public/images/recent/ and add a
//  line here. Portrait (3:4) photos look best. Keep it to 5–8;
//  the newest goes at the top. Set `wide: true` on one shot to
//  let it span two columns on desktop.
// ============================================================

export type RecentShot = {
  src: string;
  alt: string;
  title: string;    // short label on the card
  note?: string;    // one line under the title
  wide?: boolean;
};

export const RECENT: RecentShot[] = [
  {
    src: "/images/recent/fern-worn.jpg",
    alt: "Corey wearing a fern bleach shirt on a deck in the Maine woods",
    title: "Fern, out in the world",
    note: "Ostrich fern fronds, front and sleeves. Washed and worn.",
    wide: true,
  },
  {
    src: "/images/recent/fern-flat.jpg",
    alt: "A black tee bleached with fern fronds, laid flat on a weathered deck",
    title: "Fern, fresh off the line",
    note: "Fronds laid corner to corner, one pass of spray.",
  },
  {
    src: "/images/recent/sumac-flat.jpg",
    alt: "A bleached shirt with a single tall staghorn sumac frond down the center",
    title: "Sumac, heavy burn",
    note: "One frond, chest to hem. Speckle from the mist.",
  },
  {
    src: "/images/recent/broadleaf-flat.jpg",
    alt: "A bleached shirt scattered with broad, dark leaf shadows",
    title: "Broadleaf scatter",
    note: "Big lobes, dropped like they fell there.",
  },
  {
    src: "/images/recent/gathering-sumac.jpg",
    alt: "Corey holding two staghorn sumac fronds in front of summer woods",
    title: "Gathering day",
    note: "Sumac fronds off the back road, picked flat and fresh.",
  },
];
