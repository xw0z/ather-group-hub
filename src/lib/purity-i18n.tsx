// Global ATHER DESK i18n provider.
// Originally lived in `purity-i18n` but now powers the entire platform.
// All modules (Dashboard, Purity, Margin, Swap, Discount/Premium, Reports,
// Audit, Users, Settings) share this provider via `LanguageProvider` in
// `src/routes/__root.tsx`. Language is persisted globally in `swap_settings`
// and cached per-browser in localStorage for instant first paint.

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar" | "fr";

const STORAGE_KEY = "desk_lang";

type Dict = Record<string, string>;

const en: Dict = {
  // App chrome
  "app.name": "Purity",
  "app.tagline": "Gold purity & loss tracker",
  "app.loading": "Loading…",
  "app.signOut": "Sign out",
  "app.save": "Save",
  "app.saving": "Saving…",
  "app.cancel": "Cancel",
  "app.delete": "Delete",
  "app.back": "Back to dashboard",
  "app.prev": "← Prev",
  "app.next": "Next →",
  "app.page": "Page",
  "app.of": "of",

  // Tabs
  "tab.trips": "Trips",
  "tab.suppliers": "Suppliers",
  "tab.search": "Search bar",
  "tab.users": "Users",
  "tab.logs": "Logs",
  "tab.profile": "Profile",

  // Login
  "login.title": "Sign in",
  "login.subtitle": "Access is by invitation only. Contact the administrator if you need an account.",
  "login.username": "Username",
  "login.password": "Password",
  "login.usernamePh": "your username",
  "login.submit": "Sign in",
  "login.wait": "Please wait…",
  "login.enterCreds": "Enter your username and password.",
  "login.authFailed": "Authentication failed.",
  "login.footer": "Internal Ather Group tool · authorised personnel only",
  "login.tag": "Gold bar purity tracking",

  // Trips
  "trips.heading": "Trips",
  "trips.new": "New trip",
  "trips.none": "No trips yet. Create one to start logging gold bars.",
  "trips.createBtn": "Create trip",
  "trips.addBar": "Add bar",
  "trips.addAtLeastOne": "Add at least one gold bar.",
  "trips.confirmDelete": "Delete this trip and all its bars?",
  "trips.confirmSave": "Save changes to this trip?",
  "trips.departure": "Departure (Algeria)",
  "trips.receiver": "Receiver company (Dubai)",
  "trips.receiverPh": "e.g. Bafleh / Kaloti",
  "trips.notes": "Notes (optional)",
  "trips.tripName": "Trip name:",
  "trips.goldBars": "Gold bars (declared purity 999‰)",
  "trips.scrapSum": "Trip scrap weight (sum of bars)",
  "trips.tipBafleh": "Tip: leave Bafleh ‰ empty if the lab report hasn't arrived yet — you can fill it in later from the trip view.",
  "trips.weight": "Weight (g)",
  "trips.initial": "Initial ‰",
  "trips.bafleh": "Bafleh ‰",
  "trips.number": "#",
  "trips.supplier": "Supplier",
  "trips.arrival": "Arrival date (Dubai / Bafleh report)",
  "trips.bars": "Bars",
  "trips.noBars": "No bars yet.",
  "trips.tripsCount": "trips",

  // Status badges
  "status.settled": "Settled",
  "status.ready": "Ready to settle",
  "status.awaitingCheck": "Awaiting check",
  "status.awaitingBafleh": "Awaiting Bafleh",
  "status.suppliersDone": "Suppliers Done",
  "status.missingSupplier": "Missing Supplier",
  "status.dep": "Dep",
  "status.arr": "Arr",
  "status.scrap": "Scrap",
  "status.bars": "bars",
  "status.pure": "Pure",
  "status.loss": "Loss",

  // Stats
  "stat.barsTotal": "Bars total weight",
  "stat.pureBafleh": "Pure gold (Bafleh)",
  "stat.declaredPure": "Declared pure",
  "stat.totalLoss": "Total loss",

  // Table headers
  "tbl.weight": "Weight",
  "tbl.init": "Init ‰",
  "tbl.bafleh": "Bafleh ‰",
  "tbl.pure": "Pure",
  "tbl.supplier": "Supplier",
  "tbl.loss": "Loss",

  // Profile
  "profile.details": "Profile details",
  "profile.username": "Username",
  "profile.email": "Email",
  "profile.changePwd": "Change password",
  "profile.currentPwd": "Current password",
  "profile.newPwd": "New password",
  "profile.confirmPwd": "Confirm new password",
  "profile.updatePwd": "Update password",
  "profile.updatingPwd": "Updating…",
  "profile.pwdMin": "Password must be at least 6 characters.",
  "profile.pwdMismatch": "Passwords do not match.",
  "profile.pwdWrong": "Current password is incorrect.",
  "profile.pwdUpdated": "Password updated.",
  "profile.saved": "Profile saved.",
  "profile.saveFailed": "Failed to save.",
  "profile.linkedAccounts": "Linked accounts",
  "profile.google": "Google",
  "profile.connected": "Connected",
  "profile.notConnected": "Not connected",
  "profile.unlink": "Unlink",
  "profile.linkGoogle": "Link Google",
  "profile.opening": "Opening…",
  "profile.otherProviders": "Other providers:",
  "profile.none": "none",
  "profile.language": "Language",
  "profile.currentLang": "Current:",

  // Footer
  "footer.tag": "Gold purity & loss tracker",
};

const ar: Dict = {
  "app.name": "النقاء",
  "app.tagline": "متتبّع نقاء الذهب والخسائر",
  "app.loading": "جارٍ التحميل…",
  "app.signOut": "تسجيل الخروج",
  "app.save": "حفظ",
  "app.saving": "جارٍ الحفظ…",
  "app.cancel": "إلغاء",
  "app.delete": "حذف",
  "app.back": "العودة إلى لوحة التحكم",
  "app.prev": "→ السابق",
  "app.next": "التالي ←",
  "app.page": "صفحة",
  "app.of": "من",

  "tab.trips": "الرحلات",
  "tab.suppliers": "الموردون",
  "tab.search": "بحث السبائك",
  "tab.users": "المستخدمون",
  "tab.logs": "السجلات",
  "tab.profile": "الملف الشخصي",

  "login.title": "تسجيل الدخول",
  "login.subtitle": "الوصول بدعوة فقط. تواصل مع المسؤول إذا كنت بحاجة إلى حساب.",
  "login.username": "اسم المستخدم",
  "login.password": "كلمة المرور",
  "login.usernamePh": "اسم المستخدم الخاص بك",
  "login.submit": "تسجيل الدخول",
  "login.wait": "يرجى الانتظار…",
  "login.enterCreds": "أدخل اسم المستخدم وكلمة المرور.",
  "login.authFailed": "فشل المصادقة.",
  "login.footer": "أداة داخلية لمجموعة أثير · للمصرّح لهم فقط",
  "login.tag": "متابعة نقاء سبائك الذهب",

  "trips.heading": "الرحلات",
  "trips.new": "رحلة جديدة",
  "trips.none": "لا توجد رحلات بعد. أنشئ واحدة لبدء تسجيل سبائك الذهب.",
  "trips.createBtn": "إنشاء رحلة",
  "trips.addBar": "إضافة سبيكة",
  "trips.addAtLeastOne": "أضف سبيكة ذهب واحدة على الأقل.",
  "trips.confirmDelete": "حذف هذه الرحلة وجميع سبائكها؟",
  "trips.confirmSave": "حفظ التغييرات على هذه الرحلة؟",
  "trips.departure": "المغادرة (الجزائر)",
  "trips.receiver": "الشركة المستلمة (دبي)",
  "trips.receiverPh": "مثل: بافلح / كالوتي",
  "trips.notes": "ملاحظات (اختياري)",
  "trips.tripName": "اسم الرحلة:",
  "trips.goldBars": "سبائك الذهب (النقاء المعلن 999‰)",
  "trips.scrapSum": "وزن السكراب للرحلة (مجموع السبائك)",
  "trips.tipBafleh": "نصيحة: اترك بافلح ‰ فارغًا إذا لم يصل تقرير المختبر بعد — يمكنك ملؤه لاحقًا من صفحة الرحلة.",
  "trips.weight": "الوزن (جم)",
  "trips.initial": "الأولي ‰",
  "trips.bafleh": "بافلح ‰",
  "trips.number": "#",
  "trips.supplier": "المورد",
  "trips.arrival": "تاريخ الوصول (دبي / تقرير بافلح)",
  "trips.bars": "السبائك",
  "trips.noBars": "لا توجد سبائك بعد.",
  "trips.tripsCount": "رحلات",

  "status.settled": "تمت التسوية",
  "status.ready": "جاهز للتسوية",
  "status.awaitingCheck": "بانتظار التحقق",
  "status.awaitingBafleh": "بانتظار بافلح",
  "status.suppliersDone": "اكتمل الموردون",
  "status.missingSupplier": "مورد ناقص",
  "status.dep": "مغادرة",
  "status.arr": "وصول",
  "status.scrap": "سكراب",
  "status.bars": "سبائك",
  "status.pure": "نقي",
  "status.loss": "خسارة",

  "stat.barsTotal": "إجمالي وزن السبائك",
  "stat.pureBafleh": "الذهب النقي (بافلح)",
  "stat.declaredPure": "النقي المعلن",
  "stat.totalLoss": "إجمالي الخسارة",

  "tbl.weight": "الوزن",
  "tbl.init": "الأولي ‰",
  "tbl.bafleh": "بافلح ‰",
  "tbl.pure": "نقي",
  "tbl.supplier": "المورد",
  "tbl.loss": "الخسارة",

  "profile.details": "تفاصيل الملف الشخصي",
  "profile.username": "اسم المستخدم",
  "profile.email": "البريد الإلكتروني",
  "profile.changePwd": "تغيير كلمة المرور",
  "profile.currentPwd": "كلمة المرور الحالية",
  "profile.newPwd": "كلمة المرور الجديدة",
  "profile.confirmPwd": "تأكيد كلمة المرور الجديدة",
  "profile.updatePwd": "تحديث كلمة المرور",
  "profile.updatingPwd": "جارٍ التحديث…",
  "profile.pwdMin": "يجب أن تكون كلمة المرور 6 أحرف على الأقل.",
  "profile.pwdMismatch": "كلمتا المرور غير متطابقتين.",
  "profile.pwdWrong": "كلمة المرور الحالية غير صحيحة.",
  "profile.pwdUpdated": "تم تحديث كلمة المرور.",
  "profile.saved": "تم حفظ الملف الشخصي.",
  "profile.saveFailed": "فشل الحفظ.",
  "profile.linkedAccounts": "الحسابات المرتبطة",
  "profile.google": "غوغل",
  "profile.connected": "متصل",
  "profile.notConnected": "غير متصل",
  "profile.unlink": "إلغاء الربط",
  "profile.linkGoogle": "ربط غوغل",
  "profile.opening": "جارٍ الفتح…",
  "profile.otherProviders": "مزودون آخرون:",
  "profile.none": "لا شيء",
  "profile.language": "اللغة",
  "profile.currentLang": "الحالية:",

  "footer.tag": "متتبّع نقاء الذهب والخسائر",
};

const fr: Dict = {
  "app.name": "Purity",
  "app.tagline": "Suivi de la pureté et des pertes d'or",
  "app.loading": "Chargement…",
  "app.signOut": "Déconnexion",
  "app.save": "Enregistrer",
  "app.saving": "Enregistrement…",
  "app.cancel": "Annuler",
  "app.delete": "Supprimer",
  "app.back": "Retour au tableau de bord",
  "app.prev": "← Préc.",
  "app.next": "Suiv. →",
  "app.page": "Page",
  "app.of": "sur",

  "tab.trips": "Voyages",
  "tab.suppliers": "Fournisseurs",
  "tab.search": "Recherche barre",
  "tab.users": "Utilisateurs",
  "tab.logs": "Journaux",
  "tab.profile": "Profil",

  "login.title": "Connexion",
  "login.subtitle": "L'accès se fait uniquement sur invitation. Contactez l'administrateur si vous avez besoin d'un compte.",
  "login.username": "Nom d'utilisateur",
  "login.password": "Mot de passe",
  "login.usernamePh": "votre nom d'utilisateur",
  "login.submit": "Se connecter",
  "login.wait": "Veuillez patienter…",
  "login.enterCreds": "Saisissez votre nom d'utilisateur et mot de passe.",
  "login.authFailed": "Échec de l'authentification.",
  "login.footer": "Outil interne Ather Group · personnel autorisé uniquement",
  "login.tag": "Suivi de la pureté des lingots d'or",

  "trips.heading": "Voyages",
  "trips.new": "Nouveau voyage",
  "trips.none": "Aucun voyage. Créez-en un pour commencer à enregistrer les lingots.",
  "trips.createBtn": "Créer le voyage",
  "trips.addBar": "Ajouter un lingot",
  "trips.addAtLeastOne": "Ajoutez au moins un lingot d'or.",
  "trips.confirmDelete": "Supprimer ce voyage et tous ses lingots ?",
  "trips.confirmSave": "Enregistrer les modifications de ce voyage ?",
  "trips.departure": "Départ (Algérie)",
  "trips.receiver": "Société destinataire (Dubaï)",
  "trips.receiverPh": "ex. Bafleh / Kaloti",
  "trips.notes": "Notes (facultatif)",
  "trips.tripName": "Nom du voyage :",
  "trips.goldBars": "Lingots d'or (pureté déclarée 999‰)",
  "trips.scrapSum": "Poids brut du voyage (somme des lingots)",
  "trips.tipBafleh": "Astuce : laissez Bafleh ‰ vide si le rapport du labo n'est pas encore arrivé — vous pourrez le compléter depuis la fiche du voyage.",
  "trips.weight": "Poids (g)",
  "trips.initial": "Initial ‰",
  "trips.bafleh": "Bafleh ‰",
  "trips.number": "#",
  "trips.supplier": "Fournisseur",
  "trips.arrival": "Date d'arrivée (Dubaï / rapport Bafleh)",
  "trips.bars": "Lingots",
  "trips.noBars": "Aucun lingot.",
  "trips.tripsCount": "voyages",

  "status.settled": "Réglé",
  "status.ready": "Prêt à régler",
  "status.awaitingCheck": "En attente de vérification",
  "status.awaitingBafleh": "En attente Bafleh",
  "status.suppliersDone": "Fournisseurs OK",
  "status.missingSupplier": "Fournisseur manquant",
  "status.dep": "Dép.",
  "status.arr": "Arr.",
  "status.scrap": "Brut",
  "status.bars": "lingots",
  "status.pure": "Pur",
  "status.loss": "Perte",

  "stat.barsTotal": "Poids total des lingots",
  "stat.pureBafleh": "Or pur (Bafleh)",
  "stat.declaredPure": "Pur déclaré",
  "stat.totalLoss": "Perte totale",

  "tbl.weight": "Poids",
  "tbl.init": "Init ‰",
  "tbl.bafleh": "Bafleh ‰",
  "tbl.pure": "Pur",
  "tbl.supplier": "Fournisseur",
  "tbl.loss": "Perte",

  "profile.details": "Détails du profil",
  "profile.username": "Nom d'utilisateur",
  "profile.email": "E-mail",
  "profile.changePwd": "Changer le mot de passe",
  "profile.currentPwd": "Mot de passe actuel",
  "profile.newPwd": "Nouveau mot de passe",
  "profile.confirmPwd": "Confirmer le nouveau mot de passe",
  "profile.updatePwd": "Mettre à jour",
  "profile.updatingPwd": "Mise à jour…",
  "profile.pwdMin": "Le mot de passe doit contenir au moins 6 caractères.",
  "profile.pwdMismatch": "Les mots de passe ne correspondent pas.",
  "profile.pwdWrong": "Le mot de passe actuel est incorrect.",
  "profile.pwdUpdated": "Mot de passe mis à jour.",
  "profile.saved": "Profil enregistré.",
  "profile.saveFailed": "Échec de l'enregistrement.",
  "profile.linkedAccounts": "Comptes liés",
  "profile.google": "Google",
  "profile.connected": "Connecté",
  "profile.notConnected": "Non connecté",
  "profile.unlink": "Délier",
  "profile.linkGoogle": "Lier Google",
  "profile.opening": "Ouverture…",
  "profile.otherProviders": "Autres fournisseurs :",
  "profile.none": "aucun",
  "profile.language": "Langue",
  "profile.currentLang": "Actuelle :",

  "footer.tag": "Suivi de la pureté et des pertes d'or",
};

const dicts: Record<Lang, Dict> = { en, ar, fr };

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  dir: "ltr" | "rtl";
};

const LangCtx = createContext<Ctx | null>(null);

export function readStoredLang(): Lang {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "ar" || v === "fr" ? v : "en";
}

export function PurityLanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStoredLang());

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  // Sync across tabs and across components in the same tab
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setLangState(readStoredLang());
    };
    const onCustom = () => setLangState(readStoredLang());
    window.addEventListener("storage", onStorage);
    window.addEventListener("purity-lang-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("purity-lang-change", onCustom);
    };
  }, []);

  const setLang = (l: Lang) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, l);
      window.dispatchEvent(new Event("purity-lang-change"));
    }
    setLangState(l);
  };

  const t = (key: string) => dicts[lang][key] ?? dicts.en[key] ?? key;
  const dir: "ltr" | "rtl" = lang === "ar" ? "rtl" : "ltr";

  return <LangCtx.Provider value={{ lang, setLang, t, dir }}>{children}</LangCtx.Provider>;
}

export function useLang(): Ctx {
  const ctx = useContext(LangCtx);
  if (!ctx) {
    // Fallback when used outside provider — read from storage, no reactive updates.
    const lang = readStoredLang();
    return {
      lang,
      setLang: () => {},
      t: (k) => dicts[lang][k] ?? dicts.en[k] ?? k,
      dir: lang === "ar" ? "rtl" : "ltr",
    };
  }
  return ctx;
}
