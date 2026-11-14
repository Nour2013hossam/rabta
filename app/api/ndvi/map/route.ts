import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const PROCESS_URL = "https://sh.dataspace.copernicus.eu/process/v1";
const CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
};

let cachedToken: { value: string; expiresAt: number } | null = null;
const imageCache = new Map<string, { bytes: Uint8Array; expiresAt: number }>();

async function getAccessToken(clientId: string, clientSecret: string) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const token = (await response.json()) as TokenResponse;
  if (!response.ok || !token.access_token) {
    throw new Error("تعذر تسجيل الدخول إلى Copernicus. راجع إعدادات OAuth.");
  }

  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max((token.expires_in ?? 300) - 90, 60) * 1000,
  };
  return token.access_token;
}

function validPoint(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    value[0] >= -90 &&
    value[0] <= 90 &&
    value[1] >= -180 &&
    value[1] <= 180
  );
}

const EVALSCRIPT = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B04", "B08", "SCL", "dataMask"]
    }],
    output: {
      bands: 4,
      sampleType: "UINT8"
    }
  };
}

function ramp(value) {
  var stops = [
    [-0.10, [115, 91, 69]],
    [ 0.05, [165, 128, 77]],
    [ 0.20, [210, 183, 105]],
    [ 0.35, [222, 215, 126]],
    [ 0.50, [164, 190, 104]],
    [ 0.65, [91, 157, 91]],
    [ 0.80, [40, 119, 72]],
    [ 1.00, [21, 83, 54]]
  ];

  if (value <= stops[0][0]) return stops[0][1];
  if (value >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];

  for (var i = 0; i < stops.length - 1; i++) {
    var low = stops[i];
    var high = stops[i + 1];
    if (value >= low[0] && value <= high[0]) {
      var t = (value - low[0]) / (high[0] - low[0]);
      return [
        Math.round(low[1][0] + t * (high[1][0] - low[1][0])),
        Math.round(low[1][1] + t * (high[1][1] - low[1][1])),
        Math.round(low[1][2] + t * (high[1][2] - low[1][2]))
      ];
    }
  }
  return [110, 150, 90];
}

function evaluatePixel(sample) {
  var excludedClasses = [3, 6, 8, 9, 10, 11];
  if (sample.dataMask === 0 || excludedClasses.indexOf(sample.SCL) !== -1) {
    return [0, 0, 0, 0];
  }

  var denominator = sample.B08 + sample.B04;
  if (denominator <= 0) {
    return [0, 0, 0, 0];
  }

  var ndvi = (sample.B08 - sample.B04) / denominator;
  var color = ramp(ndvi);

  return [color[0], color[1], color[2], 205];
}`;

export async function POST(request: NextRequest) {
  const clientId = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: "خدمة صور NDVI غير مهيأة بعد.",
        code: "CDSE_NOT_CONFIGURED",
        setup: "أضف CDSE_CLIENT_ID وCDSE_CLIENT_SECRET إلى .env.local.",
      },
      { status: 503 }
    );
  }

  let body: { coordinates?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "صيغة الطلب غير صحيحة." }, { status: 400 });
  }

  if (
    !Array.isArray(body.coordinates) ||
    body.coordinates.length < 3 ||
    body.coordinates.length > 200 ||
    !body.coordinates.every(validPoint)
  ) {
    return NextResponse.json(
      { error: "حدود الحقل غير صالحة. يلزم 3 نقاط على الأقل." },
      { status: 400 }
    );
  }

  const points = body.coordinates as [number, number][];
  const closed =
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1]
      ? points
      : [...points, points[0]];

  const latitudes = points.map((point) => point[0]);
  const longitudes = points.map((point) => point[1]);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);

  if (
    north - south < 0.00005 ||
    east - west < 0.00005 ||
    north - south > 0.2 ||
    east - west > 0.2
  ) {
    return NextResponse.json(
      { error: "مساحة الحدود صغيرة جدًا أو كبيرة جدًا لطبقة التحليل التجريبية." },
      { status: 400 }
    );
  }

  const now = new Date();
  const to = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const from = new Date(to.getTime() - 45 * 24 * 60 * 60 * 1000);
  const iso = (value: Date) => value.toISOString().slice(0, 10) + "T00:00:00Z";
  const fromDate = iso(from);
  const toDate = iso(to);
  const cacheKey = JSON.stringify({ closed, fromDate, toDate });
  const cached = imageCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return new Response(new Uint8Array(cached.bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=600",
        "X-NABTA-Cache": "HIT",
        "X-NABTA-Period-From": fromDate,
        "X-NABTA-Period-To": toDate,
      },
    });
  }

  const geometryCoordinates = [closed.map(([lat, lon]) => [lon, lat])];
  const middleLatitude = ((north + south) / 2) * (Math.PI / 180);
  const physicalAspect =
    ((east - west) * Math.cos(middleLatitude)) / (north - south);
  const safeAspect = Math.max(0.15, Math.min(6, physicalAspect));
  const outputWidth =
    safeAspect >= 1 ? 512 : Math.max(80, Math.round(512 * safeAspect));
  const outputHeight =
    safeAspect >= 1 ? Math.max(80, Math.round(512 / safeAspect)) : 512;

  const processRequest = {
    input: {
      bounds: {
        geometry: {
          type: "Polygon",
          coordinates: geometryCoordinates,
        },
        properties: { crs: CRS84 },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            timeRange: { from: fromDate, to: toDate },
            maxCloudCoverage: 60,
            mosaickingOrder: "leastCC",
          },
        },
      ],
    },
    output: {
      width: outputWidth,
      height: outputHeight,
      responses: [
        {
          identifier: "default",
          format: { type: "image/png" },
        },
      ],
    },
    evalscript: EVALSCRIPT,
  };

  try {
    const accessToken = await getAccessToken(clientId, clientSecret);
    const response = await fetch(PROCESS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "image/png",
      },
      body: JSON.stringify(processRequest),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });

    if (!response.ok) {
      const details = await response.text();
      console.error("Sentinel Hub Process API error:", response.status, details);

      if (response.status === 401 || response.status === 403) cachedToken = null;

      return NextResponse.json(
        {
          error:
            response.status === 429
              ? "تم الوصول إلى حد الطلبات. حاول لاحقًا."
              : "تعذر جلب طبقة NDVI من Sentinel-2 لهذا الحقل.",
          code: "SENTINEL_PROCESS_ERROR",
          providerStatus: response.status,
        },
        { status: response.status === 429 ? 429 : 502 }
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("image/png")) {
      return NextResponse.json(
        { error: "استجابة خدمة الأقمار الصناعية لم تكن صورة PNG صالحة." },
        { status: 502 }
      );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 100 || bytes.length > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: "حجم صورة التحليل غير متوقع." },
        { status: 502 }
      );
    }

    if (imageCache.size > 30) {
      const firstKey = imageCache.keys().next().value;
      if (firstKey) imageCache.delete(firstKey);
    }
    imageCache.set(cacheKey, {
      bytes,
      expiresAt: Date.now() + 15 * 60 * 1000,
    });

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, max-age=600",
        "X-NABTA-Cache": "MISS",
        "X-NABTA-Period-From": fromDate,
        "X-NABTA-Period-To": toDate,
      },
    });
  } catch (error) {
    console.error("NDVI image request failed:", error);
    return NextResponse.json(
      { error: "تعذر الاتصال بخدمة صور الأقمار الصناعية. حاول مرة أخرى." },
      { status: 502 }
    );
  }
}
