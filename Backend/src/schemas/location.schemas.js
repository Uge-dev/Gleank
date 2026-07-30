import { z } from "zod";

const coordinate = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const locationRouteSchema = z.object({
  from: coordinate,
  to: coordinate,
  mode: z.enum([
    "drive",
    "motorcycle",
    "scooter",
    "bicycle",
    "walk",
    "light_truck",
  ]).optional().default("motorcycle"),
});
