# Community Health Resource Finder

Next.js prototype for a geolocation-friendly health resource finder, plus a SwiftUI starter for iOS. Users can search by zip code, filter by category, and view verified listings with cost, eligibility, and contact info.

## Quickstart (web)

1. Install dependencies: `npm install`
2. Run locally: `npm run dev`
3. Open: http://localhost:3000

The API lives at `/api/resources`. By default it reads from `data/resources.ts`. Filter with `?zip=94103&categories=mental-health,pharmacy`.

### Connect to Supabase (optional, replaces mock data)
- Create a table `resources` with columns:  
  `id uuid primary key`, `name text`, `categories text[]`, `description text`, `address text`, `city text`, `state text`, `zip text`, `phone text`, `website text`, `hours text`, `cost text`, `eligibility text`, `lat double precision`, `lng double precision`, `verified boolean`.
- Add a Row Level Security policy that allows read (select) for your use case (e.g., anon select on verified rows).
- Add `.env.local` (not committed) with:
  ```
  SUPABASE_URL=your-project-url
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
  ```
  Use the service role key only on the server; never expose it to the client.
- The route will automatically fetch from Supabase; if env vars are missing or Supabase errors, it falls back to the mock data.
- Geolocation: the web UI can request your browser location to auto-center results; if denied or unavailable, it uses the entered zip or mock data.

## Editing data

- Update or extend the seed data in `data/resources.ts`.
- Each entry supports categories: mental-health, emergency-care, womens-health, pharmacy, dental, food, shelter.
- Zip-to-coordinate hints are in `zipCoordinates` for rough distance sorting and a 60-mile radius filter.

## iOS starter

- A SwiftUI scaffold is in `ios/CommunityHealthFinder`.
- Open the folder in Xcode, create a new SwiftUI App target, and replace the generated `App` and `ContentView` files with the ones provided here.
- The `ResourceService` reads the same shape as the web JSON response to keep feature parity.

## Next steps

- Swap the mock data file for a database-backed API. COMPLETED
- Add geolocation permissions to auto-detect the user’s location.
- Connect to real verification/curation workflows for submissions.
# community-health-resource-finder
