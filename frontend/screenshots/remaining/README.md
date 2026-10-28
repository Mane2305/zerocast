# Remaining frontend review

Real precomputed demo data: [Portfolio desktop](portfolio-desktop.png), [Portfolio mobile](portfolio-mobile.png), [Exceptions desktop](exceptions-desktop.png), [Exceptions mobile](exceptions-mobile.png), [Drivers desktop](drivers-desktop.png), [Drivers mobile](drivers-mobile.png).

Controlled import fixtures: [wide CSV conversion](wide-converted.png), [JSON hierarchy / Parquet round-trip](hierarchy-json.png). The tests preserve blank targets, reject ambiguous roles, retain original hierarchy IDs and verify the upload metadata. They do not upload to the actual backend.

Run `npm run verify:remaining` with the frontend on port 3000. Override `VERIFY_URL` for another preview and use `VERIFY_DEMO_MODE=1` to skip configured-API fixture uploads/readiness checks. Actual published Sheets access depends on publication and browser CORS; unsupported/private links never request Google credentials.

Limits: Drivers exposes only the reported best lag until the API supplies a full lag profile. Deployment is left to the owner; set `NEXT_PUBLIC_API_URL` to the deployed public API and rebuild.
