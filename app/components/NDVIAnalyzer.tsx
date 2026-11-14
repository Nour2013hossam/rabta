"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Satellite,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

type FieldForNDVI = {
  id: number;
  name: string;
  crop: string;
  coords?: [number, number][];
};

type Observation = {
  from: string;
  to: string;
  mean: number;
  min: number;
  max: number;
  standardDeviation: number;
  validPixels: number;
  noDataPixels: number;
  validCoveragePercent: number;
};

type NDVIResult = {
  fieldName: string;
  period: { from: string; to: string };
  source: string;
  resolutionMeters: number;
  index: string;
  status: string;
  geometryPixelCount: number;
  observations: Observation[];
  latestMean: number | null;
  previousMean: number | null;
  change: number | null;
  latestDate: string | null;
  interpretation: string;
  error?: string;
  code?: string;
};

function dateLabel(value: string) {
  if (!value) return "غير متاح";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function chartPath(points: Observation[]) {
  if (points.length === 0) return "";
  const width = 480;
  const height = 126;
  const padding = 12;

  return points
    .map((point, index) => {
      const x =
        points.length === 1
          ? width / 2
          : padding + (index / (points.length - 1)) * (width - padding * 2);
      const value = Math.max(-1, Math.min(1, point.mean));
      const y = height - padding - ((value + 1) / 2) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function chartArea(points: Observation[]) {
  const line = chartPath(points);
  if (!line) return "";
  return `${line} L 468 114 L 12 114 Z`;
}

export default function NDVIAnalyzer({ field }: { field: FieldForNDVI }) {
  const [result, setResult] = useState<NDVIResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const line = useMemo(
    () => (result ? chartPath(result.observations) : ""),
    [result]
  );
  const area = useMemo(
    () => (result ? chartArea(result.observations) : ""),
    [result]
  );

  async function analyze() {
    if (!field.coords || field.coords.length < 3) {
      setError("هذا الحقل لا يحتوي على حدود جغرافية. ارسم حدوده أولًا على الخريطة.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/ndvi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldName: field.name,
          coordinates: field.coords,
        }),
      });

      const data = (await response.json()) as NDVIResult;

      if (!response.ok) {
        if (data.code === "CDSE_NOT_CONFIGURED") {
          setError(
            "خدمة Copernicus لم تُجهّز بعد. أضف بيانات OAuth إلى .env.local كما هو موضح في تعليمات الإعداد."
          );
        } else {
          setError(data.error || "تعذر إتمام التحليل.");
        }
        return;
      }

      if (data.error && data.observations.length === 0) {
        setResult(data);
        setError(data.error);
        return;
      }

      setResult(data);
    } catch {
      setError("تعذر الاتصال بخادم نَبْتَة. تأكد من تشغيل الموقع واتصال الإنترنت.");
    } finally {
      setLoading(false);
    }
  }

  const trend = result?.change;
  const trendLabel =
    trend === null || trend === undefined
      ? "لا توجد مقارنة بعد"
      : `${trend > 0 ? "+" : ""}${trend.toFixed(3)} مقارنة بالفترة السابقة`;

  return (
    <section className="panel ndvi-panel">
      <div className="ndvi-header">
        <div className="ndvi-title">
          <div className="ndvi-icon"><Satellite size={21} /></div>
          <div>
            <span className="eyebrow">استشعار عن بُعد · Sentinel-2</span>
            <h3>تحليل الغطاء النباتي NDVI</h3>
            <p>تحليل انعكاس الأحمر وتحت الأحمر القريب داخل حدود الحقل</p>
          </div>
        </div>
        <button
          type="button"
          className="button button-primary"
          onClick={analyze}
          disabled={loading}
        >
          {loading ? <span className="ndvi-spinner" /> : <Sparkles size={16} />}
          {loading ? "جاري التحليل..." : "حلّل الحقل"}
        </button>
      </div>

      <div className="ndvi-field-strip">
        <span>الحقل المختار</span>
        <strong>{field.name}</strong>
        <span className="ndvi-crop">{field.crop}</span>
      </div>

      {!result && !error && !loading && (
        <div className="ndvi-empty">
          <div className="ndvi-empty-icon"><Satellite size={27} /></div>
          <b>اكتشف تغير الغطاء النباتي في أرضك</b>
          <p>
            اضغط «حلّل الحقل» لجلب إحصائيات Sentinel-2 خلال آخر 90 يومًا متاحة
            تقريبًا، مع تجميع زمني كل 10 أيام.
          </p>
        </div>
      )}

      {loading && (
        <div className="ndvi-loading-state">
          <span className="ndvi-spinner large" />
          <b>نحلّل صور الأقمار الصناعية...</b>
          <small>قد يستغرق الطلب بعض الوقت حسب توافر المشاهد وحجم الحقل.</small>
        </div>
      )}

      {error && !loading && (
        <div className="ndvi-error">
          <TriangleAlert size={19} />
          <div>
            <b>لم يكتمل التحليل</b>
            <p>{error}</p>
          </div>
        </div>
      )}

      {result && result.observations.length > 0 && (
        <>
          <div className="ndvi-summary-grid">
            <div className="ndvi-stat primary-stat">
              <span>أحدث متوسط NDVI</span>
              <strong>{result.latestMean?.toFixed(3)}</strong>
              <small>{dateLabel(result.latestDate ?? "")}</small>
            </div>
            <div className="ndvi-stat">
              <span>التغير عن الفترة السابقة</span>
              <strong className={trend === null ? "" : trend >= 0 ? "positive" : "negative"}>
                {trend === null ? "—" : trend.toFixed(3)}
              </strong>
              <small>{trendLabel}</small>
            </div>
            <div className="ndvi-stat">
              <span>عدد الفترات الصالحة</span>
              <strong>{result.observations.length}</strong>
              <small>تجميع كل 10 أيام</small>
            </div>
            <div className="ndvi-stat">
              <span>دقة التحليل المكانية</span>
              <strong>{result.resolutionMeters} م</strong>
              <small>حزمة Sentinel-2 المستخدمة</small>
            </div>
          </div>

          <div className="ndvi-chart-wrap">
            <div className="ndvi-chart-heading">
              <div>
                <b>تغير مؤشر NDVI عبر الزمن</b>
                <small>من -1 إلى +1 · متوسط البكسلات الصالحة</small>
              </div>
              <span className="ndvi-series-label"><i /> NDVI</span>
            </div>
            <div className="ndvi-chart">
              <div className="ndvi-y-labels">
                <span>+1.0</span><span>0.0</span><span>-1.0</span>
              </div>
              <svg viewBox="0 0 480 126" preserveAspectRatio="none" role="img" aria-label="رسم تغير مؤشر NDVI">
                <defs>
                  <linearGradient id="ndviFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7f9b50" stopOpacity=".28" />
                    <stop offset="100%" stopColor="#7f9b50" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M12 12 H468 M12 63 H468 M12 114 H468" stroke="#e9eee5" strokeDasharray="4 5" fill="none" />
                <path d={area} fill="url(#ndviFill)" />
                <path d={line} stroke="#718846" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                {result.observations.map((point, index) => {
                  const x = result.observations.length === 1 ? 240 : 12 + (index / (result.observations.length - 1)) * 456;
                  const value = Math.max(-1, Math.min(1, point.mean));
                  const y = 114 - ((value + 1) / 2) * 102;
                  return <circle key={point.from || index} cx={x} cy={y} r="4" fill="#718846" stroke="#fff" strokeWidth="2" />;
                })}
              </svg>
            </div>
            <div className="ndvi-x-labels">
              <span>{dateLabel(result.observations[0]?.from ?? "")}</span>
              <span>{dateLabel(result.observations.at(-1)?.to ?? "")}</span>
            </div>
          </div>

          <div className="ndvi-interpretation">
            <Sparkles size={18} />
            <div>
              <b>قراءة المؤشر</b>
              <p>{result.interpretation}</p>
            </div>
          </div>

          <div className="ndvi-source">
            <span>المصدر: {result.source}</span>
            <span>نسبة التغطية الصالحة في أحدث فترة: {result.observations.at(-1)?.validCoveragePercent ?? 0}%</span>
          </div>
        </>
      )}

      <div className="ndvi-disclaimer">
        <b>مهم:</b> NDVI مؤشر للغطاء النباتي وليس تشخيصًا للأمراض أو قياسًا مباشرًا للإنتاجية. تتأثر القراءة بنوع المحصول ومرحلة النمو والري والتربة والغيوم. لا تستخدمه وحده لاتخاذ قرار ري أو علاج.
      </div>
    </section>
  );
}
