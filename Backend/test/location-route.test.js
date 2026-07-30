import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../src/config/env.js";
import { calculateRoute } from "../src/services/location.service.js";

test("Geoapify routing returns map geometry, ETA, and instructions", async () => {
  const originalProvider = env.mapProvider;
  const originalKey = env.geoapifyApiKey;
  const originalBaseUrl = env.geoapifyBaseUrl;
  const originalFetch = globalThis.fetch;

  env.mapProvider = "geoapify";
  env.geoapifyApiKey = "test-route-key";
  env.geoapifyBaseUrl = "https://api.geoapify.test/v1";

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/v1/routing");
    assert.equal(url.searchParams.get("mode"), "motorcycle");
    assert.equal(url.searchParams.get("format"), "geojson");
    assert.equal(url.searchParams.get("apiKey"), "test-route-key");
    assert.equal(
      url.searchParams.get("waypoints"),
      "5.516,5.75|5.522,5.756",
    );

    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              distance: 2400,
              time: 480,
              legs: [
                {
                  steps: [
                    {
                      distance: 300,
                      time: 60,
                      from_index: 0,
                      to_index: 1,
                      instruction: { text: "Head north" },
                    },
                  ],
                },
              ],
            },
            geometry: {
              type: "MultiLineString",
              coordinates: [
                [
                  [5.75, 5.516],
                  [5.756, 5.522],
                ],
              ],
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/geo+json" },
      },
    );
  };

  try {
    const route = await calculateRoute({
      from: { lat: 5.516, lng: 5.75 },
      to: { lat: 5.522, lng: 5.756 },
      mode: "motorcycle",
    });

    assert.equal(route.provider, "geoapify");
    assert.equal(route.distanceMeters, 2400);
    assert.equal(route.distanceKm, 2.4);
    assert.equal(route.durationMinutes, 8);
    assert.equal(route.geometry.type, "MultiLineString");
    assert.equal(route.instructions[0].text, "Head north");
    assert.deepEqual(route.instructions[0].coordinate, {
      lng: 5.75,
      lat: 5.516,
    });
  } finally {
    env.mapProvider = originalProvider;
    env.geoapifyApiKey = originalKey;
    env.geoapifyBaseUrl = originalBaseUrl;
    globalThis.fetch = originalFetch;
  }
});
