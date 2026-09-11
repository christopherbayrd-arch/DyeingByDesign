// ============================================================
//  "Recent work" gallery on the homepage.
//
//  To add a shot: drop a JPG in public/images/recent/ and add a
//  line here. Portrait (3:4) photos look best. Keep it to 8–10;
//  the newest goes at the top. Set `wide: true` on one shot to
//  let it span two columns on desktop. The grid is 4 across on
//  desktop, so one wide tile (4 cells) + 8 singles fills 3 rows
//  exactly — add or remove in pairs to keep it tidy.
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
    src: "/images/recent/cedar-royal.jpg",
    alt: "A royal blue tee with cedar sprigs bleached across it, laid on a tile floor",
    title: "Cedar on royal blue",
    note: "The new design. Blue burns pale; every sprig stays blue.",
  },
  {
    src: "/images/recent/cedar-azalea.jpg",
    alt: "An azalea pink tee with cedar sprigs bleached across it, laid on a tile floor",
    title: "Cedar on azalea",
    note: "Azalea burns nearly white, so the sprigs pop bright pink.",
  },
  {
    src: "/images/recent/sumac-cherry.jpg",
    alt: "An antique cherry red tee with sumac fronds bleached across the front, laid on gravel",
    title: "Sumac on antique cherry red",
    note: "Fronds fanned from the shoulders. The red burns to pink.",
  },
  {
    src: "/images/recent/sumac-forest.jpg",
    alt: "A forest green tee with sumac fronds bleached across it, laid on gravel",
    title: "Sumac on forest green",
    note: "Deep green holds its ground; the spray goes stone.",
  },
  {
    src: "/images/recent/sumac-electric.jpg",
    alt: "An electric green tee with sumac fronds bleached across it, laid on gravel",
    title: "Sumac on electric green",
    note: "Brightest blank in the lineup. Burns nearly white.",
  },
  {
    src: "/images/recent/fern-flat.jpg",
    alt: "A black tee bleached with fern fronds, laid flat on a weathered deck",
    title: "Fern on black",
    note: "Fronds laid corner to corner, one pass of spray.",
  },
  {
    src: "/images/recent/sumac-flat.jpg",
    alt: "A bleached shirt with a single tall staghorn sumac frond down the center",
    title: "Sumac on black, heavy burn",
    note: "One frond, chest to hem. Speckle from the mist.",
  },
  {
    src: "/images/recent/gathering-sumac.jpg",
    alt: "Corey holding two staghorn sumac fronds in front of summer woods",
    title: "Gathering day",
    note: "Sumac fronds off the back road, picked flat and fresh.",
  },
];
