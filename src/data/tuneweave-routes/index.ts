import { routesPart1 } from "./part1";
import { routesPart2 } from "./part2";
import { routesPart3 } from "./part3";
import { routesPart4 } from "./part4";
import { routesPart5 } from "./part5";
import { routesPart6 } from "./part6";
import { routesPart7 } from "./part7";
import type { TuneWeaveRouteDefinition } from "./types";

export const TUNEWEAVE_ROUTE_SOURCE_RELEASE = "v0.1.0-alpha.3";

export const TUNEWEAVE_ROUTES: TuneWeaveRouteDefinition[] = [
  ...routesPart1,
  ...routesPart2,
  ...routesPart3,
  ...routesPart4,
  ...routesPart5,
  ...routesPart6,
  ...routesPart7,
];

export type { TuneWeaveRouteDefinition } from "./types";
