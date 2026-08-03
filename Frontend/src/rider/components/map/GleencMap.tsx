import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
} from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';
import { FiCrosshair, FiRefreshCw } from 'react-icons/fi';
import { config } from '../../config/env';
import type { RouteCoordinate, RouteGeometry } from '../../types';

const ROUTE_SOURCE = 'gleenc-route';
const ROUTE_OUTLINE_LAYER = 'gleenc-route-outline';
const ROUTE_LAYER = 'gleenc-route-line';

interface GleencMapProps {
  rider: RouteCoordinate;
  destination: RouteCoordinate;
  destinationType: 'pickup' | 'delivery';
  destinationLabel: string;
  routeGeometry: RouteGeometry | null;
  compact?: boolean;
}

function routeFeature(geometry: RouteGeometry) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry,
  };
}

function routeCoordinates(geometry: RouteGeometry | null) {
  if (!geometry) return [] as number[][];
  if (geometry.type === 'LineString') {
    return geometry.coordinates as number[][];
  }
  return (geometry.coordinates as number[][][]).flat();
}

function markerElement(type: 'rider' | 'pickup' | 'delivery', label: string) {
  const element = document.createElement('div');
  element.className = `gleenc-map-marker gleenc-map-marker--${type}`;
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label);
  element.title = label;

  const dot = document.createElement('span');
  dot.className = 'gleenc-map-marker__dot';
  element.appendChild(dot);
  return element;
}

function fitRoute(
  map: MapLibreMap,
  rider: RouteCoordinate,
  destination: RouteCoordinate,
  geometry: RouteGeometry | null,
) {
  const points = [
    [rider.lng, rider.lat],
    [destination.lng, destination.lat],
    ...routeCoordinates(geometry),
  ].filter(
    (point) =>
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
  );
  if (points.length < 2) return;

  const bounds = points.reduce(
    (current, point) => current.extend(point as [number, number]),
    new LngLatBounds(points[0] as [number, number], points[0] as [number, number]),
  );
  map.fitBounds(bounds, {
    padding: { top: 70, right: 55, bottom: 70, left: 55 },
    maxZoom: 16,
    duration: 700,
  });
}

export default function GleencMap({
  rider,
  destination,
  destinationType,
  destinationLabel,
  routeGeometry,
  compact = false,
}: GleencMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const riderMarkerRef = useRef<Marker | null>(null);
  const destinationMarkerRef = useRef<Marker | null>(null);
  const loadedRef = useRef(false);
  const initialViewRef = useRef({ rider, destination, routeGeometry });
  const latestPointsRef = useRef({ rider, destination });
  const [mapError, setMapError] = useState('');
  const [mapAttempt, setMapAttempt] = useState(0);

  useEffect(() => {
    latestPointsRef.current = { rider, destination };
  }, [destination, rider]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initialView = initialViewRef.current;

    setMapError('');
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: config.mapStyleUrl,
        center: [initialView.destination.lng, initialView.destination.lat],
        zoom: 14,
        attributionControl: { compact: true },
      });
    } catch {
      setMapError('The map could not be initialized. Please try again.');
      return;
    }
    const handleMapError = () => {
      if (!loadedRef.current) {
        setMapError('The map could not load right now. Check your connection and try again.');
      }
    };
    map.on('error', handleMapError);
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: true, showZoom: true }),
      'top-right',
    );
    mapRef.current = map;
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.resize())
      : null;
    resizeObserver?.observe(containerRef.current);
    const loadTimeout = window.setTimeout(() => {
      if (!loadedRef.current) {
        setMapError('The map tiles are taking too long to load. Check your connection and retry.');
      }
    }, 15_000);

    map.on('load', () => {
      loadedRef.current = true;
      window.clearTimeout(loadTimeout);
      setMapError('');
      map.resize();
      if (!map.getSource(ROUTE_SOURCE)) {
        map.addSource(ROUTE_SOURCE, {
          type: 'geojson',
          data: initialView.routeGeometry
            ? routeFeature(initialView.routeGeometry)
            : {
                type: 'FeatureCollection',
                features: [],
              },
        });
      }
      if (!map.getLayer(ROUTE_OUTLINE_LAYER)) {
        map.addLayer({
          id: ROUTE_OUTLINE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#fff4a3',
            'line-width': 10,
            'line-opacity': 0.9,
          },
        });
      }
      if (!map.getLayer(ROUTE_LAYER)) {
        map.addLayer({
          id: ROUTE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#ff3c00',
            'line-width': 6,
          },
        });
      }
      fitRoute(
        map,
        initialView.rider,
        initialView.destination,
        initialView.routeGeometry,
      );
    });

    return () => {
      riderMarkerRef.current?.remove();
      destinationMarkerRef.current?.remove();
      riderMarkerRef.current = null;
      destinationMarkerRef.current = null;
      loadedRef.current = false;
      window.clearTimeout(loadTimeout);
      resizeObserver?.disconnect();
      map.off('error', handleMapError);
      map.remove();
      mapRef.current = null;
    };
  }, [mapAttempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!riderMarkerRef.current) {
      const marker = new maplibregl.Marker({
        element: markerElement('rider', 'Your current location'),
        anchor: 'center',
      }).addTo(map);
      riderMarkerRef.current = marker;
    }
    riderMarkerRef.current?.setLngLat([rider.lng, rider.lat]);
  }, [rider.lat, rider.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    destinationMarkerRef.current?.remove();
    destinationMarkerRef.current = new maplibregl.Marker({
      element: markerElement(destinationType, destinationLabel),
      anchor: 'bottom',
    })
      .setLngLat([destination.lng, destination.lat])
      .addTo(map);
  }, [
    destination.lat,
    destination.lng,
    destinationLabel,
    destinationType,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeGeometry) return;

    const updateRoute = () => {
      const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
      source?.setData(routeFeature(routeGeometry));
      fitRoute(
        map,
        latestPointsRef.current.rider,
        latestPointsRef.current.destination,
        routeGeometry,
      );
    };

    if (loadedRef.current) {
      updateRoute();
    } else {
      map.once('load', updateRoute);
    }
  }, [destination.lat, destination.lng, routeGeometry]);

  function recenter() {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [rider.lng, rider.lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: 600,
    });
  }

  return (
    <div className={`gleenc-map-shell${compact ? ' gleenc-map-shell--compact' : ''}`}>
      <div ref={containerRef} className="gleenc-map-canvas" />
      {mapError ? (
        <div className="absolute inset-0 z-10 flex min-h-[28rem] flex-col items-center justify-center gap-3 bg-white p-6 text-center">
          <p className="font-black text-slate-900">Map unavailable</p>
          <p className="max-w-sm text-sm text-slate-500">{mapError}</p>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white"
            onClick={() => setMapAttempt((attempt) => attempt + 1)}
          >
            <FiRefreshCw />
            Retry map
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="gleenc-map-recenter"
          onClick={recenter}
          aria-label="Recenter map on my location"
        >
          <FiCrosshair />
          <span>Recenter</span>
        </button>
      )}
    </div>
  );
}
