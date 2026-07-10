/**
 * MooPay Design Tokens
 * Colors from moo-pay-offline (oklch → hex), design language from ui-ref.
 *
 * Palette:  navy #0e1a4a · teal #2dd4a8 · pink #f472a1 · grape/purple #7c5cff
 */

export const colors = {
  // ── Core backgrounds ──────────────────────────────────────────────
  background: "#faf8f6",       // warm off-white (oklch 0.99 0.003 260)
  surface: "#f0edf5",          // light lavender surface
  surfaceElevated: "#ffffff",  // card background
  border: "#e3dff0",           // soft purple-tinted border
  borderLight: "#ece9f4",      // lighter border for subtle dividers

  // ── Typography ────────────────────────────────────────────────────
  text: "#0e1a4a",             // navy — primary text
  textSecondary: "#4a4670",    // medium contrast body text
  textMuted: "#8381a0",        // muted/caption text
  textOnPrimary: "#ffffff",    // text on filled buttons

  // ── Brand colors ──────────────────────────────────────────────────
  primary: "#7c5cff",          // grape — main CTA
  primarySoft: "#ece8ff",      // grape tint for backgrounds
  primaryHover: "#6a4ee0",     // darker grape for pressed states

  secondary: "#2dd4a8",        // teal — positive/secondary actions
  secondarySoft: "#e0faf2",    // teal tint for badges/backgrounds

  accent: "#f472a1",           // pink — highlights/badges
  accentSoft: "#fde8f0",       // pink tint for backgrounds

  navy: "#0e1a4a",             // deep navy — headers, emphasis

  // ── Semantic colors ───────────────────────────────────────────────
  success: "#2dd4a8",
  successSoft: "#e0faf2",
  error: "#ef4444",
  errorSoft: "#fde8e8",
  warning: "#f59e0b",
  warningSoft: "#fef3cd",
  info: "#7c5cff",
  infoSoft: "#ece8ff",

  // ── UI helpers ────────────────────────────────────────────────────
  shimmerBase: "#ece9f4",
  shimmerHighlight: "#f5f3fa",
  overlay: "rgba(14, 26, 74, 0.45)",
  inputBackground: "#f5f3fa",
  tabBarBackground: "#ffffff",
  tabBarBorder: "#ece9f4",
  statusBarStyle: "dark" as const,
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,
} as const;

export const typography = {
  hero: { fontSize: 32, fontWeight: "700" as const, letterSpacing: -0.5 },
  h1: { fontSize: 26, fontWeight: "700" as const, letterSpacing: -0.3 },
  h2: { fontSize: 22, fontWeight: "600" as const, letterSpacing: -0.2 },
  h3: { fontSize: 18, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const, lineHeight: 22 },
  bodyMedium: { fontSize: 15, fontWeight: "500" as const, lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: "400" as const },
  captionMedium: { fontSize: 13, fontWeight: "600" as const },
  label: { fontSize: 11, fontWeight: "700" as const, letterSpacing: 0.8, textTransform: "uppercase" as const },
  mono: { fontSize: 15, fontFamily: "monospace" as const },
} as const;

/**
 * TextInput sizing — do not put lineHeight on single-line inputs (RN clips glyphs on iOS).
 * Use these constants everywhere a TextInput is styled.
 */
export const textInput = {
  fontSize: 15,
  singleMinHeight: 52,
  multilineMinHeight: 120,
  paddingHorizontal: spacing.md,
  /** Vertical padding per platform — keeps ascenders/descenders inside the field. */
  paddingVertical: { ios: 15, android: 12, default: 14 } as const,
  multilineLineHeight: 22,
} as const;

export const shadows = {
  card: {
    shadowColor: "#0e1a4a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  lifted: {
    shadowColor: "#0e1a4a",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
} as const;
