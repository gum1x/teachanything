export const COMMON_QUESTIONS_PAGE_SIZE = 5;

export const chartColors = {
  grid: "var(--muted)",
  tick: "var(--muted-foreground)",
  card: "var(--card)",
  border: "var(--border)",
  primary: "var(--primary)",
  sessions: "#0f766e",
  // Thumbs up / down: distinguishable for colorblind readers in both themes
  // (the theme's own chart colors are all greens).
  ratingUp: "#3987e5",
  ratingDown: "#d95926",
} as const;
