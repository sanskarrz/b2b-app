// RX Tech – Shared theme tokens
export const colors = {
  bg: "#FFFFFF",
  surface: "#F5F5F7",
  surfaceAlt: "#FAFAFB",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  text: "#0A0A0A",
  textSecondary: "#6B7280",
  textTertiary: "#9CA3AF",
  primary: "#0A0A0A",
  primaryText: "#FFFFFF",
  accent: "#0EA5A4", // teal-ish for highlights/active
  success: "#16A34A",
  successBg: "#DCFCE7",
  warning: "#F59E0B",
  warningBg: "#FEF3C7",
  danger: "#DC2626",
  dangerBg: "#FEE2E2",
  info: "#2563EB",
  infoBg: "#DBEAFE",
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
