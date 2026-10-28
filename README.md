# marketplace-demo

Reservation system demo for a swap meet / flea market (Escondido World Marketplace). Plain HTML, CSS and JavaScript, no build step.

## Run

Open `index.html` in a browser. To use the phone camera in the gate scanner, serve the folder over localhost or https, for example `python3 -m http.server 8000`.

Demo data is generated on first load and kept in the browser's localStorage, so all pages share it. Use "Reset demo data" on the home page to start over.

## Pages

| Page | Who | What it does |
|---|---|---|
| `booking.html` | Vendor | Pick From / To dates, pick a space on the market map, see the price |
| `apply.html` | Vendor | Sign in, business info, documents, pay, get a yellow QR pass (reached from Reserve) |
| `tickets.html` | Visitor | Buy entry by phone, one black-and-white QR per person |
| `scan.html` | Gatekeeper | Scan vendor and visitor QR codes, collect payment, sell at the gate, move vendors |
| `checkin.html` | Manager | All vendors for a day, who owes money, no-shows, fixes |
| `crm.html` | Owner | Revenue, occupancy, approvals, vendor history, CSV export |

## Libraries (CDN)

- [Chart.js](https://www.chartjs.org/) for CRM charts
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) for QR codes
- [html5-qrcode](https://github.com/mebjas/html5-qrcode) for camera scanning
