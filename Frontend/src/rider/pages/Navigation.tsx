import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FiArrowLeft, FiMapPin, FiNavigation, FiRefreshCw } from 'react-icons/fi';
import { Link, Navigate, useParams } from 'react-router-dom';
import GleencMap from '../components/map/GleencMap';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import PageHeader from '../components/ui/PageHeader';
import { shouldUseApi } from '../config/env';
import { useRiderData } from '../context/RiderDataContext';
import { riderApi } from '../services/riderApi';
import type { RiderRouteEstimate, RouteCoordinate } from '../types';

const ROUTE_REFRESH_DISTANCE_METERS = 100;
const LOCATION_SAVE_DISTANCE_METERS = 25;
const LOCATION_SAVE_INTERVAL_MS = 30_000;

function distanceMeters(from: RouteCoordinate, to: RouteCoordinate) {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const latDelta = toRadians(to.lat - from.lat);
  const lngDelta = toRadians(to.lng - from.lng);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(lngDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

function geoErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return 'Allow location access in your browser to start navigation.';
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return 'Your current location is unavailable. Turn on GPS and try again.';
  }
  return 'GPS took too long to respond. Move outdoors and refresh your location.';
}

export default function Navigation() {
  const { assignmentId = '' } = useParams();
  const {
    assignments,
    loading,
    orders,
    unlockedOrderIds,
  } = useRiderData();
  const assignment = assignments.find((item) => item.id === assignmentId);
  const order = orders.find((item) => item.assignmentId === assignmentId);
  const pickupDone = Boolean(
    assignment?.sellerPickupCodeVerifiedAt ||
      ['package_picked_up', 'out_for_delivery'].includes(
        assignment?.status || 'assigned',
      ) ||
      (order && unlockedOrderIds.includes(order.id)),
  );
  const target = pickupDone ? 'delivery' : 'pickup';
  const destination = useMemo<RouteCoordinate | null>(() => {
    const lat = pickupDone
      ? order?.deliveryLat ?? assignment?.deliveryLat
      : assignment?.pickupLat;
    const lng = pickupDone
      ? order?.deliveryLng ?? assignment?.deliveryLng
      : assignment?.pickupLng;
    return typeof lat === 'number' && typeof lng === 'number'
      ? { lat, lng }
      : null;
  }, [
    assignment?.deliveryLat,
    assignment?.deliveryLng,
    assignment?.pickupLat,
    assignment?.pickupLng,
    order?.deliveryLat,
    order?.deliveryLng,
    pickupDone,
  ]);
  const destinationLabel = pickupDone
    ? order?.deliveryAddress || assignment?.deliveryLocation || 'Buyer'
    : assignment?.pickupLocation || 'Seller';

  const [position, setPosition] = useState<RouteCoordinate | null>(null);
  const [route, setRoute] = useState<RiderRouteEstimate | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState('');
  const routeRequestRef = useRef(false);
  const lastRoutedPositionRef = useRef<RouteCoordinate | null>(null);
  const lastTargetRef = useRef<'pickup' | 'delivery'>(target);
  const lastRouteAttemptRef = useRef<{
    point: RouteCoordinate;
    target: 'pickup' | 'delivery';
    at: number;
  } | null>(null);
  const lastSavedLocationRef = useRef<{
    point: RouteCoordinate;
    at: number;
  } | null>(null);

  const loadRoute = useCallback(
    async (current: RouteCoordinate, force = false) => {
      if (!assignmentId || !destination || routeRequestRef.current) return;
      const lastPoint = lastRoutedPositionRef.current;
      const targetChanged = lastTargetRef.current !== target;
      const lastAttempt = lastRouteAttemptRef.current;
      if (
        !force &&
        !targetChanged && (
          (lastPoint &&
            distanceMeters(lastPoint, current) < ROUTE_REFRESH_DISTANCE_METERS) ||
          (lastAttempt &&
            lastAttempt.target === target &&
            Date.now() - lastAttempt.at < 30_000 &&
            distanceMeters(lastAttempt.point, current) <
              ROUTE_REFRESH_DISTANCE_METERS)
        )
      ) {
        return;
      }

      routeRequestRef.current = true;
      lastRouteAttemptRef.current = {
        point: current,
        target,
        at: Date.now(),
      };
      setRouteLoading(true);
      setError('');
      try {
        const result = await riderApi.routeEstimate(
          assignmentId,
          current,
          target,
        );
        setRoute(result);
        lastRoutedPositionRef.current = current;
        lastTargetRef.current = target;
      } catch (routeError) {
        setError(
          routeError instanceof Error
            ? routeError.message
            : 'The route could not be loaded. Please try again.',
        );
      } finally {
        routeRequestRef.current = false;
        setRouteLoading(false);
      }
    },
    [assignmentId, destination, target],
  );

  useEffect(() => {
    if (!navigator.geolocation || !assignmentId) {
      setError('GPS is unavailable in this browser.');
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        const current = {
          lat: result.coords.latitude,
          lng: result.coords.longitude,
        };
        setPosition(current);

        const saved = lastSavedLocationRef.current;
        if (
          shouldUseApi() &&
          (!saved ||
            Date.now() - saved.at >= LOCATION_SAVE_INTERVAL_MS ||
            distanceMeters(saved.point, current) >= LOCATION_SAVE_DISTANCE_METERS)
        ) {
          lastSavedLocationRef.current = { point: current, at: Date.now() };
          void riderApi
            .updateLocation(
              {
                ...current,
                accuracyMeters: result.coords.accuracy,
              },
              assignmentId,
            )
            .catch(() => undefined);
        }

        void loadRoute(current);
      },
      (geoError) => setError(geoErrorMessage(geoError)),
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000,
      },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [assignmentId, loadRoute]);

  useEffect(() => {
    if (!position || lastTargetRef.current === target) return;
    setRoute(null);
    lastRoutedPositionRef.current = null;
    void loadRoute(position, true);
  }, [loadRoute, position, target]);

  if (!assignment && !loading) {
    return <Navigate to="/rider/active" replace />;
  }

  if (!assignment) {
    return (
      <Card className="p-6">
        <p className="font-bold text-slate-700">Loading delivery...</p>
      </Card>
    );
  }

  const continuePath = pickupDone && order
    ? `/rider/delivery/${order.id}`
    : `/rider/verify/${assignment.id}`;

  return (
    <div>
      <PageHeader
        title={pickupDone ? 'Navigate to buyer' : 'Navigate to seller'}
        action={
          <Link to="/rider/active">
            <Button variant="secondary" icon={FiArrowLeft}>
              Back
            </Button>
          </Link>
        }
      />

      <Card className="mb-4 p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gleenc-gradient text-slate-950">
            <FiMapPin />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              {pickupDone ? 'Deliver to' : 'Pick up from'}
            </p>
            <p className="mt-1 font-black text-slate-900">
              {destinationLabel}
            </p>
          </div>
        </div>
      </Card>

      {!destination ? (
        <Card className="p-6 text-center">
          <h2 className="text-lg font-black text-slate-950">
            Map pin missing
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            The exact {pickupDone ? 'buyer' : 'seller'} coordinates were not
            saved for this order.
          </p>
          <Link to={continuePath} className="mt-5 inline-block">
            <Button>Continue delivery steps</Button>
          </Link>
        </Card>
      ) : !position ? (
        <Card className="p-6 text-center">
          <FiNavigation className="mx-auto text-3xl text-gleenc-cyan" />
          <h2 className="mt-3 text-lg font-black text-slate-950">
            Finding your location
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Keep GPS enabled while navigating.
          </p>
          {error ? (
            <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">
              {error}
            </p>
          ) : null}
        </Card>
      ) : (
        <>
          <GleencMap
            rider={position}
            destination={destination}
            destinationType={target}
            destinationLabel={destinationLabel}
            routeGeometry={route?.geometry || null}
          />

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                Distance
              </p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {route ? `${route.distanceKm} km` : '—'}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                ETA
              </p>
              <p className="mt-1 text-2xl font-black text-slate-950">
                {route ? `${route.durationMinutes} min` : '—'}
              </p>
            </Card>
          </div>

          {route?.instructions[0]?.text ? (
            <Card className="mt-3 p-4">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                Start
              </p>
              <p className="mt-1 font-bold text-slate-900">
                {route.instructions[0].text}
              </p>
            </Card>
          ) : null}

          {error ? (
            <p className="mt-3 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">
              {error}
            </p>
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Button
              variant="secondary"
              icon={FiRefreshCw}
              fullWidth
              disabled={routeLoading}
              onClick={() => void loadRoute(position, true)}
            >
              {routeLoading ? 'Loading route...' : 'Refresh route'}
            </Button>
            <Link to={continuePath}>
              <Button icon={FiNavigation} fullWidth>
                Continue delivery
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
