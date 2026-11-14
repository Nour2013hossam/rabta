"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowDownLeft, ArrowUpLeft, Bell, Camera, Check, ChevronDown,
  CloudSun, Droplets, FileDown, FlaskConical, Leaf, Map, MessageCircle, Satellite,
  Plus, Search, Send, Settings, ShieldCheck, Sprout, Thermometer,
  Upload, Wind, X, ScanLine, LayoutDashboard, Wheat
} from "lucide-react";

import NDVIAnalyzer from "./components/NDVIAnalyzer";

const FarmMap = dynamic(() => import("./components/FarmMap"), {
  ssr: false,
  loading: () => <div className="map-loading">جارٍ تجهيز الخريطة...</div>,
});

type Field = { id: number; name: string; crop: string; area: string; health: number; moisture: number; temperature: number; ph: number; status: string; demo?: boolean; coords?: [number, number][] };

const initialFields: Field[] = [
  { id: 1, name: "قطعة الطماطم", crop: "طماطم", area: "12.4 فدان", health: 87, moisture: 68, temperature: 28, ph: 6.4, status: "جيدة", demo: true, coords: [[30.790,30.987],[30.793,31.002],[30.782,31.008],[30.778,30.992]] },
  { id: 2, name: "قطعة القمح", crop: "قمح", area: "8.2 فدان", health: 94, moisture: 72, temperature: 26, ph: 6.8, status: "ممتازة", demo: true, coords: [[30.806,31.006],[30.809,31.021],[30.797,31.026],[30.793,31.011]] },
  { id: 3, name: "قطعة الذرة", crop: "ذرة", area: "6.7 فدان", health: 73, moisture: 49, temperature: 31, ph: 5.9, status: "تحتاج متابعة", demo: true, coords: [[30.784,31.012],[30.788,31.027],[30.775,31.033],[30.770,31.017]] },
];

const navItems = [
  { label: "لوحة التحكم", icon: LayoutDashboard },
  { label: "خريطة المزرعة", icon: Map },
  { label: "تشخيص النباتات", icon: ScanLine },
  { label: "حالة التربة", icon: Droplets },
  { label: "الطقس", icon: CloudSun },
  { label: "مساعد نَبْتَة", icon: MessageCircle },
  { label: "تحليل الأقمار الصناعية", icon: Satellite },
];

export default function Home() {
  const [fields, setFields] = useState<Field[]>(initialFields);
  const [storageReady, setStorageReady] = useState(false);
  const [selectedId, setSelectedId] = useState(1);
  const [activeNav, setActiveNav] = useState("لوحة التحكم");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCrop, setNewCrop] = useState("طماطم");
  const [newArea, setNewArea] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageName, setImageName] = useState("");
  const [scanResult, setScanResult] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", text: "أهلاً بيك! أنا مساعد نَبْتَة 🌱 اسألني عن المحاصيل أو التربة أو طرق العناية بالنباتات." }]);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("nabta.fields");
      if (saved) {
        const parsed = JSON.parse(saved) as Field[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setFields(parsed);
          setSelectedId(parsed[0].id);
        }
      }
    } catch {
      setNotice("تعذر استرجاع الحقول المحفوظة؛ سنستخدم بيانات العرض الافتراضية.");
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem("nabta.fields", JSON.stringify(fields));
    } catch {
      setNotice("تعذر حفظ البيانات محليًا على هذا المتصفح.");
    }
  }, [fields, storageReady]);
  const selected = fields.find((field) => field.id === selectedId) ?? fields[0];
  const filteredFields = useMemo(() => fields.filter((field) => field.name.includes(search) || field.crop.includes(search)), [fields, search]);

  function addField(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newName.trim() || !newArea.trim()) return;
    const nextId = Math.max(...fields.map((field) => field.id), 0) + 1;
    const field: Field = { id: nextId, name: newName, crop: newCrop, area: newArea + " فدان", health: 85, moisture: 65, temperature: 27, ph: 6.5, status: "جيدة" };
    setFields((current) => [...current, field]);
    setSelectedId(nextId);
    setShowAdd(false);
    setNewName("");
    setNewArea("");
    setNotice("تمت إضافة الحقل إلى العرض التجريبي");
  }

  function createFieldFromMap(coords: [number, number][], areaFeddans: number, suggestedName: string, suggestedCrop: string) {
    const nextId = Math.max(...fields.map((field) => field.id), 0) + 1;
    const area = Math.max(areaFeddans, 0.01);
    const field: Field = {
      id: nextId,
      name: suggestedName || `قطعة جديدة ${nextId}`,
      crop: suggestedCrop || "غير محدد",
      area: `${area.toFixed(2)} فدان تقريبًا`,
      health: 0,
      moisture: 0,
      temperature: 0,
      ph: 0,
      status: "البيانات الزراعية غير متاحة",
      coords,
    };
    setFields((current) => [...current, field]);
    setSelectedId(nextId);
    setNotice("تم حفظ حدود الحقل ومساحته التقريبية. أضف بيانات المحصول والقياسات لاحقًا.");
  }

  function handleImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setNotice("من فضلك اختار صورة بصيغة صحيحة"); return; }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    setImageName(file.name);
    setScanResult("");
    setActiveNav("تشخيص النباتات");
  }

  function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatInput.trim()) return;
    const question = chatInput.trim();
    setMessages((current) => [...current, { role: "user", text: question }, { role: "assistant", text: "أقدر أساعدك في فهم المؤشرات الزراعية واقتراح خطوات عامة. للحصول على تشخيص دقيق، شاركني نوع المحصول وصورة واضحة والأعراض الظاهرة. (هذه نسخة تجريبية؛ لم يتم ربط نموذج ذكاء اصطناعي بعد)." }]);
    setChatInput("");
  }

  function exportFields() {
    const rows = [["اسم الحقل","المحصول","المساحة","صحة المحصول","رطوبة التربة","الحرارة","pH","عدد نقاط الحدود"], ...fields.map((f) => [f.name,f.crop,f.area,String(f.health),String(f.moisture),String(f.temperature),String(f.ph),String(f.coords?.length ?? 0)])];
    const csv = "\uFEFF" + rows.map((row) => row.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = "nabta-fields.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Sprout size={25} /></div><span>نَبْتَة</span></div>
        <div className="side-caption">القائمة الرئيسية</div>
        <nav className="side-nav">
          {navItems.map(({ label, icon: Icon }) => (
            <button key={label} className={activeNav === label ? "nav-item active" : "nav-item"} onClick={() => setActiveNav(label)}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="nav-item"><Settings size={19}/><span>الإعدادات</span></button>
          <div className="profile-mini"><div className="avatar">N</div><div><b>مزرعتي</b><small>الحساب الشخصي</small></div><ChevronDown size={15}/></div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div className="welcome"><div className="eyebrow">لوحة تحكم تجريبية <span className="live-dot" /></div><h1>مرحباً بك في نَبْتَة 👋</h1><p>كل تفاصيل مزرعتك، في مكان واحد.</p></div>
          <div className="top-actions">
            <div className="search-box"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن حقل أو محصول..." /></div>
            <button className="icon-button" aria-label="الإشعارات" onClick={() => setNotice("لا توجد إشعارات جديدة حالياً")}><Bell size={19}/><i/></button>
            <button className="user-chip"><span className="avatar">N</span><span><b>مزرعتي</b><small>الحساب الشخصي</small></span><ChevronDown size={15}/></button>
          </div>
        </header>

        <div className="section-heading">
          <div><span className="eyebrow">استكشف أراضيك</span><h2>الخريطة الزراعية الذكية</h2></div>
          <div className="heading-actions">
            <button className="button button-light" onClick={exportFields}><FileDown size={16}/> تصدير</button>
            <button className="button button-primary" onClick={() => setShowAdd(true)}><Plus size={17}/> إضافة حقل</button>
          </div>
        </div>

        <div className="dashboard-grid">
          <section className="map-panel panel">
            <div className="map-top-search"><Search size={16}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن موقع أو حقل..." /></div>
            <FarmMap activeField={selectedId} fields={fields} onSelectField={setSelectedId} onCreateField={createFieldFromMap} onNotify={setNotice}/>
            <div className="map-label"><span className="live-dot"/> صور أقمار صناعية / OpenStreetMap</div>
            <div className="map-selected-card">
              <div className="selected-head"><span className="crop-tag">{selected.crop}</span><b>{selected.name}</b><span className="health-dot"/></div>
              <div className="selected-area"><span>المساحة</span><b>{selected.area}</b></div>
              <div className="health-row"><span>صحة المحصول</span><b>{selected.health}%</b></div>
              <div className="progress"><i style={{width: selected.health + "%"}}/></div>
              <div className="card-divider"/>
              <div className="selected-head"><b><Activity size={15}/> ملخص بيانات الحقل</b><span className="muted">مؤشرات توضيحية</span></div>
              <div className="data-line"><span>رطوبة التربة</span><b>{selected.moisture}%</b></div>
              <div className="data-line"><span>درجة الحرارة</span><b>{selected.temperature}°C</b></div>
              <div className="data-line"><span>المحصول</span><b>{selected.crop}</b></div>
            </div>
          </section>

          <section className="left-column">
            <div className="panel farm-summary">
              <div className="panel-title"><div><span className="eyebrow">نظرة عامة</span><h3>أداء مزرعتك</h3></div><div className="summary-icon"><Sprout size={22}/></div></div>
              <b className="farm-name">مزرعتي الرئيسية</b><p className="muted">منطقة تجريبية · دلتا النيل</p>
              <div className="summary-stats"><div><b>{fields.length}</b><span>حقول مسجلة</span></div><div><b>{(fields.reduce((n,f)=>n+Number.parseFloat(f.area),0)).toFixed(1)}</b><span>فدان تجريبي</span></div><div><b>{Math.round(fields.reduce((n,f)=>n+f.health,0)/fields.length)}%</b><span>صحة الحقول</span></div></div>
            </div>
            <div className="metrics-grid">
              <Metric icon={<Thermometer/>} label="درجة الحرارة" value={selected.temperature + "°"} unit="C" note="قراءة توضيحية" tone="blue"/>
              <Metric icon={<Droplets/>} label="رطوبة التربة" value={String(selected.moisture)} unit="%" note="قراءة توضيحية" tone="olive"/>
              <Metric icon={<FlaskConical/>} label="درجة الحموضة" value={String(selected.ph)} unit="pH" note="قيمة تجريبية" tone="orange"/>
              <Metric icon={<Leaf/>} label="صحة المحصول" value={String(selected.health)} unit="%" note={selected.status} tone="green"/>
            </div>
            <div className="panel field-list">
              <div className="panel-title"><div><span className="eyebrow">إدارة الأراضي</span><h3>حقولك الزراعية</h3></div><button className="text-button" onClick={() => setActiveNav("خريطة المزرعة")}>عرض الخريطة <ArrowDownLeft size={15}/></button></div>
              {filteredFields.map((field) => <button className={selectedId === field.id ? "field-row chosen" : "field-row"} key={field.id} onClick={() => setSelectedId(field.id)}><span className="field-icon"><Wheat size={18}/></span><span className="field-info"><b>{field.name}</b><small>{field.crop} · {field.area}</small></span><span className="field-health">{field.health}%</span><ArrowUpLeft size={15}/></button>)}
              {filteredFields.length === 0 && <p className="empty-state">لا توجد حقول تطابق البحث.</p>}
            </div>
          </section>
        </div>

        <div className="bottom-grid">
          <section className="panel weather-panel">
            <div className="panel-title"><div><span className="eyebrow">حالة الجو</span><h3>الطقس الزراعي</h3></div><CloudSun size={22} className="weather-icon"/></div>
            <div className="weather-main"><CloudSun size={48}/><div><b>28°</b><span>مشمس جزئياً</span></div></div>
            <div className="weather-details"><span><Droplets size={15}/> رطوبة الجو <b>54%</b></span><span><Wind size={15}/> سرعة الرياح <b>12 كم/س</b></span></div>
            <small className="demo-note">بيانات واجهة تجريبية · تحتاج ربط خدمة طقس مباشرة</small>
          </section>
          <section className="panel soil-panel">
            <div className="panel-title"><div><span className="eyebrow">مؤشرات التربة</span><h3>ملخص حالة التربة</h3></div><Droplets size={21} className="olive-text"/></div>
            <div className="soil-score"><b>{selected.moisture}%</b><span>مستوى الرطوبة</span></div>
            <div className="progress large"><i style={{width:selected.moisture+"%"}}/></div>
            <p className="soil-hint">{selected.moisture < 55 ? "الرطوبة منخفضة نسبياً؛ راجع احتياج المحصول للري." : "مستوى الرطوبة ضمن النطاق التجريبي المعروض."}</p>
          </section>
          <section className="panel assistant-panel">
            <div className="panel-title"><div><span className="eyebrow">رفيقك الزراعي</span><h3>مساعد نَبْتَة الذكي</h3></div><div className="ai-spark">✳</div></div>
            <div className="assistant-message"><span className="assistant-avatar"><Sprout size={17}/></span><p>أهلاً! أقدر أساعدك تفهم بيانات حقلك وتتعرف على أفضل ممارسات العناية بالمحاصيل.</p></div>
            <button className="button button-ai" onClick={() => setActiveNav("مساعد نَبْتَة")}>ابدأ محادثة <ArrowDownLeft size={16}/></button>
          </section>
        </div>

        {activeNav === "تشخيص النباتات" && <section className="panel scan-workspace">
          <div className="panel-title"><div><span className="eyebrow">رؤية حاسوبية</span><h3>تشخيص النباتات بالصور</h3></div><ScanLine size={22}/></div>
          <p className="muted">التقط صورة أو ارفع صورة واضحة للورقة أو الثمرة. التحليل الذكي الفعلي سيتم تفعيله بعد ربط نموذج متخصص.</p>
          <div className="upload-actions"><button className="button button-primary" onClick={() => cameraRef.current?.click()}><Camera size={17}/> افتح الكاميرا</button><button className="button button-light" onClick={() => fileRef.current?.click()}><Upload size={17}/> ارفع صورة</button></div>
          <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(e)=>handleImage(e.target.files?.[0])}/>
          <input ref={fileRef} hidden type="file" accept="image/*" onChange={(e)=>handleImage(e.target.files?.[0])}/>
          {imageUrl && <div className="preview-box"><img src={imageUrl} alt="الصورة المختارة للنبات"/><div><b>{imageName}</b><p className="muted">الصورة جاهزة للربط بخدمة التشخيص.</p><button className="button button-primary" onClick={()=>setScanResult("تم استلام الصورة بنجاح. لم يتم إجراء تشخيص طبي/زراعي آلي بعد؛ اربط نموذج الرؤية الحاسوبية لعرض النتيجة.")}>تحليل الصورة <ScanLine size={16}/></button></div></div>}
          {scanResult && <div className="notice-inline">{scanResult}</div>}
        </section>}

        {activeNav === "مساعد نَبْتَة" && <section className="panel chat-workspace">
          <div className="panel-title"><div><span className="eyebrow">اسأل نَبْتَة</span><h3>المساعد الزراعي</h3></div><MessageCircle size={22}/></div>
          <div className="chat-messages">{messages.map((message,index)=><div key={index} className={"chat-bubble "+message.role}>{message.text}</div>)}</div>
          <form className="chat-form" onSubmit={sendMessage}><input value={chatInput} onChange={(e)=>setChatInput(e.target.value)} placeholder="اكتب سؤالك عن المحصول أو التربة..."/><button className="send-button" aria-label="إرسال"><Send size={18}/></button></form>
          <small className="demo-note">المحادثة الحالية نموذج واجهة؛ لم يتم ربط مزود ذكاء اصطناعي بعد.</small>
        </section>}

        <NDVIAnalyzer field={selected} />

        <footer className="footer"><span>© 2026 نَبْتَة · نزرع معرفة لمستقبل أخضر</span><span><ShieldCheck size={14}/> نسخة أولية قيد التطوير</span></footer>
      </section>

      {showAdd && <div className="modal-backdrop" onClick={()=>setShowAdd(false)}><form className="modal" onSubmit={addField} onClick={(e)=>e.stopPropagation()}><div className="modal-head"><h3>إضافة حقل جديد</h3><button type="button" className="icon-button" onClick={()=>setShowAdd(false)}><X size={18}/></button></div><label>اسم الحقل<input required value={newName} onChange={(e)=>setNewName(e.target.value)} placeholder="مثال: الحقل الشرقي"/></label><label>نوع المحصول<select value={newCrop} onChange={(e)=>setNewCrop(e.target.value)}><option>طماطم</option><option>قمح</option><option>ذرة</option><option>بطاطس</option><option>أرز</option><option>خيار</option></select></label><label>المساحة بالفدان<input required type="number" min="0.1" step="0.1" value={newArea} onChange={(e)=>setNewArea(e.target.value)} placeholder="مثال: 5"/></label><button className="button button-primary full-button" type="submit"><Plus size={17}/> إضافة الحقل</button><small className="demo-note">سيظهر الحقل في قائمة البيانات التجريبية. إضافة مضلع جغرافي مخصص قادمة.</small></form></div>}
      {notice && <button className="toast" onClick={()=>setNotice("")}><Check size={16}/>{notice}<X size={14}/></button>}
    </main>
  );
}

function Metric({icon,label,value,unit,note,tone}:{icon:React.ReactNode;label:string;value:string;unit:string;note:string;tone:string}) {
  return <div className="panel metric-card"><div className="metric-top"><span className={"metric-icon "+tone}>{icon}</span><span>{label}</span></div><div className="metric-value">{value}<small>{unit}</small></div><div className="metric-note">{note}</div></div>;
}
