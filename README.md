# Community Health Resource Finder
A small Next.js app that finds nearby health resources. Enter a ZIP code or allow geolocation to see clinics, food banks, pharmacies, shelters, and other low-cost services.

## Quickstart (web)

1. Install dependencies: `npm install`
2. Run locally: `npm run dev`
3. Open: http://localhost:3000
4. Run tests: `npm test`

The API lives at `/api/resources`. By default it reads from `data/resources.ts`. Filter with `?zip=94103&categories=mental-health,pharmacy`.

### Connect to Supabase (optional, replaces mock data)
- Create a table `resources` with columns:  
  `id uuid primary key`, `name text`, `categories text[]`, `description text`, `address text`, `city text`, `state text`, `zip text`, `phone text`, `website text`, `hours text`, `cost text`, `eligibility text`, `lat double precision`, `lng double precision`, `verified boolean`.
- Add a Row Level Security policy that allows anon read (select) on verified rows, e.g.
  `create policy "read verified" on resources for select to anon using (verified);`
- Copy `.env.example` to `.env.local` (git-ignored) and set:
  ```
  SUPABASE_URL=your-project-url
  SUPABASE_ANON_KEY=your-anon-key
  ```
  Use the anon key so Row Level Security applies. `SUPABASE_SERVICE_ROLE_KEY` still works as a fallback, but it bypasses RLS, so avoid it. Either way, the API only returns rows where `verified` is true.
- The route will automatically fetch from Supabase; if env vars are missing or Supabase errors, it falls back to the sample data, and the UI labels results as sample listings.
- Queries are narrowed to a lat/lng box around the user before exact distance filtering, and capped at 500 rows. Index `lat` and `lng` (or move to PostGIS) as the table grows.
- Geolocation: the web UI can request your browser location to auto-center results; if denied or unavailable, it uses the entered ZIP. Entering a different ZIP replaces the detected location.

## Editing data

- Update or extend the seed data in `data/resources.ts`.
- Each entry supports categories: `mental-health`, `emergency-care`, `womens-health`, `pharmacy`, `dental`, `food`, `shelter`.
- ZIP-to-coordinate hints are in `zipCoordinates` for distance sorting and a 60-mile radius filter. Only the listed ZIPs are supported; other ZIPs show all resources with a notice. A real deployment needs a full ZIP dataset or geocoding API.
- The seed data is for demos only: some names, phone numbers and websites are made up.

## Resource helper chat

The floating **Chat with a resource helper** button turns everyday requests into the existing category filters. It works with local matching by default, so no service or key is required for the demo.

To enable AI-generated replies, add the following to `.env.local` (never commit this file):

```
OPENAI_API_KEY=your-api-key
# Optional; defaults to gpt-5
OPENAI_MODEL=gpt-5
```

The API key stays in `app/api/chat/route.ts` on the server. The helper is deliberately limited to navigating resources and displays emergency guidance rather than providing medical advice. Messages that look like an emergency are never sent to OpenAI; the user is shown 911 and the 988 Suicide & Crisis Lifeline instead. Chat logic lives in `lib/chat.ts` and is covered by `lib/chat.test.ts`.

## iOS starter

- A SwiftUI starter app lives in `ios/CommunityHealthFinder`.
- Open the folder in Xcode and use the provided `ResourceService` and views as a starting point.

## Notes

- The API is at `/api/resources`. It defaults to `data/resources.ts` unless Supabase is configured.
- Geolocation is optional; users can still search by ZIP code.
