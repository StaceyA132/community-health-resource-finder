# Community Health Resource Finder

Next.js prototype for a geolocation-friendly health resource finder, plus a SwiftUI starter for iOS. Users can search by zip code, filter by category, and view verified listings with cost, eligibility, and contact info.

## Quickstart (web)

1. Install dependencies: `npm install`
2. Run locally: `npm run dev`
3. Open: http://localhost:3000

The mock API lives at `/api/resources` and reads from `data/resources.ts`. Filter with `?zip=94103&categories=mental-health,pharmacy`.

## Editing data

- Update or extend the seed data in `data/resources.ts`.
- Each entry supports categories: mental-health, emergency-care, womens-health, pharmacy, dental, food, shelter.
- Zip-to-coordinate hints are in `zipCoordinates` for rough distance sorting and a 60-mile radius filter.

## iOS starter

- A SwiftUI scaffold is in `ios/CommunityHealthFinder`.
- Open the folder in Xcode, create a new SwiftUI App target, and replace the generated `App` and `ContentView` files with the ones provided here.
- The `ResourceService` reads the same shape as the web JSON response to keep feature parity.

## Next steps

- Swap the mock data file for a database-backed API.
- Add geolocation permissions to auto-detect the user’s location.
- Connect to real verification/curation workflows for submissions.
# community-health-resource-finder
