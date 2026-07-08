export type EntityType = "customer" | "merchant";

export type ListSource = "un_sc" | "uae_local";

export type ScreenRequest = {
  entity_id: string;
  entity_type: EntityType;
};

export type ScreenResult = {
  match: boolean;
  score: number;
  list_source: ListSource | null;
  screened_name: string;
  matched_name?: string;
};

export type SanctionsListEntry = {
  entity_name: string;
  aliases?: string[];
};

export type SanctionsCacheRow = {
  entity_name: string;
  list_source: ListSource;
  metadata: Record<string, unknown>;
};
