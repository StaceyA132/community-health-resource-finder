# Community Health Resource Finder

Find free and low-cost health resources nearby: clinics, counseling, pharmacies, dental care, food banks, and shelters. Search by ZIP code or share your live location. There's a Next.js website and a SwiftUI iPhone app that uses the same API.

- **Nationwide listings** from OpenStreetMap, plus your own curated listings
- **Live location** that refreshes results as you move
- **Category filters** for mental health, emergency care, women's health, pharmacy, dental, food banks, and shelter
- **Resource helper chat** that turns plain requests ("I need a safe place to sleep") into filters, and shows 911 and 988 for emergencies

## Quickstart (web)

Requires Node.js 20.9 or later.

```
npm install
npm run dev
```

Then open http://localhost:3000. No API keys are needed; without any configuration the app uses the sample listings plus live OpenStreetMap data.

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit tests (Vitest) |
| `npm run lint` | Lint with ESLint |
| `npm run build` | Production build |

## Configuration

All settings are optional. Copy `.env.example` to `.env.local` (git-ignored, never commit it) and fill in what you need:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Use your own curated listings from Supabase instead of the sample data |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | AI replies in the resource helper chat (model defaults to `gpt-5`) |
| `OVERPASS_URL` | Use a different OpenStreetMap (Overpass) server; separate several with commas to try them in order |

## Where the listings come from

Each search combines two sources, sorted by distance within a 60-mile radius.

### Curated listings

Your own verified listings, from Supabase if configured, otherwise the sample data in `data/resources.ts`.

The sample data is for demos only: some names, phone numbers, and websites are made up, and the app labels these results as sample listings.

### Nationwide listings (OpenStreetMap)

Nearby places from [OpenStreetMap](https://www.openstreetmap.org), fetched through the free public [Overpass API](https://overpass-api.de) within about 15 miles. ZIP codes are turned into coordinates with [Zippopotam.us](https://zippopotam.us). Neither service needs a key, and responses are cached for an hour.

- Listings are community-edited, so they're tagged "From OpenStreetMap" and people are asked to call ahead.
- Each search keeps up to 300 places, nearest first, split evenly between the selected categories (about 42 each when all are selected), so common places like dentists don't crowd out rarer ones like shelters.
- The public server is shared, slow for large searches (a first search can take 10–30 seconds), and often busy. Busy (429) and failed (5xx) responses are retried once within a 30-second budget, and identical searches made at the same time share one request.
- If it still fails, the curated listings are shown with a notice that OpenStreetMap is unavailable and a **Try again** button.
- The public server suits a demo or small app. A busy production site should host its own Overpass server or use a paid provider, then set `OVERPASS_URL`.

### Connecting Supabase

1. Create a `resources` table with these columns: `id uuid primary key`, `name text`, `categories text[]`, `description text`, `address text`, `city text`, `state text`, `zip text`, `phone text`, `website text`, `hours text`, `cost text`, `eligibility text`, `lat double precision`, `lng double precision`, `verified boolean`.
2. Add a Row Level Security policy that lets anonymous users read verified rows:
   ```sql
   create policy "read verified" on resources for select to anon using (verified);
   ```
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env.local`.

Notes:

- Use the anon key so Row Level Security applies. `SUPABASE_SERVICE_ROLE_KEY` still works as a fallback, but it bypasses RLS, so avoid it. Either way, only rows where `verified` is true are returned.
- If Supabase is unreachable, the app falls back to the sample data.
- Queries are narrowed to a lat/lng box around the user and capped at 500 rows. Index `lat` and `lng` (or move to PostGIS) as the table grows.

### Editing the sample data

- Add or change listings in `data/resources.ts`.
- Categories: `mental-health`, `emergency-care`, `womens-health`, `pharmacy`, `dental`, `food`, `shelter`.
- `zipCoordinates` holds built-in coordinates for a few ZIPs; other ZIPs are looked up with Zippopotam.us.

## Live location

The site asks for your location and keeps following it, refreshing results whenever you move about a tenth of a mile. Turn it off with **Stop live location**, or type a ZIP to search somewhere else. If location is denied or unavailable, it searches by ZIP.

## Resource helper chat

The **Chat with a resource helper** button turns everyday requests into category filters and ZIP searches. It uses local keyword matching by default, so it works without any service or key. Set `OPENAI_API_KEY` for AI-generated replies; the key stays on the server.

The helper only navigates resources; it doesn't give medical advice. Messages that look like an emergency are never sent to OpenAI: the user is shown 911 and the 988 Suicide & Crisis Lifeline instead.

## iPhone app

A SwiftUI app lives in `ios/`, with the same search, live location, filters, and chat as the website. Open `ios/CommunityHealthFinder.xcodeproj` in Xcode and press Run. See [ios/README.md](ios/README.md) for details, including running it on your own iPhone.

## API

| Endpoint | Description |
| --- | --- |
| `GET /api/resources` | Search listings. Query parameters: `zip` (5 digits, defaults to 94103), `categories` (comma-separated), `lat` and `lng` (use a location instead of the ZIP) |
| `POST /api/chat` | Resource helper. JSON body: `{ "message": "...", "zip": "94103" }`. Returns a reply, suggested categories and ZIP, and an `emergency` flag |

Example: `/api/resources?zip=94103&categories=mental-health,pharmacy`

## Project structure

```
app/
  page.tsx              Web UI
  api/resources/        Search endpoint
  api/chat/             Resource helper endpoint
lib/
  geo.ts                Distance, radius filter, and sorting
  liveResources.ts      OpenStreetMap and ZIP lookups
  chat.ts               Chat matching, emergency detection, and AI reply parsing
  *.test.ts             Unit tests
data/resources.ts       Categories and sample listings
ios/                    SwiftUI iPhone app and Xcode project
```
