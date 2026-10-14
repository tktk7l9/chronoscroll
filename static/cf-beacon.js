// Cloudflare Web Analytics beacon, appended at runtime so that every <script src> in the HTML is same-origin
// (Mozilla Observatory's subresource-integrity test fails on a third-party script without `integrity`).
// It is loaded from src/app.html rather than a client hook because /c and /e render without client JS (csr = false).
// Never add `integrity` to the beacon: Cloudflare updates beacon.min.js in place.
// It is appended after the load event, so its third-party connection and download stay out of the way of the
// page's own CSS, JS, data and LCP image (mobile LCP of an event page about 0.2 s earlier in a local Lighthouse 13.5
// run). A visit that ends before the load event is not counted.
function appendBeacon() {
	const beacon = document.createElement('script');
	beacon.type = 'module';
	beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
	beacon.dataset.cfBeacon = JSON.stringify({ token: 'cf62303813104660bbb08da280e9673d' }); // the token is not secret gitleaks:allow
	document.head.appendChild(beacon);
}
if (document.readyState === 'complete') appendBeacon();
else window.addEventListener('load', appendBeacon, { once: true });
