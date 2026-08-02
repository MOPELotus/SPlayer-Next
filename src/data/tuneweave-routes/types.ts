import type { TuneWeaveHttpMethod } from "@shared/types/tuneweave";

export interface TuneWeaveRouteDefinition {
  method: TuneWeaveHttpMethod;
  path: string;
  category: string;
}
