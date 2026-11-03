/**
 * The picture beside the home page title. Swap `src`, `alt`, `width` and `height` here to use a community
 * photo instead of the building artwork; nothing else needs to change.
 */
export const HOME_HERO_IMAGE = {
  // A 1600 px WebP made from the 3500 px original (public/assets/Ghmo-building.png, kept for print/editing):
  // the hero is never shown wider than about 1100 px, so the original's 4 MB would only slow the first paint.
  src: "/assets/ghmo-building.webp",
  alt: "Artwork of the planned GHMO Gumba building, with children in traditional Magar dress dancing and planting flowers outside",
  width: 1600,
  height: 1067
} as const;
