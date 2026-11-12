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
    reserve: genre === "Self-Help" ? 150 : 0,
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
  side: { x: 2440, w: 430, y: 640, h: 600, zone: { x: 2410, y: -810, w: 502, h: 2400 } },
  top: { x: 0, w: 2912, y: -400, zone: { x: 0, y: -810, w: 2912, h: 870 } },
};

// Objects: photographed cut-outs. x = centre, base = where they stand, w/h = size (image px).
export const OBJECTS = {
  lamp: { id: "lamp", x: 1430, base: 510, w: 240, h: 284 },
  glasses: { id: "glasses", x: 715, base: 510, w: 112, h: 240 },
  hourglass: { id: "hourglass", x: 905, base: 510, w: 100, h: 189 },
  book: { id: "book", x: 2030, base: 513, w: 360, h: 108 },
  pen: { id: "pen", x: 2240, base: 516, w: 160, h: 42 },
  deck: { id: "deck", x: 655, base: 1512, w: 124, h: 85 },
  plane: { id: "plane", x: 2300, base: 1522, w: 176, h: 97 },
  plant: { id: "plant", bay: "Self-Help", inset: 82, w: 150, h: 160 },
};
