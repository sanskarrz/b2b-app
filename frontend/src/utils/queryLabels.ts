// Shared labels for flag / query tickets (both portals)
import { colors } from "@/src/theme";

export const TYPE_LABEL: Record<string, string> = {
  damaged_goods: "Damaged Goods", wrong_supply: "Wrong Supply", extra_supply: "Extra Supply",
  no_supply: "No Supply", rate_scheme: "Rate/Scheme Issue", return: "Return", credit: "Credit", other: "Other",
};
export const STATUS_COLOR: Record<string, string> = {
  open: colors.warning, in_progress: colors.info, resolved: colors.success, rejected: colors.danger, closed: colors.textSecondary,
};
export const STATUS_LABEL: Record<string, string> = {
  open: "FLAGGED", in_progress: "IN PROGRESS", resolved: "RESOLVED", rejected: "REJECTED", closed: "CLOSED",
};
