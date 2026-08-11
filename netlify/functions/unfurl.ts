/**
 * URL unfurler — given a product link, fetches the page server-side and
 * extracts title, image, price and description from Open Graph / Twitter meta
 * tags and JSON-LD Product data. Free, no API key required.
 *
 * POST { url } -> { ok, title, image, price, description, site }
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const meta = (html: string, names: string[]): string | undefined => {
  for (const name of names) {
    // property="og:title" content="..."  (either attribute order)
    const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i')
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${name}["']`, 'i')
    const m = html.match(re1) || html.match(re2)
    if (m?.[1]) return decode(m[1].trim())
  }
  return undefined
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x2F;/g, '/')

function fromJsonLd(html: string): { title?: string; image?: string; price?: string; description?: string } {
  const out: { title?: string; image?: string; price?: string; description?: string } = {}
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const block of blocks) {
    const raw = block.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim()
    try {
      const data = JSON.parse(raw)
      const nodes = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data]
      for (const node of nodes) {
        const type = node['@type']
        if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) {
          if (node.name && !out.title) out.title = String(node.name)
          if (node.description && !out.description) out.description = String(node.description)
          const img = Array.isArray(node.image) ? node.image[0] : node.image
          if (img && !out.image) out.image = typeof img === 'string' ? img : img.url
          const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers
          const price = offers?.price ?? offers?.lowPrice
          if (price && !out.price) out.price = String(price)
        }
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  }
  return out
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  let url = ''
  try {
    url = (await req.json()).url || ''
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  if (!/^https?:\/\//i.test(url)) return json({ error: 'bad_url' }, 200)

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RolandoDashboard/1.0; +link-preview)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    const html = (await res.text()).slice(0, 600_000)

    const ld = fromJsonLd(html)
    const title =
      meta(html, ['og:title', 'twitter:title']) || ld.title ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
    const image = meta(html, ['og:image', 'twitter:image', 'twitter:image:src']) || ld.image
    const description = meta(html, ['og:description', 'twitter:description', 'description']) || ld.description
    const price =
      meta(html, ['product:price:amount', 'og:price:amount', 'twitter:data1']) || ld.price
    const site = meta(html, ['og:site_name']) || new URL(url).hostname.replace(/^www\./, '')

    return json({ ok: true, title: title && decode(title), image, price, description: description && decode(description), site })
  } catch {
    return json({ error: 'fetch_failed' }, 200)
  }
}
