// Geometry of the room photo (assets/room.jpg), measured in image pixels.
export const IMG = { w: 2912, h: 1632, src: "assets/room.jpg" };

// Where the camera sits in the photo (used for perspective on the books).
export const EYE = { x: 1456, y: 816 };
export const PERSPECTIVE = 3600;

// The bookcase itself, including frame and arches. Keeps it on screen on small displays.
export const CASE = { x0: 520, x1: 2360, y0: 130, y1: 1410 };

// Inner edges of the three bay columns.
const COLS = [
  { x: 565, w: 477 },
  { x: 1100, w: 652 },
  { x: 1810, w: 494 },
];

// Each row: top = underside of the shelf above, base = where books stand,
// board = vertical center of the shelf's front edge (for the brass plate).
const ROWS = [
  { top: 548, base: 728, board: 738, lit: true },
  { top: 750, base: 924, board: 939, lit: true },
  { top: 952, base: 1121, board: 1141, lit: true },
  { top: 1152, base: 1334, board: 1376, lit: false },
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
