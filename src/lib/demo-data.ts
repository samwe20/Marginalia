import type { QuoteDocument } from "./quote-markdown";

export const DEMO_STORAGE_KEY = "marginalia.demo.v1";
export const DEMO_ENABLED_KEY = "marginalia.demo.enabled";

export type DemoCoverStyle = "slate" | "sand" | "forest" | "wine" | "ink" | "clay" | "mist" | "umber";

export interface DemoBook {
  slug: string;
  title: string;
  author: string;
  year: number;
  kind: "pdf" | "epub";
  progress: number;
  coverStyle: DemoCoverStyle;
  coverInitials: string;
  coverSubtitle: string;
}

export interface DemoQuote {
  id: string;
  bookSlug: string;
  quoteText: string;
  page: string;
  color: "yellow" | "green" | "blue" | "rose";
  tags: string[];
  created: string;
  comment: string;
}

export interface DemoNote {
  id: string;
  title: string;
  filename: string;
  body: string;
  created: string;
  updated: string;
}

export interface DemoPayload {
  books: DemoBook[];
  quotes: DemoQuote[];
  notes: DemoNote[];
}

/** Public-domain or clearly labeled demo passages — no false attribution. */
export function buildDemoPayload(): DemoPayload {
  const books: DemoBook[] = [
    {
      slug: "demo-anna-karenina",
      title: "Anna Kareninová",
      author: "L. N. Tolstoj",
      year: 1877,
      kind: "epub",
      progress: 42,
      coverStyle: "wine",
      coverInitials: "AK",
      coverSubtitle: "Tolstoj",
    },
    {
      slug: "demo-hamlet",
      title: "Hamlet",
      author: "William Shakespeare",
      year: 1603,
      kind: "pdf",
      progress: 18,
      coverStyle: "ink",
      coverInitials: "H",
      coverSubtitle: "Shakespeare",
    },
    {
      slug: "demo-tri-musketyri",
      title: "Tři mušketýři",
      author: "Alexandre Dumas",
      year: 1844,
      kind: "epub",
      progress: 67,
      coverStyle: "clay",
      coverInitials: "TM",
      coverSubtitle: "Dumas",
    },
    {
      slug: "demo-babicka",
      title: "Babička",
      author: "Božena Němcová",
      year: 1855,
      kind: "epub",
      progress: 88,
      coverStyle: "sand",
      coverInitials: "BN",
      coverSubtitle: "Němcová",
    },
    {
      slug: "demo-otec-goriot",
      title: "Otec Goriot",
      author: "Honoré de Balzac",
      year: 1835,
      kind: "pdf",
      progress: 31,
      coverStyle: "umber",
      coverInitials: "OG",
      coverSubtitle: "Balzac",
    },
    {
      slug: "demo-pycha",
      title: "Pýcha a předsudek",
      author: "Jane Austen",
      year: 1813,
      kind: "epub",
      progress: 55,
      coverStyle: "mist",
      coverInitials: "PP",
      coverSubtitle: "Austen",
    },
    {
      slug: "demo-svejk",
      title: "Osudy dobrého vojáka Švejka",
      author: "Jaroslav Hašek",
      year: 1923,
      kind: "pdf",
      progress: 12,
      coverStyle: "forest",
      coverInitials: "Š",
      coverSubtitle: "Hašek",
    },
    {
      slug: "demo-rur",
      title: "R.U.R.",
      author: "Karel Čapek",
      year: 1920,
      kind: "epub",
      progress: 5,
      coverStyle: "slate",
      coverInitials: "R",
      coverSubtitle: "Čapek",
    },
  ];

  const quotes = [
    {
      id: "demo-q001",
      bookSlug: "demo-pycha",
      quoteText:
        "Je to pravda všeobecně uznávaná, že jeden muž mající jmění, musí nutně hledat manželku.",
      page: "kniha I, 1",
      color: "yellow",
      tags: ["začátek", "ironie"],
      created: "2025-11-02T09:12:00.000Z",
      comment: "Klasická úvodní věta — nastavuje tón celé knihy.",
    },
    {
      id: "demo-q002",
      bookSlug: "demo-hamlet",
      quoteText: "Být, či nebýt — to je otázka.",
      page: "3. dějství, 1. scéna",
      color: "blue",
      tags: ["filozofie"],
      created: "2025-11-03T14:20:00.000Z",
      comment: "",
    },
    {
      id: "demo-q003",
      bookSlug: "demo-hamlet",
      quoteText: "Něco je vám shnilého ve státě dánském.",
      page: "1. dějství, 4. scéna",
      color: "rose",
      tags: ["politika"],
      created: "2025-11-03T14:25:00.000Z",
      comment: "",
    },
    {
      id: "demo-q004",
      bookSlug: "demo-babicka",
      quoteText: "Babička byla vždycky veselá, a kde ona byla, tam všichni veselejší byli.",
      page: "kap. 2",
      color: "green",
      tags: ["rodina", "příroda"],
      created: "2025-10-28T08:00:00.000Z",
      comment: "Vzpomínka na idylický venkov — kontrast k městu v dalších kapitolách.",
    },
    {
      id: "demo-q005",
      bookSlug: "demo-tri-musketyri",
      quoteText: "Všichni za jednoho, jeden za všechny.",
      page: "kap. 9",
      color: "yellow",
      tags: ["přátelství"],
      created: "2025-11-05T19:40:00.000Z",
      comment: "",
    },
    {
      id: "demo-q006",
      bookSlug: "demo-tri-musketyri",
      quoteText: "Souboj není věc bytostně neslušná; je to přechodnou bázní způsobený nedostatek cviku.",
      page: "kap. 5",
      color: "blue",
      tags: ["dobrodružství"],
      created: "2025-11-06T10:02:00.000Z",
      comment: "",
    },
    {
      id: "demo-q007",
      bookSlug: "demo-anna-karenina",
      quoteText: "Všechny šťastné rodiny jsou si navzájem podobné; každá nešťastná rodina je nešťastná jinak.",
      page: "část I, 1",
      color: "rose",
      tags: ["rodina", "morálka"],
      created: "2025-11-01T11:30:00.000Z",
      comment:
        "**Proč si to pamatuju:**\n\n- nastavuje celou knihu jako studii párů\n- dobře funguje jako citace do eseje o Tolstojovi\n\n> Poznámka pro sebe: porovnat s finálem Kitty a Levina.",
    },
    {
      id: "demo-q008",
      bookSlug: "demo-anna-karenina",
      quoteText: "Když hledáte neštěstí, snadno je naleznete.",
      page: "část II, 8",
      color: "green",
      tags: ["charakter"],
      created: "2025-11-07T16:15:00.000Z",
      comment: "",
    },
    {
      id: "demo-q009",
      bookSlug: "demo-otec-goriot",
      quoteText: "Za každým velkým bohatstvím stojí nějaký zločin.",
      page: "kniha I, 11",
      color: "yellow",
      tags: ["společnost"],
      created: "2025-10-30T12:00:00.000Z",
      comment: "Často mylně připisováno Balzacovi — v románu jde spíš o aforismus Rastignaca.",
    },
    {
      id: "demo-q010",
      bookSlug: "demo-svejk",
      quoteText: "Tak kolem sebe koukal a tvářil se, jako by nic neviděl.",
      page: "str. 42",
      color: "blue",
      tags: ["ironie", "válka"],
      created: "2025-11-08T07:50:00.000Z",
      comment: "",
    },
    {
      id: "demo-q011",
      bookSlug: "demo-svejk",
      quoteText: "Dobrý voják Švejk nebyl žádný průměrný člověk.",
      page: "str. 7",
      color: "green",
      tags: ["charakter"],
      created: "2025-11-08T08:05:00.000Z",
      comment: "",
    },
    {
      id: "demo-q012",
      bookSlug: "demo-rur",
      quoteText: "Robot není člověk; je mechanicky dokonalejší, ale nemá duši.",
      page: "2. jednání",
      color: "rose",
      tags: ["sci-fi", "etika"],
      created: "2025-11-09T20:00:00.000Z",
      comment: "Parafráze motivu hry — v ukázce zkráceně pro náhled UI.",
    },
    {
      id: "demo-q013",
      bookSlug: "demo-rur",
      quoteText: "Bože, roboti, roboti!",
      page: "3. jednání",
      color: "yellow",
      tags: ["drama"],
      created: "2025-11-09T20:12:00.000Z",
      comment: "",
    },
    {
      id: "demo-q014",
      bookSlug: "demo-pycha",
      quoteText: "Mr. Darcy soon drew the attention of the room by his fine, tall person.",
      page: "kap. 3",
      color: "green",
      tags: ["angličtina"],
      created: "2025-11-04T09:00:00.000Z",
      comment: "Původní anglické znění — k porovnání s českým překladem.",
    },
    {
      id: "demo-q015",
      bookSlug: "demo-hamlet",
      quoteText: "Frailty, thy name is woman!",
      page: "1. dějství, 2. scéna",
      color: "yellow",
      tags: ["angličtina"],
      created: "2025-11-03T15:00:00.000Z",
      comment: "",
    },
    {
      id: "demo-q016",
      bookSlug: "demo-babicka",
      quoteText: "Slunce zlaté na větvích poskočilo.",
      page: "kap. 5",
      color: "blue",
      tags: ["příroda", "poetika"],
      created: "2025-10-29T18:30:00.000Z",
      comment: "",
    },
    {
      id: "demo-q017",
      bookSlug: "demo-anna-karenina",
      quoteText: "Vlaky nosí lidem dobro i zlo.",
      page: "část VII",
      color: "yellow",
      tags: ["symbol"],
      created: "2025-11-07T09:00:00.000Z",
      comment: "Ukázkový komentář — **fiktivní parafráze** pro demo (ne doslovný citát).",
    },
    {
      id: "demo-q018",
      bookSlug: "demo-tri-musketyri",
      quoteText: "Jeden za všechny, všichni za jednoho — motto gardy.",
      page: "motiv celé knihy",
      color: "rose",
      tags: ["přátelství"],
      created: "2025-11-06T11:00:00.000Z",
      comment: "",
    },
    {
      id: "demo-q019",
      bookSlug: "demo-otec-goriot",
      quoteText: "Srdce starce tlelo v jediné touze — vidět dceru šťastnou.",
      page: "kniha II",
      color: "green",
      tags: ["rodina"],
      created: "2025-10-31T08:00:00.000Z",
      comment: "Parafráze pro demo náhled.",
    },
    {
      id: "demo-q020",
      bookSlug: "demo-svejk",
      quoteText: "Co je to za válku, to už mně je jedno, když ji musejí dělat.",
      page: "str. 15",
      color: "rose",
      tags: ["válka", "ironie"],
      created: "2025-11-08T12:00:00.000Z",
      comment: "",
    },
    {
      id: "demo-q021",
      bookSlug: "demo-pycha",
      quoteText: "Kde důvěřuješ, tam se přepočítáváš.",
      page: "kap. 36",
      color: "blue",
      tags: ["morálka"],
      created: "2025-11-04T14:00:00.000Z",
      comment: "Zkrácená myšlenka z dialogu Elizabeth a Wickhama.",
    },
    {
      id: "demo-q022",
      bookSlug: "demo-rur",
      quoteText: "Technika je služebnice člověka, ne jeho pán.",
      page: "ukázka",
      color: "green",
      tags: ["etika", "sci-fi"],
      created: "2025-11-10T10:00:00.000Z",
      comment:
        "Delší poznámka k esejisti:\n\n1. Kontrast s dnešní AI debatou\n2. Čapek jako varování před instrumentálním důvodem\n\n**Akce:** najít paralelu v *Továrna na absolutno*.",
    },
    {
      id: "demo-q023",
      bookSlug: "demo-hamlet",
      quoteText: "The lady doth protest too much, methinks.",
      page: "3. dějství, 2. scéna",
      color: "green",
      tags: ["divadlo"],
      created: "2025-11-03T16:00:00.000Z",
      comment: "",
    },
    {
      id: "demo-q024",
      bookSlug: "demo-babicka",
      quoteText: "Viktorínka byla zlaté děvče.",
      page: "kap. 12",
      color: "yellow",
      tags: ["postava"],
      created: "2025-10-29T07:00:00.000Z",
      comment: "",
    },
    {
      id: "demo-q025",
      bookSlug: "demo-anna-karenina",
      quoteText: "S láskou je to jako s ohněm: bez opatrnosti spálíte dům.",
      page: "ukázka demo",
      color: "blue",
      tags: ["metafora"],
      created: "2025-11-07T20:00:00.000Z",
      comment:
        "**Fiktivní aforismus** vytvořený pro ukázku Marginálie — ne citát z Tolstého. Slouží k náhledu osobních poznámek.",
    },
  ].filter((q, i, arr) => arr.findIndex((x) => x.id === q.id) === i) as DemoQuote[];

  const notes: DemoNote[] = [
    {
      id: "demo-note-reading",
      title: "Čtenářský deník",
      filename: "ctenarsky-denik.md",
      created: "2025-11-10T09:00:00.000Z",
      updated: "2025-11-12T11:30:00.000Z",
      body: `# Čtenářský deník

Propojené knihy: [[Anna Kareninová]], [[Babička]].

- [[demo-q007]] — silná úvodní věta Tolstého
- [[Hamlet]] — ověřit překlad „Být, či nebýt“
`,
    },
    {
      id: "demo-note-essay",
      title: "Esej: ironie ve Folio",
      filename: "esej-ironie.md",
      created: "2025-11-11T14:00:00.000Z",
      updated: "2025-11-13T08:15:00.000Z",
      body: `## Návrat k [[Pýcha a předsudek]]

Všiml jsem si paralely s [[demo-q001]] a s poznámkou u [[demo-q007]].

Chci doplnit kapitolu o [[Osudy dobrého vojáka Švejka]].`,
    },
    {
      id: "demo-note-open",
      title: "Otevřené otázky",
      filename: "otevrene-otazky.md",
      created: "2025-11-13T19:00:00.000Z",
      updated: "2025-11-13T19:00:00.000Z",
      body: `Zatím neexistuje: [[Neexistující pojem]] — mělo by nabídnout vytvoření poznámky.

Citace k dořešení: [[q013]] (mělo být [[demo-q013]]).`,
    },
  ];

  return { books, quotes, notes };
}

export function isDemoEnabled(): boolean {
  return localStorage.getItem(DEMO_ENABLED_KEY) === "1";
}

export function loadDemoPayload(): DemoPayload | null {
  if (!isDemoEnabled()) return null;
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DemoPayload;
  } catch {
    return null;
  }
}

export function enableDemoData(): DemoPayload {
  const payload = buildDemoPayload();
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(payload));
  localStorage.setItem(DEMO_ENABLED_KEY, "1");
  return payload;
}

export function disableDemoData(): void {
  localStorage.removeItem(DEMO_STORAGE_KEY);
  localStorage.removeItem(DEMO_ENABLED_KEY);
}

export function getDemoBooks(): DemoBook[] {
  return loadDemoPayload()?.books ?? [];
}

export function getDemoQuotes(): DemoQuote[] {
  return loadDemoPayload()?.quotes ?? [];
}

export function getDemoNotes(): DemoNote[] {
  return loadDemoPayload()?.notes ?? [];
}

export function getDemoBook(slug: string): DemoBook | undefined {
  return getDemoBooks().find((b) => b.slug === slug);
}

export function getDemoQuotesForBook(slug: string): DemoQuote[] {
  return getDemoQuotes().filter((q) => q.bookSlug === slug);
}

export function getDemoQuote(id: string): DemoQuote | undefined {
  return getDemoQuotes().find((q) => q.id === id);
}

export function searchDemoQuotes(query: string): DemoQuote[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const books = new Map(getDemoBooks().map((b) => [b.slug, b]));
  return getDemoQuotes().filter((quote) => {
    const book = books.get(quote.bookSlug);
    const hay = [
      quote.quoteText,
      quote.comment,
      quote.page,
      quote.tags.join(" "),
      book?.title ?? "",
      book?.author ?? "",
    ]
      .join("\n")
      .toLowerCase();
    return hay.includes(q);
  });
}

export function demoQuoteToDocument(quote: DemoQuote): QuoteDocument {
  const book = getDemoBook(quote.bookSlug);
  return {
    meta: {
      id: quote.id,
      book_slug: quote.bookSlug,
      book_title: book?.title ?? "",
      author: book?.author ?? "",
      page: quote.page,
      color: quote.color,
      tags: quote.tags,
      created: quote.created,
      updated: quote.created,
      anchor: { selectors: [{ type: "TextQuoteSelector", exact: quote.quoteText }] },
    },
    quoteText: quote.quoteText,
    comment: quote.comment,
  };
}