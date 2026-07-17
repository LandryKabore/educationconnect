import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Sun,
  CloudSun,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

type LocationSource = "gps" | "ip" | "school";

type WeatherInfo = {
  temp: number;
  label: string;
  city: string;
  code: number;
  source: LocationSource;
};

type Coords = { lat: number; lon: number; city?: string };

function weatherFromCode(code: number): { label: string; Icon: typeof Sun } {
  if (code === 0) return { label: "Clair", Icon: Sun };
  if (code <= 2) return { label: "Partiellement nuageux", Icon: CloudSun };
  if (code === 3) return { label: "Couvert", Icon: Cloud };
  if (code === 45 || code === 48) return { label: "Brouillard", Icon: CloudFog };
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { label: "Pluie", Icon: CloudRain };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { label: "Neige", Icon: CloudSnow };
  }
  if ([95, 96, 99].includes(code)) {
    return { label: "Orage", Icon: CloudLightning };
  }
  return { label: "Variable", Icon: Cloud };
}

function getDevicePosition(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocalisation indisponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 5 * 60_000 },
    );
  });
}

async function getIpPosition(): Promise<Coords> {
  const res = await fetch("https://get.geojs.io/v1/ip/geo.json");
  if (!res.ok) throw new Error("IP geo indisponible");
  const data = (await res.json()) as {
    latitude?: string;
    longitude?: string;
    city?: string;
    region?: string;
  };
  const lat = Number(data.latitude);
  const lon = Number(data.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("IP geo invalide");
  }
  return {
    lat,
    lon,
    city: data.city || data.region || undefined,
  };
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=fr&zoom=12`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "EduFaso/1.0 (school-management)",
        },
      },
    );
    if (!res.ok) return "Ma position";
    const data = (await res.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        suburb?: string;
        county?: string;
        state?: string;
      };
      name?: string;
    };
    const a = data.address ?? {};
    return (
      a.city ||
      a.town ||
      a.village ||
      a.municipality ||
      a.suburb ||
      a.county ||
      a.state ||
      data.name ||
      "Ma position"
    );
  } catch {
    return "Ma position";
  }
}

async function geocodeCity(cityHint: string): Promise<Coords & { city: string }> {
  const query = cityHint.trim() || "Ouagadougou";
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`,
  );
  if (!geoRes.ok) throw new Error("Geo indisponible");
  const geo = (await geoRes.json()) as {
    results?: { name: string; latitude: number; longitude: number }[];
  };
  const place = geo.results?.[0];
  return {
    lat: place?.latitude ?? 12.3714,
    lon: place?.longitude ?? -1.5197,
    city: place?.name ?? query,
  };
}

async function fetchForecast(lat: number, lon: number) {
  const wxRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`,
  );
  if (!wxRes.ok) throw new Error("Meteo indisponible");
  const wx = (await wxRes.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
  };
  const code = wx.current?.weather_code ?? 0;
  return {
    temp: Math.round(wx.current?.temperature_2m ?? 0),
    code,
    label: weatherFromCode(code).label,
  };
}

async function resolveLocation(cityFallback: string): Promise<{
  coords: Coords;
  source: LocationSource;
  city: string;
}> {
  try {
    const coords = await getDevicePosition();
    const city = coords.city || (await reverseGeocode(coords.lat, coords.lon));
    return { coords, source: "gps", city };
  } catch {
    // Electron/Chromium often has no GPS provider — IP is the reliable path
  }

  try {
    const coords = await getIpPosition();
    const city =
      coords.city || (await reverseGeocode(coords.lat, coords.lon));
    return { coords, source: "ip", city };
  } catch {
    // last resort: school profile city
  }

  const place = await geocodeCity(cityFallback);
  return {
    coords: place,
    source: "school",
    city: place.city,
  };
}

async function fetchWeather(cityFallback: string): Promise<WeatherInfo> {
  const { coords, source, city } = await resolveLocation(cityFallback);
  const forecast = await fetchForecast(coords.lat, coords.lon);
  return { ...forecast, city, source };
}

function sourceHint(source: LocationSource) {
  if (source === "gps") return "GPS";
  if (source === "ip") return "position";
  return "ecole";
}

export function LiveClockWeather({ className }: { className?: string }) {
  const { schoolId, schools } = useAuth();
  const school = schools.find((s) => s.id === schoolId) ?? schools[0];
  const cityFallback = school?.city || school?.region || "Ouagadougou";

  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const { data: weather } = useQuery({
    queryKey: ["weather-location-v2", cityFallback],
    queryFn: () => fetchWeather(cityFallback),
    staleTime: 15 * 60_000,
    refetchInterval: 15 * 60_000,
    retry: 1,
  });

  const { Icon } = weatherFromCode(weather?.code ?? 0);

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-700",
        className,
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {format(now, "EEEE d MMM", { locale: fr })}
      </p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">
        {format(now, "HH:mm:ss")}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
        <Icon className="h-3.5 w-3.5 shrink-0 text-brand-700" />
        {weather ? (
          <span className="min-w-0 truncate" title={`Source: ${sourceHint(weather.source)}`}>
            {weather.temp}°C · {weather.label}
            {weather.city ? ` · ${weather.city}` : ""}
          </span>
        ) : (
          <span className="text-slate-400">Detection position...</span>
        )}
      </div>
    </div>
  );
}
