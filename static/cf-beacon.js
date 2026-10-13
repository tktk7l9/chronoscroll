// Cloudflare Web Analytics beacon, appended at runtime so that every <script src> in the HTML is same-origin
// (Mozilla Observatory's subresource-integrity test fails on a third-party script without `integrity`).
// It is loaded from src/app.html rather than a client hook because /c and /e render without client JS (csr = false).
// Never add `integrity` to the beacon: Cloudflare updates beacon.min.js in place.
const beacon = document.createElement('script');
beacon.type = 'module';
beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
beacon.dataset.cfBeacon = JSON.stringify({ token: 'cf62303813104660bbb08da280e9673d' }); // the token is not secret gitleaks:allow
document.head.appendChild(beacon);
