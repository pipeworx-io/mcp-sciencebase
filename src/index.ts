interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * USGS ScienceBase catalog MCP.
 *
 * Keyless search across the U.S. Geological Survey's scientific data catalog
 * (sciencebase.gov) — datasets, projects, and publications with metadata,
 * contacts, web links, and direct file/download links. The catalog is
 * hierarchical (collections contain sub-items), so items can be drilled into.
 * Keyless.
 */


const BASE = 'https://www.sciencebase.gov/catalog';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

// The catalog API returns only id/link/title/relatedItems unless `fields=` is
// passed. These are the fields confirmed to populate on real items live.
const SEARCH_FIELDS =
  'title,summary,browseCategories,browseTypes,dates,contacts,webLinks,tags,distributionLinks';
const ITEM_FIELDS =
  'title,summary,browseCategories,browseTypes,dates,contacts,webLinks,tags,distributionLinks,files,parentId,hasChildren';

interface SbDate { type?: string; dateString?: string; label?: string }
interface SbContact { name?: string; type?: string }
interface SbWebLink { type?: string; uri?: string; title?: string }
interface SbDistLink { name?: string; uri?: string; title?: string }
interface SbFile { name?: string; url?: string; contentType?: string; size?: number }
interface SbItem {
  id?: string;
  title?: string;
  summary?: string;
  browseCategories?: string[];
  browseTypes?: string[];
  dates?: SbDate[];
  contacts?: SbContact[];
  webLinks?: SbWebLink[];
  distributionLinks?: SbDistLink[];
  files?: SbFile[];
  hasChildren?: boolean;
  parentId?: string;
  link?: { url?: string };
}

const tools: McpToolExport['tools'] = [
  {
    name: 'search_items',
    description:
      "Search the USGS ScienceBase catalog (sciencebase.gov) — the U.S. Geological Survey's scientific data catalog of datasets, publications, and projects, with summaries, categories, dates, and direct download links. Keyless.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Free-text search, e.g. "streamflow", "earthquake hazard", "Landsat vegetation".',
        },
        category: {
          type: 'string',
          description:
            'Optional. Narrow to a single catalog category: "Data", "Publication", "Project", or "Collection".',
        },
        limit: { type: 'number', description: 'Max results, default 10, max 25.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_item',
    description:
      'Get a single ScienceBase catalog item by id — full summary, categories, types, dates, contacts, web links, and attached files (download URLs). e.g. id "58f8be37e4b0b7ea5452260e". Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'A ScienceBase item id, e.g. "58f8be37e4b0b7ea5452260e" (from search_items results).',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'item_children',
    description:
      'List the child items of a ScienceBase catalog item. The catalog is hierarchical — collections and folders contain sub-items (use get_item to check has_children). Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        parent_id: { type: 'string', description: 'The id of the parent catalog item, e.g. "58e64ab1e4b09da6799ac732".' },
        limit: { type: 'number', description: 'Max children, default 15, max 30.' },
      },
      required: ['parent_id'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'search_items':
        return searchItems(args);
      case 'get_item':
        return getItem(args);
      case 'item_children':
        return itemChildren(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function sbGet(path: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams({ format: 'json', ...params }).toString();
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (res.status === 404) return { __notFound: true };
  if (!res.ok) return { __error: `ScienceBase: ${res.status} ${(await res.text()).slice(0, 200)}` };
  return res.json();
}

function truncate(s: unknown, n: number): string | undefined {
  if (typeof s !== 'string' || !s) return undefined;
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function firstDate(dates: SbDate[] | undefined): string | undefined {
  if (!Array.isArray(dates) || dates.length === 0) return undefined;
  const pub = dates.find((d) => d.type === 'Publication' || d.type === 'publication');
  return (pub ?? dates[0]).dateString;
}

function mapItem(raw: SbItem, opts: { full: boolean }): Record<string, unknown> {
  if (!opts.full) {
    return {
      id: raw.id,
      title: raw.title,
      summary: truncate(raw.summary, 300),
      categories: raw.browseCategories ?? [],
      date: firstDate(raw.dates),
      data_links: (raw.distributionLinks ?? [])
        .slice(0, 5)
        .map((d) => ({ title: d.title ?? d.name, uri: d.uri })),
      url: raw.link?.url,
    };
  }
  return {
    id: raw.id,
    title: raw.title,
    summary: raw.summary,
    categories: raw.browseCategories ?? [],
    types: raw.browseTypes ?? [],
    dates: (raw.dates ?? []).map((d) => ({ type: d.type, date: d.dateString })),
    contacts: (raw.contacts ?? []).slice(0, 8).map((c) => ({ name: c.name, type: c.type })),
    web_links: (raw.webLinks ?? []).slice(0, 8).map((w) => ({ title: w.title, uri: w.uri, type: w.type })),
    files: (raw.files ?? []).slice(0, 15).map((f) => ({
      name: f.name,
      url: f.url,
      content_type: f.contentType,
      size_bytes: f.size,
    })),
    has_children: raw.hasChildren ?? false,
    parent_id: raw.parentId,
    url: raw.link?.url,
  };
}

async function searchItems(args: Record<string, unknown>): Promise<unknown> {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return { error: 'provide a query', query: args.query ?? null };
  let limit = typeof args.limit === 'number' ? Math.floor(args.limit) : 10;
  if (!Number.isFinite(limit) || limit < 1) limit = 10;
  if (limit > 25) limit = 25;

  const params: Record<string, string> = { q: query, max: String(limit), fields: SEARCH_FIELDS };
  const category = typeof args.category === 'string' ? args.category.trim() : '';
  if (category) params.filter = `browseCategory=${category}`;

  const data = (await sbGet('/items', params)) as Record<string, unknown>;
  if (data.__error) return { error: data.__error };

  const items = Array.isArray(data.items) ? (data.items as SbItem[]) : [];
  return {
    total: data.total ?? items.length,
    count: items.length,
    items: items.map((it) => mapItem(it, { full: false })),
  };
}

async function getItem(args: Record<string, unknown>): Promise<unknown> {
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  if (!id) return { error: 'provide an item id', id: args.id ?? null };

  const data = (await sbGet(`/item/${encodeURIComponent(id)}`, { fields: ITEM_FIELDS })) as Record<string, unknown>;
  if (data.__notFound) return { error: 'item not found', id };
  if (data.__error) return { error: data.__error };

  return mapItem(data as SbItem, { full: true });
}

async function itemChildren(args: Record<string, unknown>): Promise<unknown> {
  const parentId = typeof args.parent_id === 'string' ? args.parent_id.trim() : '';
  if (!parentId) return { error: 'provide a parent_id', parent_id: args.parent_id ?? null };
  let limit = typeof args.limit === 'number' ? Math.floor(args.limit) : 15;
  if (!Number.isFinite(limit) || limit < 1) limit = 15;
  if (limit > 30) limit = 30;

  const data = (await sbGet('/items', {
    parentId,
    max: String(limit),
    fields: 'title,summary,browseCategories',
  })) as Record<string, unknown>;
  if (data.__error) return { error: data.__error };

  const items = Array.isArray(data.items) ? (data.items as SbItem[]) : [];
  return {
    parent_id: parentId,
    count: items.length,
    children: items.map((it) => ({
      id: it.id,
      title: it.title,
      summary: truncate(it.summary, 200),
      categories: it.browseCategories ?? [],
    })),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
