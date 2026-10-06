// Regional test servers for the Stats page network test.
//
// Each region needs:
//   id      short key used in the table
//   name    label shown to the user
//   url     a small endpoint to time (ideally an empty 204 or a few bytes)
//   lat/lon where that server physically sits (used for the distance and
//           overhead-factor math, so make these match the real server)
//   noCors  false = normal CORS fetch: the server MUST send
//                   Access-Control-Allow-Origin for our origin (or *),
//                   and non-2xx responses count as failures.
//           true  = "no-cors" fetch: works against any server without CORS
//                   headers, but the response is opaque, so an error page
//                   still counts as a successful round trip.
//
// Endpoints:
// - NE, SE, EU, BR use Google Cloud's public latency-test servers from gcping.com
//   (github.com/GoogleCloudPlatform/gcping). Each /api/ping returns just the
//   region name with Access-Control-Allow-Origin: *. Using one provider for all
//   four keeps the comparison fair. If a URL stops working, the current list is
//   at https://global.gcping.com/api/endpoints
// - CN uses AWS's Beijing region health check (Google Cloud has no mainland
//   China region). Traffic into mainland China often crosses the Great Firewall,
//   so slow, inconsistent or failed samples here are expected and shown as-is.
//   It runs in no-cors mode so a missing CORS header can't hide a real reply.

export const REGIONS = [
    {
        id: "NE",
        name: "US Northeast",
        url: "https://us-east4-5tkroniexa-uk.a.run.app/api/ping",
        lat: 39.0438, lon: -77.4874, // Google us-east4, Ashburn, VA
        noCors: false,
    },
    {
        id: "SE",
        name: "US Southeast",
        url: "https://us-east1-5tkroniexa-ue.a.run.app/api/ping",
        lat: 33.1960, lon: -80.0131, // Google us-east1, Moncks Corner, SC
        noCors: false,
    },
    {
        id: "EU",
        name: "Europe",
        url: "https://europe-west3-5tkroniexa-ey.a.run.app/api/ping",
        lat: 50.1109, lon: 8.6821, // Google europe-west3, Frankfurt, DE
        noCors: false,
    },
    {
        id: "CN",
        name: "China",
        url: "https://dynamodb.cn-north-1.amazonaws.com.cn/ping",
        lat: 39.9042, lon: 116.4074, // AWS cn-north-1, Beijing
        noCors: true,
    },
    {
        id: "BR",
        name: "Brazil",
        url: "https://southamerica-east1-5tkroniexa-rj.a.run.app/api/ping",
        lat: -23.5329, lon: -46.7917, // Google southamerica-east1, Osasco (São Paulo), BR
        noCors: false,
    },
];
