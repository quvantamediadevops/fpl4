import type { AuctionAdminDetail, AuctionCorrectionView } from "./types";

/**
 * How each sale stands in the correction history:
 * - ACTIVE            live sale, never corrected
 * - ACTIVE_CORRECTED  live sale that replaced an earlier one (the corrected sale)
 * - CORRECTED         reversed and replaced by a corrected sale
 * - UNDONE            reversed by "Undo sale"; the player became UNSOLD
 * - REVERSED          reversed without a correction record (older data)
 */
export type SaleState = "ACTIVE" | "ACTIVE_CORRECTED" | "CORRECTED" | "UNDONE" | "REVERSED";

export type HistorySale = AuctionAdminDetail["sales"][number] & {
  state: SaleState;
  /** ORIGINAL = first sale of the player in this chain; CORRECTION = created by a correction. */
  origin: "ORIGINAL" | "CORRECTION";
  /** Correction that ended this sale (corrected or undone). */
  endedBy: AuctionCorrectionView | null;
  /** Correction that created this sale. */
  createdBy: AuctionCorrectionView | null;
};

export const SALE_STATE_LABEL: Record<SaleState, string> = {
  ACTIVE: "ACTIVE",
  ACTIVE_CORRECTED: "ACTIVE · CORRECTED SALE",
  CORRECTED: "REVERSED · CORRECTED",
  UNDONE: "REVERSED · UNDONE",
  REVERSED: "REVERSED",
};

export function saleHistory(detail: Pick<AuctionAdminDetail, "sales" | "corrections">): HistorySale[] {
  const endedBy = new Map<string, AuctionCorrectionView>();
  const createdBy = new Map<string, AuctionCorrectionView>();
  for (const c of detail.corrections) {
    if (c.originalSaleId) endedBy.set(c.originalSaleId, c);
    if (c.replacementSaleId) createdBy.set(c.replacementSaleId, c);
  }
  return detail.sales.map((sale) => {
    const ended = endedBy.get(sale.saleId) ?? null;
    const created = createdBy.get(sale.saleId) ?? null;
    const state: SaleState = !sale.reversedAt
      ? created
        ? "ACTIVE_CORRECTED"
        : "ACTIVE"
      : ended?.action === "UNDO_SALE"
        ? "UNDONE"
        : ended
          ? "CORRECTED"
          : "REVERSED";
    return { ...sale, state, origin: created ? "CORRECTION" : "ORIGINAL", endedBy: ended, createdBy: created };
  });
}

export const CORRECTION_LABEL: Record<AuctionCorrectionView["action"], string> = {
  CHANGE_PRICE: "Price corrected",
  CHANGE_TEAM: "Team changed",
  CHANGE_PRICE_TEAM: "Team & price corrected",
  UNDO_SALE: "Sale undone → UNSOLD",
  REOPEN_PLAYER: "Reopened → AVAILABLE",
};
