import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
const STATISTICS_URL = "https://sh.dataspace.copernicus.eu/statistics/v1";
const WGS84 = "http://www.opengis.net/def/crs/EPSG/0/4326";

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type StatsResponse = {
  status?: "OK" | "PARTIAL" | "FAILED";
  geometryPixelCount?: number;
  data?: Array<{
    interval?: { from?: string; to?: string };
    outputs?: {
      data?: {
        bands?: {
          B0?: {
            stats?: {
              min?: number;
              max?: number;
              mean?: number;
              stDev?: number;
              sampleCount?: number;
              noDataCount?: number;
            };
          };
        };
      };
    };
  }>;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(clientId: string, clientSecret: string) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  const token = (await response.json()) as TokenResponse;

  if (!response.ok || !token.access_token) {
    throw new Error("تعذر تسجيل الدخول إلى خدمة Copernicus. راجع بيانات OAuth.");
  }

  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max((token.expires_in ?? 300) - 90, 60) * 1000,
  };

  return token.access_token;
}

function isValidCoordinate(point: unknown): point is [number, number] {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    typeof point[0] === "number" &&
    typeof point[1] === "number" &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    point[0] >= -90 &&
    point[0] <= 90 &&
    point[1] >= -180 &&
    point[1] <= 180
  );
}

function closeRing(points: [number, number][]) {
  const first = points[0];
  const last = points[points.length - 1];

  if (first[0] === last[0] && first[1] === last[1]) {
    return points;
  }

  return [...points, first];
}

function summarize(response: StatsResponse) {
  const observations = (response.data ?? [])
    .map((entry) => {
      const stats = entry.outputs?.data?.bands?.B0?.stats;
      if (!stats || typeof stats.mean !== "number") return null;

      const total = (stats.sampleCount ?? 0) + (stats.noDataCount ?? 0);
      const valid = stats.sampleCount ?? 0;

      return {
        from: entry.interval?.from ?? "",
        to: entry.interval?.to ?? "",
        mean: stats.mean,
        min: stats.min ?? stats.mean,
        max: stats.max ?? stats.mean,
        standardDeviation: stats.stDev ?? 0,
        validPixels: valid,
        noDataPixels: stats.noDataCount ?? 0,
        validCoveragePercent:
          total > 0 ? Math.round((valid / total) * 100) : 0,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.from.localeCompare(b.from));

  const latest = observations.at(-1);
  const previous = observations.at(-2);
  const change =
    latest && previous ? latest.mean - previous.mean : null;

  let interpretation = "لا توجد قراءة كافية للتفسير.";
  if (latest) {
    if (latest.mean < 0.2) {
      interpretation =
        "قيمة الغطاء النباتي منخفضة في هذه الفترة؛ قد تعكس تربة مكشوفة أو نباتًا قليل الكثافة أو مرحلة نمو مبكرة.";
    } else if (latest.mean < 0.4) {
      interpretation =
        "إشارة غطاء نباتي منخفضة إلى متوسطة. قارنها بنوع المحصول ومرحلة نموه.";
    } else if (latest.mean < 0.6) {
      interpretation =
        "إشارة غطاء نباتي متوسطة إلى جيدة. تابع تغيرها في الفترات التالية.";
    } else {
      interpretation =
        "إشارة غطاء نباتي كثيفة نسبيًا. هذا لا يؤكد وحده خلو النبات من الأمراض أو الإجهاد.";
    }
  }

  return {
    status: response.status ?? "UNKNOWN",
    geometryPixelCount: response.geometryPixelCount ?? 0,
    observations,
    latestMean: latest?.mean ?? null,
    previousMean: previous?.mean ?? null,
    change,
    latestDate: latest?.to ?? null,
    interpretation,
    source: "Copernicus Data Space Ecosystem · Sentinel-2 L2A",
    resolutionMeters: 10,
    index: "NDVI",
  };
}

export async function POST(request: NextRequest) {
  const clientId = process.env.CDSE_CLIENT_ID;
  const clientSecret = process.env.CDSE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: "خدمة تحليل Sentinel-2 غير مهيأة بعد.",
        code: "CDSE_NOT_CONFIGURED",
        setup:
          "أضف CDSE_CLIENT_ID وCDSE_CLIENT_SECRET إلى ملف .env.local ثم أعد تشغيل الموقع.",
      },
      { status: 503 }
    );
  }

  let body: {
    fieldName?: string;
    coordinates?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "صيغة الطلب غير صحيحة." },
      { status: 400 }
    );
  }

  if (
    !Array.isArray(body.coordinates) ||
    body.coordinates.length < 3 ||
    body.coordinates.length > 500 ||
    !body.coordinates.every(isValidCoordinate)
  ) {
    return NextResponse.json(
      {
        error:
          "حدود الحقل غير صالحة. يلزم وجود 3 نقاط على الأقل بإحداثيات صحيحة.",
      },
      { status: 400 }
    );
  }

  const ring = closeRing(body.coordinates as [number, number][]);
  const coordinates = ring.map(([latitude, longitude]) => [
    longitude,
    latitude,
  ]);

  const now = new Date();
  const to = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);

  const isoDay = (date: Date) =>
    date.toISOString().slice(0, 10) + "T00:00:00Z";

  const evalscript = `//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B04", "B08", "SCL", "dataMask"]
    }],
    output: [
      { id: "data", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}

function evaluatePixel(samples) {
  var denominator = samples.B08 + samples.B04;
  var validNdvi = denominator !== 0 ? 1 : 0;
  var validScene = 1;

  // Exclude water, cloud shadow, clouds, cirrus and snow classes.
  if (
    samples.SCL === 3 ||
    samples.SCL === 6 ||
    samples.SCL === 8 ||
    samples.SCL === 9 ||
    samples.SCL === 10 ||
    samples.SCL === 11
  ) {
    validScene = 0;
  }

  var ndvi = validNdvi
    ? (samples.B08 - samples.B04) / denominator
    : 0;

  return {
    data: [ndvi],
    dataMask: [samples.dataMask * validNdvi * validScene]
  };
}`;

  const statsRequest = {
    input: {
      bounds: {
        geometry: {
          type: "Polygon",
          coordinates: [coordinates],
        },
        properties: { crs: WGS84 },
      },
      data: [
        {
          type: "sentinel-2-l2a",
          dataFilter: {
            mosaickingOrder: "leastCC",
            maxCloudCoverage: 60,
          },
        },
      ],
    },
    aggregation: {
      timeRange: {
        from: isoDay(from),
        to: isoDay(to),
      },
      aggregationInterval: { of: "P10D" },
      evalscript,
      resx: 10,
      resy: 10,
    },
  };

  try {
    const accessToken = await getAccessToken(clientId, clientSecret);

    const response = await fetch(STATISTICS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(statsRequest),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Sentinel Hub Statistics API error:", response.status, detail);

      if (response.status === 401 || response.status === 403) {
        cachedToken = null;
      }

      return NextResponse.json(
        {
          error:
            response.status === 429
              ? "تم الوصول إلى حد الطلبات مؤقتًا. حاول لاحقًا."
              : "تعذر تحليل صور Sentinel-2 لهذه الحدود حاليًا.",
          code: "SENTINEL_HUB_ERROR",
          providerStatus: response.status,
        },
        { status: response.status === 429 ? 429 : 502 }
      );
    }

    const raw = (await response.json()) as StatsResponse;
    const result = summarize(raw);

    if (result.observations.length === 0) {
      return NextResponse.json(
        {
          ...result,
          error:
            "لم تتوفر مشاهد صالحة لهذا الحقل والفترة. قد تكون المساحة صغيرة أو مغطاة بالغيوم أو لا توجد تغطية حديثة.",
          code: "NO_VALID_SCENES",
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      fieldName: body.fieldName ?? "حقل غير مسمى",
      period: { from: isoDay(from), to: isoDay(to) },
      ...result,
    });
  } catch (error) {
    console.error("NDVI analysis failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "حدث خطأ غير متوقع أثناء تحليل البيانات.",
        code: "NDVI_REQUEST_FAILED",
      },
      { status: 502 }
    );
  }
}
