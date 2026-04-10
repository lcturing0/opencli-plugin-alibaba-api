# opencli-plugin-alibaba-api

An [OpenCLI](https://github.com/jackwener/opencli) plugin — Manage Alibaba.com Open Platform via CLI: OAuth tokens, product catalog (ICBU V2), and order operations.

## Install

```bash
# Via opencli plugin manager (recommended)
opencli plugin install github:lcturing0/opencli-plugin-alibaba-api

# List installed plugins
opencli plugin list

# Update plugin
opencli plugin update alibaba-api
```

## Requirements

- [OpenCLI](https://github.com/jackwener/opencli) v1.6.9+
- Alibaba Open Platform app credentials ([apply here](https://openapi.alibaba.com))

## Configuration

Set the following environment variables before using any command:

```bash
export ALI_APP_KEY=<your_app_key>
export ALI_APP_SECRET=<your_app_secret>
export ALI_ACCESS_TOKEN=<your_access_token>   # not required for auth commands
```

Tip: Add them to your shell profile (`~/.zshrc` or `~/.bashrc`) so they persist across sessions.

## Usage

### Auth — Get an access token

**Step 1: Generate the OAuth authorization URL**

```bash
opencli alibaba-api auth-url "https://yoursite.com/callback"
```

Open the printed `auth_url` in a browser, log in with your Alibaba account, and copy the `code=` value from the redirect URL.

**Step 2: Exchange code for access token**

```bash
opencli alibaba-api token-create <code>
```

**Step 3: Refresh an expired token**

```bash
opencli alibaba-api token-refresh <refresh_token>
```

---

### Product — ICBU V2 catalog

**Get category tree**

```bash
# Root level (50+ categories)
opencli alibaba-api category-get

# Drill into a category by ID
opencli alibaba-api category-get --parent_id 3
```

**List your products**

```bash
opencli alibaba-api product-list --limit 10
opencli alibaba-api product-list --keyword "dress" --limit 5
opencli alibaba-api product-list --status approved
```

**Get product details**

```bash
opencli alibaba-api product-get 10000041447815
```

**Search by model number / SKU code**

```bash
opencli alibaba-api product-search "SF8-200C"
opencli alibaba-api product-search "USB-C cable" --limit 5
```

**Get product publish status**

```bash
opencli alibaba-api product-status 10000041447815
```

---

### Order — transaction management

**List orders**

```bash
opencli alibaba-api order-list
opencli alibaba-api order-list --status wait_seller_confirmed
opencli alibaba-api order-list --start "2024-01-01 00:00:00" --end "2024-12-31 23:59:59"
```

**Get order details**

```bash
opencli alibaba-api order-get 219602191501223876
```

**Track order logistics** *(requires additional API permission)*

```bash
opencli alibaba-api order-tracking 219602191501223876
```

**Cancel an order**

```bash
opencli alibaba-api order-cancel 219602191501223876 --reason "Out of stock"
```

---

## Output Formats

All commands support `-f / --format`:

| Format | Flag | Use case |
|--------|------|----------|
| table  | `-f table` | Human-readable (default) |
| json   | `-f json` | Pipe to `jq` or AI agents |
| yaml   | `-f yaml` | Readable structured output |
| csv    | `-f csv` | Spreadsheet import |

Example:

```bash
opencli alibaba-api order-list -f json | jq '.[].trade_id'
opencli alibaba-api product-list -f csv > products.csv
```

---

## Commands Reference

### Auth

| Command | Description |
|---------|-------------|
| `auth-url <redirect_uri>` | Generate OAuth authorization URL |
| `token-create <code>` | Exchange auth code for access token |
| `token-refresh <refresh_token>` | Refresh an expired access token |

### Seller — ICBU Product (V2)

| Command | Description |
|---------|-------------|
| `category-get` | Get ICBU category tree |
| `product-get <product_id>` | Get product details (seller view) |
| `product-list` | List own products with optional filters |
| `product-search <keyword>` | Search by model number or SKU code |
| `product-status <product_id>` | Get product publish status |

### Seller — Order

| Command | Description |
|---------|-------------|
| `order-list` | List orders with optional filters |
| `order-get <trade_id>` | Get order details |
| `order-tracking <trade_id>` | Get logistics tracking *(extra permission needed)* |
| `order-cancel <trade_id>` | Cancel an order |

### Buyer — Product (cid=7)

| Command | Description |
|---------|-------------|
| `buyer-search <keyword>` | Search Alibaba.com products by keyword |
| `buyer-desc <product_id>` | Get full product detail: title, SKUs, price ladder, images |
| `buyer-attrs <product_id>` | Get product key attributes by country |
| `buyer-cert <product_id>` | Get product certificates |
| `buyer-inventory <product_id>` | Get SKU-level inventory by shipping origin |
| `buyer-list <product_type>` | Get product ID list by type (US_CGS_48H, alibaba_picks, etc.) |
| `buyer-crossborder` | List cross-border inventory product IDs |
| `buyer-local` | List overseas local inventory product IDs |
| `buyer-local-regular` | List overseas local regular-fulfillment product IDs |
| `buyer-image-search <item_id>` | Find visually similar products by product ID |
| `buyer-rec <item_id>` | Product recommendations: similar / hot-selling / image (--type 1-3) |
| `buyer-events <product_id>` | Notify channel product listed/delisted events *(POST)* |
| `buyer-channel-import <ids>` | Batch import products to external channel store *(POST)* |

---

## Plugin Layout

```
opencli-plugin-alibaba-api/
├── package.json          # ESM package, peerDependency on @jackwener/opencli
├── opencli-plugin.json   # plugin metadata
├── shared.js             # signing, API call utilities
├── auth.js               # token-create, token-refresh, auth-url
├── product.js            # category/product commands
└── order.js              # order commands
```

Pre-compiled `.js` files are shipped so users don't need esbuild installed.

## API Reference

- [Alibaba Open Platform Docs](https://openapi.alibaba.com/doc/api.htm)
- [Signing Algorithm](https://openapi.alibaba.com/doc/doc.htm#/?docId=60)
- [OAuth Guide](https://openapi.alibaba.com/doc/doc.htm#/?docId=59)

## License

MIT
