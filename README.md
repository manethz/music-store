# Online Music Store

Online Music Store (branded **Amplify** in the interface) is a full-stack university demonstration application for selling physical instruments, live-sound products, studio equipment, and accessories. It includes a customer storefront and dedicated workspaces for five staff roles.

> All accounts, products, payments, orders, and prices in this repository are demonstration data. No real payment information is accepted or stored.

## Features

- Customer registration, JWT login, profile, catalogue search/filtering, product detail, stock-safe cart, checkout, simulated payment, order history, and status tracking
- Product CRUD/deactivation, category API, product image URLs, brands, SKU, availability, featured products, and stock visibility
- Staff-only product creation with local JPEG/PNG/WebP uploads, draft publishing, database-enforced unique SKUs, creator attribution, and initial inventory audit records
- Inventory adjustment history, per-product thresholds, and automatically opened/resolved low-stock alerts
- Order search/filtering, snapshots of purchased items, internal notes API, high-value flags, status management, stock deduction, and cancellation restoration
- Percentage/fixed promotions by products or categories, validity dates, automatic best-discount application, and performance counters
- System-admin staff management, account activation, and role assignment
- Unified `/login` page with customer/staff modes, database-backed sales dashboards, and separately granted `sales:read`, `reports:read`, and `reports:export` permissions
- Dashboard KPIs, monthly revenue chart, status chart, top products, recent orders, and active promotions
- Date-filtered sales reports and CSV export
- Responsive dark UI, protected routes, loading/empty/error states, confirmations, and server/client validation

## Technology

React 19, Vite, TypeScript, Tailwind CSS, React Router, Recharts, Node.js, Express, MongoDB/Mongoose, JWT, bcrypt, Zod, Vitest, Jest, and Supertest.

## Structure

```text
frontend/                 React + Vite client
  src/components/         layout, guards, reusable product card
  src/context/            auth and cart state
  src/pages/              customer and staff pages
  src/lib/                API utilities
backend/                  Express API
  uploads/products/       persistent staff-uploaded product images (runtime data)
  src/controllers/        request handlers
  src/middleware/         authentication, roles, validation, errors
  src/models/             Mongoose schemas
  src/routes/             REST routes
  src/services/           pricing, inventory, and order rules
  tests/                  Jest/Supertest tests
```

## Installation

Requirements: Node.js 20+ and MongoDB 7+ (local MongoDB or MongoDB Atlas).

```bash
npm install
npm run install:all
```

Copy `backend/.env.example` to `backend/.env` and `frontend/.env.example` to `frontend/.env`. Set a long random `JWT_SECRET`. Never commit real secrets.

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/online_music_store` |
| `JWT_SECRET` | JWT signing secret | Development fallback; replace it |
| `JWT_EXPIRES_IN` | Token lifetime | `1d` |
| `PORT` | API port | `5000` |
| `FRONTEND_URL` | Allowed browser origin | `http://localhost:5173` |
| `HIGH_VALUE_ORDER_THRESHOLD` | Escalation total in USD | `2500` |
| `VITE_API_URL` | Browser API base URL | `http://localhost:5000/api` |

For Atlas, create a database user, allow your development IP, and place its connection URI in `backend/.env`. For local MongoDB, start the MongoDB service before seeding.

## Seed and run

The seed command replaces data in the configured database, then creates 24 products, eight categories, promotions, one example order, and one account per role.

```bash
npm run seed
npm run dev
```

To update image paths for products already present in the database without deleting or resetting any data, run:

```bash
cd backend
node src/updateProductImages.js
```

Seed product photography is stored locally under `frontend/public/images/products/` and mapped explicitly by SKU in `backend/src/data/productImages.js`. Images uploaded by staff are stored separately under `backend/uploads/products/` and served at `/uploads/products/<generated-filename>`.

Frontend: <http://localhost:5173>  
API health: <http://localhost:5000/api/health>

### Demo credentials

Every demo account uses password `Demo123!`.

| Role | Email |
|---|---|
| Customer | `customer@musicstore.demo` |
| Product Administrator | `product@musicstore.demo` |
| Inventory Manager | `inventory@musicstore.demo` |
| Order Manager | `orders@musicstore.demo` |
| Promotion Manager | `promotions@musicstore.demo` |
| System Administrator | `admin@musicstore.demo` |

These accounts are for development demonstrations only. Change or remove them before any deployment.

## API summary

All endpoints are under `/api`. Private endpoints require `Authorization: Bearer <token>`.

| Area | Endpoints |
|---|---|
| Authentication | `POST /auth/register`, `POST /auth/login` (`mode: customer \| staff`), `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/profile` |
| Products/categories | Public: `GET /products`, `GET /products/:id`; staff: `GET/POST /staff/products`; product administration: `POST /products`, `PATCH/DELETE /products/:id`; `GET/POST /categories` |
| Cart | `GET /cart`, `PUT /cart/:productId`, `DELETE /cart` |
| Orders/payment | `POST /orders`, `GET /orders/mine`, `GET /orders/manage`, `GET/PATCH /orders/:id`, `POST /orders/:id/pay` |
| Inventory | `GET /inventory`, `PATCH /inventory/:id`, `GET /inventory-movements`, `GET /low-stock-alerts` |
| Promotions | `GET/POST /promotions`, `PATCH/DELETE /promotions/:id` |
| Administration | `GET/POST /users`, `PATCH /users/:id`, `GET /dashboard` |
| Reports | `GET /reports/sales` (add `format=csv` to export) |
| Staff reporting | `GET /staff/dashboard`, `GET /staff/sales`, `GET /staff/reports`, `GET /staff/reports/export` |

## Staff portal and reporting

Open `http://localhost:5173/login` and select **Staff**. Customer and staff modes use the same user collection and password policy, while the API verifies that the authenticated database role is permitted to use the selected mode. There is no public staff registration. A System Administrator creates/deactivates staff and grants reporting permissions from **Admin → Staff accounts**. The former `/staff/login` browser route redirects to the Staff tab for existing bookmarks.

Existing databases do not need to be reset. If desired, initialize the permissions array on older staff records with:

```bash
cd backend
node src/data/migrateStaffPermissions.js
```

System Administrators always receive all three reporting permissions. Permission, role, password, or activation changes revoke that user's existing JWTs.

### Staff product creation

Every active staff role can open **Staff portal -> Products -> Add New Item**, or navigate directly to `http://localhost:5173/staff/products/new`. The page submits `multipart/form-data` to `POST /api/staff/products`; its file field is named `image`. Visitors receive `401`, customers receive `403`, and inactive staff are rejected even if they still hold an older token. Account roles are loaded from MongoDB for every authenticated request rather than trusted from form fields, JWT role claims, or browser storage.

Product creation accepts JPEG, PNG, or WebP images no larger than 5 MiB. The API checks both the declared media type and file structure, generates a non-user-controlled filename, and removes rejected uploads. Keep `backend/uploads/products/` on persistent storage and include it in backups; the directory is runtime data and is intentionally ignored by Git. In a horizontally scaled deployment, replace the local-disk adapter with shared object storage while keeping the saved image URL stable.

Names, brands, categories, descriptions, price, stock, SKU, low-stock threshold, and `draft`/`published` status are validated by the API. Stock and thresholds must be non-negative whole numbers; price cannot be negative. SKUs are normalized to uppercase and protected by a MongoDB unique index. `createdBy` comes from the authenticated staff account and cannot be supplied or changed by the browser. The initial quantity is recorded once in the inventory transaction history, including a zero opening balance.

Published products appear in the customer catalogue and search. Draft products remain visible only in the protected staff product list and cannot be viewed, added to a cart, or ordered through customer APIs. A published product with zero stock remains visible as **Out of Stock** and cannot be purchased. Existing products without a status remain publicly visible for backward compatibility, so this feature does not require a database reset or destructive migration.

Creation access is intentionally broader than maintenance access: Product Administrators, Inventory Managers, Order Managers, Promotion Managers, and System Administrators may create products, while the existing product edit and deactivate endpoints remain limited to Product Administrators and System Administrators.

### Revenue definition

- Store currency is USD and reporting timezone is `Asia/Colombo`.
- Revenue includes only `completed` simulated payments. Pending and failed payments contribute zero.
- A legacy payment marked `refunded` with no refund amount contributes zero; partial `refundedAmount` values are subtracted once from the captured payment.
- Merchandise and discount calculations use the immutable name, price, and quantity snapshots saved on order items—not current catalogue prices.
- The current checkout has no shipping or tax charge, so these are reported separately as zero rather than folded into merchandise revenue.
- Every dashboard, table, report, print view, and CSV is explicitly labelled as simulated-payment data.

## Tests and production build

```bash
npm test
npm run build
```

The default backend suite tests API validation/security boundaries and pure commerce rules without touching the development database.

## Screenshots

- `[Add home-page screenshot here]`
- `[Add product-catalogue screenshot here]`
- `[Add customer checkout screenshot here]`
- `[Add administrator-dashboard screenshot here]`

## Demonstration limitations

- Payments are intentionally simulated; no gateway or banking data is supported.
- Seed photography is repository-local and staff uploads use local persistent disk. Multi-instance production deployments should move uploaded files to shared object storage or a durable shared volume.
- MongoDB transactions require a replica set (Atlas has one by default). Use a local single-node replica set when demonstrating transactional checkout locally.
- Email, SMS, shipment-carrier integration, taxes, and refunds are outside this university-demo scope.
