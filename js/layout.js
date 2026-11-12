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
  side: { x: 2440, w: 430, y: 530, h: 640, zone: { x: 2410, y: -810, w: 502, h: 2400 } },
  top: { x: 0, w: 2912, y: -400, zone: { x: 0, y: -810, w: 2912, h: 870 } },
};

// Objects: photographed cut-outs. x = centre, base = where they stand, w/h = size (image px).
// Sizes follow real-world scale against the books (tallest spine ~152px ≈ 24cm, so ~6px per cm).
// base = the line the object stands on: the arch shelf top is at y≈497 (its front edge runs to 521);
// the floor in front of the plinth starts at y≈1446. zone sets the light it receives.
// foot: fraction of the image height where the object actually rests (anything below hangs over, like a ribbon).
// squash: flattens objects photographed from higher up to the room camera's low view of the floor.
export const OBJECTS = {
  lamp: { id: "lamp", x: 1418, base: 499, w: 148, h: 175, zone: "lamp" },
  glasses: { id: "glasses", x: 735, base: 499, w: 62, h: 132, zone: "arch-left" },
  hourglass: { id: "hourglass", x: 850, base: 499, w: 52, h: 99, zone: "arch-left" },
  book: { id: "book", x: 2045, base: 499, w: 175, h: 52, foot: 0.744, zone: "arch-right" },
  pen: { id: "pen", x: 2170, base: 501, w: 86, h: 23, zone: "arch-right" },
  deck: { id: "deck", x: 690, base: 1488, w: 84, h: 57, foot: 0.906, squash: 0.5, reflect: true, zone: "floor" },
  plane: { id: "plane", x: 2335, base: 1494, w: 132, h: 73, foot: 0.918, squash: 0.72, reflect: true, zone: "floor" },
  plant: { id: "plant", bay: "Self-Help", inset: 66, w: 112, h: 120, zone: "shelf" },
};
