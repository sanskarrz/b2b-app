// RX Tech – Theme tokens (OrlaFarma-inspired palette)
// Brand colors:
//   Deep Orange #F08C47 (primary)
//   Peach       #F6AC85 (primary soft / highlights)
//   Teal        #7DC4B6 (secondary / accent)
//   Cream       #FCF6E6 (warm surface)
export const colors = {
  // Surfaces
  bg: "#FFFFFF",
  surface: "#FCF6E6", // warm cream surface (was light gray)
  surfaceAlt: "#FFF8EC",
  surfaceMuted: "#F5F5F4",
  border: "#EDE4D3",
  borderStrong: "#D9CDB7",

  // Text
  text: "#2A1F14", // warm near-black (was pure black)
  textSecondary: "#7A6A55",
  textTertiary: "#B0A28C",

  // Brand
  primary: "#F08C47", // deep orange
  primarySoft: "#F6AC85", // peach
  primaryBg: "#FFE9D8",
  primaryText: "#FFFFFF",
  accent: "#7DC4B6", // teal
  accentSoft: "#B6DDD3",
  accentBg: "#E2F3EE",

  // Semantic
  success: "#16A34A",
  successBg: "#DCFCE7",
  warning: "#F59E0B",
  warningBg: "#FEF3C7",
  danger: "#DC2626",
  dangerBg: "#FEE2E2",
  info: "#0EA5A4",
  infoBg: "#E2F3EE",
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const font = {
  h1: 28,
  h2: 22,
  h3: 18,
  body: 15,
  bodySmall: 13,
  caption: 11,
};

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const formatINR = (amount: number): string => {
  if (amount === undefined || amount === null) return "₹0";
  const abs = Math.abs(amount);
  if (abs >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toFixed(0)}`;
};

export const formatINRFull = (amount: number): string => {
  if (amount === undefined || amount === null) return "₹0";
  return "₹" + amount.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};
