## CommunityHealthFinder iOS (SwiftUI)

Minimal SwiftUI starter that mirrors the web API shape.

### How to use

1. Open this folder in Xcode and create a new **App** project named `CommunityHealthFinder`.
2. Replace the generated `App` and `ContentView` files with the provided ones.
3. Add the `Models` and `Services` folders to the target.
4. Run the web app locally (`npm run dev`) so the iOS app can hit `http://localhost:3000/api/resources`.
5. If offline, tap **Mock data** in the app to show seeded listings.

### Notes

- `ResourceService` fetches the same JSON as `/api/resources`.
- Categories stay consistent with the web version for shared filtering.
- Swap the URL in `ResourceService` once you deploy the backend.
