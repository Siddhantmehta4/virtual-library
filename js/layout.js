// Geometry of the room photo (assets/room.jpg), measured in image pixels.
export const IMG = { w: 2912, h: 1632, src: "assets/room.jpg" };

// Where the camera sits in the photo (used for perspective on the books).
export const EYE = { x: 1456, y: 816 };
export const PERSPECTIVE = 3600;

// The bookcase itself, including frame and arches. Keeps it on screen on small displays.
// Frames the case with the front edge of the rug, not the whole rug.
export const CASE = { x0: 470, x1: 2410, y0: 70, y1: 1440, floor: 1525 };

// Inner edges of the three bay columns.
const COLS = [
  { x: 556, w: 474 },
  { x: 1098, w: 664 },
  { x: 1836, w: 490 },
];

// Each row: top = underside of the shelf above, base = where books stand,
// board = vertical center of the shelf's front edge (for the brass plate).
const ROWS = [
  { top: 524, base: 724, board: 728, lit: true },
  { top: 746, base: 937, board: 941, lit: true },
  { top: 960, base: 1150, board: 1155, lit: true },
  { top: 1182, base: 1382, board: 1418, lit: true },
];

// Genre for each bay, row by row, left to right.
export const BAY_GENRES = [
  ["Philosophy", "Fiction", "History"],
  ["Self-Help", "Non-Fiction", "Biography"],
  ["Art & Creativity", "Sci-Fi", "Religion"],
  ["Comedy", "Finance", "Recommended"],
];

// Book scale: unscaled book px -> image px. Tallest book (254) is ~152px in the photo.
export const BOOK_K = 0.6;

export const BAYS = BAY_GENRES.flatMap((genres, r) =>
  genres.map((genre, c) => ({
    genre,
    reserve: genre === "Self-Help" ? 120 : 0,
    row: r,
    col: c,
    lit: ROWS[r].lit,
    x: COLS[c].x,
    w: COLS[c].w,
    top: ROWS[r].top,
    base: ROWS[r].base,
    board: ROWS[r].board,
  })),
);

// Spelling variations that should land in the right bay.
export const GENRE_ALIASES = {
  "nonfiction": "Non-Fiction",
  "non fiction": "Non-Fiction",
  "philosphy": "Philosophy",
  "self help": "Self-Help",
  "selfhelp": "Self-Help",
  "science fiction": "Sci-Fi",
  "scifi": "Sci-Fi",
  "art and creativity": "Art & Creativity",
  "art & creativity": "Art & Creativity",
};

// The title on the wall: down the right-hand wall on landscape screens, above the case on phones.
export const TITLE = {
  side: { x: 2440, w: 430, y: 440, h: 700, zone: { x: 2410, y: -810, w: 502, h: 2400 } },
  top: { x: 0, w: 2912, y: -400, zone: { x: 0, y: -810, w: 2912, h: 870 } },
};

// Objects: photographed cut-outs. x = centre, base = where they stand, w/h = size (image px).
// Sizes follow real-world scale against the books (tallest spine ~152px ≈ 24cm, so ~6px per cm).
// base = the line the object stands on: the arch shelf top is at y≈497 (its front edge runs to 521);
// the floor in front of the plinth starts at y≈1446. zone sets the light it receives.
// foot: fraction of the image height where the object actually rests (anything below hangs over, like a ribbon).
// squash: flattens objects photographed from higher up to the room camera's low view of the floor.
// Arch objects sit back on the shelf: the shelf top is above the camera, so their bases are hidden
// behind the board's front edge (shelf line y≈495). sink = how far below that line the base really is.
export const OBJECTS = {
  // left arch: holder a little left of centre and forward, hourglass set further back and turned slightly
  glasses: { id: "glasses", img: "glasses-lit", x: 712, base: 495, sink: 8, w: 103, h: 133, zone: "arch-left" },
  hourglass: { id: "hourglass", img: "hourglass-lit", x: 866, base: 495, sink: 15, w: 69, h: 131, rot: 2, zone: "arch-left" },
  // centre arch: lamp a touch off-centre, as if pushed aside
  lamp: { id: "lamp", x: 1392, base: 495, sink: 10, w: 172, h: 204, zone: "lamp" },
  // right arch: the pen dropped beside the reading pile at a casual angle
  // right arch: the pen dropped beside the reading pile at a casual angle
  // the current read on top of a short pile of books (built from the library itself)
  stack: { x: 2018, base: 495, sink: 9 },
  // centre arch: the cream typewriter, then two small framed photographs leaning on the back panel
  frame1: { id: "frame1", img: "frame-photo-1b", photo: "assets/photos/photo-1.jpg", x: 1472, base: 495, sink: 3, w: 115, h: 115, zone: "arch-right" },
  frame2: { id: "frame2", img: "frame-photo-2c", photo: "assets/photos/photo-2b.jpg", x: 1606, base: 495, sink: 3, w: 127, h: 113, zone: "arch-right" },
  typewriter: { id: "typewriter", img: "arch-typewriter", x: 1268, base: 495, sink: 2, w: 193, h: 103, zone: "arch-right" },
  // right arch: the record player, and the sleeves leaning on the arch's right wall
  speaker: { id: "speaker", img: "arch-player", x: 1972, base: 495, sink: 3, w: 165, h: 152, zone: "arch-right" },
  sleeves: { id: "sleeves", img: "arch-sleeves", x: 2226, base: 495, sink: 3, w: 203, h: 140, zone: "arch-right" },
  pen: { id: "pen", img: "pen-flat", x: 2178, base: 495, sink: 5, w: 104, h: 28, rot: -5, zone: "arch-right" },
  // on the floor against the left wall: a Les Paul on its stand, its right edge catching the shelves' glow
  guitar: { id: "guitar", img: "guitar-flame", x: 262, base: 1500, w: 236, h: 625, foot: 0.985, zone: "floor" },
  deck: { id: "deck", img: "deck-full", x: 576, base: 1512, w: 128, h: 102, foot: 0.97, squash: 0.62, reflect: true, zone: "floor" },
  plane: { id: "plane", x: 2275, base: 1484, w: 128, h: 46, foot: 0.98, squash: 0.85, reflect: true, zone: "floor" },
  plant: { id: "plant", bay: "Self-Help", inset: 66, w: 112, h: 120, zone: "shelf" },
  // the note propped in the Recommended bay, tied by a string to the plane
  // pinned to the front of the plinth at the bottom-right, half hanging over its lower edge
  // flat sticky note, tacked to the middle of the case's right-hand upright: half over the bay, half over the wall
  card: { x: 2362, top: 1240, w: 76, h: 76 },
};
