/**
 * buyer-product.js — Alibaba 买家侧商品 API（cid=7）
 *
 * 参数传递规范（实测）：
 *   /eco/buyer/ GET 接口的业务参数必须整体序列化为 JSON 字符串，
 *   用固定的外层包装键传递，例如：
 *     param0={"keyword":"earbuds","size":20,"index":1}
 *     query_req={"product_id":123,"country":"US"}
 *   包装键因接口而异，见各命令注释。
 *
 * POST 接口（buyer-events / buyer-channel-import）：
 *   使用 alibabaPost()，业务参数作为 JSON body 发送。
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { alibabaCall, alibabaPost } from './shared.js';

// ─── buyer-search：关键词搜索商品（包装键: param0）────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-search',
    description: 'Search Alibaba.com products by keyword (buyer view, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'keyword',
            required: true,
            positional: true,
            help: 'Search keyword, e.g. "wireless earbuds"',
        },
        {
            name: 'size',
            type: 'int',
            default: 20,
            help: 'Results per page (max 50)',
        },
        {
            name: 'index',
            type: 'int',
            default: 1,
            help: 'Page number (starts from 1)',
        },
        {
            name: 'country',
            type: 'str',
            default: 'US',
            help: 'Ship-to country (ISO 3166-1 alpha-2): US, GB, CA, etc.',
        },
        {
            name: 'currency',
            type: 'str',
            default: 'USD',
            help: 'Currency code (ISO 4217): USD, EUR, CNY, etc.',
        },
        {
            name: 'language',
            type: 'str',
            default: 'en',
            help: 'Language code: en, zh, fr, etc.',
        },
        {
            name: 'ship_from',
            type: 'str',
            default: '',
            help: 'Ship-from country: US, CN, IN, DE, ES, IT, VN, MX',
        },
        {
            name: 'product_type',
            type: 'str',
            default: '',
            help: 'Product type filter: crossborder, alibaba_picks, US_CGS_48H, US_GGS_POD, etc.',
        },
    ],
    columns: ['rank', 'product_id', 'title', 'price', 'permalink'],
    func: async (_page, kwargs) => {
        const size = Math.min(Number(kwargs.size) || 20, 50);
        const inner = {
            keyword: String(kwargs.keyword ?? '').trim(),
            size,
            index: Number(kwargs.index) || 1,
            shipToCountry: String(kwargs.country || 'US'),
            currency: String(kwargs.currency || 'USD'),
            language: String(kwargs.language || 'en'),
        };
        if (kwargs.ship_from) inner.shipFrom = String(kwargs.ship_from);
        if (kwargs.product_type) inner.productType = String(kwargs.product_type);

        // 实测：业务参数整体序列化为 JSON 字符串，用 param0 传递
        const data = await alibabaCall('/eco/buyer/product/search', { param0: JSON.stringify(inner) });

        // { result: { code, data: { pagination, products[] } } }
        const products = data.result?.data?.products ?? data.result?.products ?? [];

        if (!Array.isArray(products) || products.length === 0) {
            return [];
        }

        return products.map((p, idx) => ({
            rank: (Number(kwargs.index) - 1) * size + idx + 1,
            product_id: p.product_id ?? '-',
            title: String(p.title ?? '').slice(0, 60),
            price: p.price ?? '-',
            permalink: p.permalink ?? '-',
        }));
    },
});

// ─── buyer-desc：获取商品详情（包装键: query_req）────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-desc',
    description: 'Get Alibaba product detail: title, SKUs, price ladder, images (buyer view, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'product_id',
            required: true,
            positional: true,
            help: 'Alibaba product ID (numeric)',
        },
        {
            name: 'country',
            type: 'str',
            default: 'US',
            help: 'Country code (ISO 3166-1 alpha-2)',
        },
        {
            name: 'currency',
            type: 'str',
            default: 'USD',
            help: 'Currency code (ISO 4217)',
        },
        {
            name: 'language',
            type: 'str',
            default: 'en-US',
            help: 'Language code (IETF BCP 47): en-US, zh-CN, etc.',
        },
    ],
    columns: ['field', 'value'],
    func: async (_page, kwargs) => {
        const inner = {
            product_id: Number(kwargs.product_id),
            country: String(kwargs.country || 'US'),
            currency: String(kwargs.currency || 'USD'),
            language: String(kwargs.language || 'en-US'),
        };

        const data = await alibabaCall('/eco/buyer/product/description', { query_req: JSON.stringify(inner) });
        const d = data.result?.result_data ?? data.result_data ?? data;

        const rows = [
            { field: 'product_id', value: d.product_id ?? kwargs.product_id },
            { field: 'title', value: d.title ?? '-' },
            { field: 'status', value: d.status ?? '-' },
            { field: 'category', value: d.category ?? '-' },
            { field: 'category_id', value: d.category_id ?? '-' },
            { field: 'supplier', value: d.supplier ?? '-' },
            { field: 'moq', value: d.min_order_quantity ?? '-' },
            { field: 'currency', value: d.currency ?? '-' },
            { field: 'main_image', value: d.main_image ?? '-' },
            { field: 'detail_url', value: d.detail_url ?? '-' },
            { field: 'sku_count', value: Array.isArray(d.skus) ? d.skus.length : '-' },
        ];

        // 输出前 3 个 SKU 的属性和阶梯价格
        const skus = Array.isArray(d.skus) ? d.skus.slice(0, 3) : [];
        skus.forEach((sku, i) => {
            const ladder = Array.isArray(sku.ladder_price) ? sku.ladder_price : [];
            const priceStr = ladder
                .map(l => `≥${l.min_quantity}: ${l.price} ${l.currency ?? ''}`)
                .join(' | ');
            const attrs = Array.isArray(sku.sku_attr_list)
                ? sku.sku_attr_list.map(a => `${a.attr_name_desc}=${a.attr_value_desc}`).join(', ')
                : '-';
            rows.push({ field: `sku_${i + 1}`, value: `[${attrs}] ${priceStr || '-'}` });
        });

        return rows;
    },
});

// ─── buyer-attrs：获取商品关键属性（包装键: query_req）───────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-attrs',
    description: 'Get key attributes of an Alibaba product (buyer view, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'product_id',
            required: true,
            positional: true,
            help: 'Alibaba product ID (numeric)',
        },
        {
            name: 'country',
            type: 'str',
            default: 'US',
            help: 'Country code (ISO 3166-1 alpha-2, required)',
        },
    ],
    columns: ['group', 'attribute', 'values'],
    func: async (_page, kwargs) => {
        const inner = {
            product_id: Number(kwargs.product_id),
            country: String(kwargs.country || 'US'),
        };

        const data = await alibabaCall('/eco/buyer/product/keyattributes', { query_req: JSON.stringify(inner) });
        const attrGroups = data.result?.result_data?.attributes ?? data.result_data?.attributes ?? [];

        if (!Array.isArray(attrGroups) || attrGroups.length === 0) {
            return [];
        }

        const rows = [];
        attrGroups.forEach(group => {
            const attrs = Array.isArray(group.attributes) ? group.attributes : [];
            attrs.forEach(attr => {
                const vals = Array.isArray(attr.values)
                    ? attr.values.map(v => v.value).join(', ')
                    : '-';
                rows.push({ group: group.type ?? '-', attribute: attr.name ?? '-', values: vals });
            });
        });

        return rows;
    },
});

// ─── buyer-cert：获取商品证书（包装键: req）───────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-cert',
    description: 'Get product certificates by product ID (buyer view, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'product_id',
            required: true,
            positional: true,
            help: 'Alibaba product ID (numeric)',
        },
    ],
    columns: ['cert_name', 'cert_no', 'image_count'],
    func: async (_page, kwargs) => {
        const data = await alibabaCall('/eco/buyer/product/cert', {
            req: JSON.stringify({ product_id: Number(kwargs.product_id) }),
        });
        const certs = data.result?.result_data ?? data.result_data ?? [];

        if (!Array.isArray(certs) || certs.length === 0) {
            return [];
        }

        return certs.map(c => ({
            cert_name: c.cert_name ?? '-',
            cert_no: c.cert_no ?? '-',
            image_count: Array.isArray(c.cert_urls) ? c.cert_urls.length : 0,
        }));
    },
});

// ─── buyer-inventory：查询商品库存（包装键: inv_req）─────────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-inventory',
    description: 'Get product inventory by product ID and shipping origin (buyer view, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'product_id',
            required: true,
            positional: true,
            help: 'Alibaba product ID (numeric)',
        },
        {
            name: 'ship_from',
            type: 'str',
            default: 'CN',
            help: 'Shipping origin: CN, US, UK, CA, AU, DE, FR, VN, TR, etc.',
        },
    ],
    columns: ['shipping_from', 'sku_id', 'inventory_count', 'unit'],
    func: async (_page, kwargs) => {
        const inner = {
            product_id: Number(kwargs.product_id),
            shipping_from: String(kwargs.ship_from || 'CN'),
        };

        const data = await alibabaCall('/eco/buyer/product/inventory', { inv_req: JSON.stringify(inner) });
        const inventoryData = data.result?.result_data ?? data.result_data ?? [];

        if (!Array.isArray(inventoryData) || inventoryData.length === 0) {
            return [];
        }

        const rows = [];
        inventoryData.forEach(item => {
            (Array.isArray(item.inventory_list) ? item.inventory_list : []).forEach(sku => {
                rows.push({
                    shipping_from: item.shipping_from ?? '-',
                    sku_id: sku.sku_id ?? '-',
                    inventory_count: sku.inventory_count ?? 0,
                    unit: sku.inventory_unit ?? '-',
                });
            });
        });

        return rows;
    },
});

// ─── buyer-list：按类型获取商品 ID 列表（包装键: query_req）──────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-list',
    description: 'Get product ID list by product type (buyer view, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'product_type',
            required: true,
            positional: true,
            help: 'Type: US_CGS_48H, US_GGS_48H, US_TOTAL_48H, US_GGS_Hotselling, US_GGS_POD, US_GGS_Branded, US_GGS_Trendy, MX_GGS_48H, EU_GGS_48H, crossborder, alibaba_picks, etc.',
        },
        {
            name: 'size',
            type: 'int',
            default: 50,
            help: 'Number of products to fetch (max 300)',
        },
        {
            name: 'index',
            type: 'int',
            default: 0,
            help: 'Page index (starts from 0)',
        },
    ],
    columns: ['rank', 'product_id'],
    func: async (_page, kwargs) => {
        const size = Math.min(Number(kwargs.size) || 50, 300);
        const index = Number(kwargs.index) || 0;
        const inner = { product_type: String(kwargs.product_type ?? '').trim(), size, index };

        const data = await alibabaCall('/eco/buyer/product/check', { query_req: JSON.stringify(inner) });
        const ids = data.result?.result_data ?? data.result_data ?? [];

        if (!Array.isArray(ids) || ids.length === 0) {
            return [];
        }

        return ids.map((id, idx) => ({ rank: index * size + idx + 1, product_id: id }));
    },
});

// ─── buyer-crossborder：跨境库存商品列表（包装键: param0）────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-crossborder',
    description: 'List Alibaba products with cross-border inventory (buyer view, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'size', type: 'int', default: 50, help: 'Number of products (max 300)' },
        { name: 'index', type: 'int', default: 0, help: 'Page index (starts from 0)' },
    ],
    columns: ['rank', 'product_id'],
    func: async (_page, kwargs) => {
        const size = Math.min(Number(kwargs.size) || 50, 300);
        const index = Number(kwargs.index) || 0;

        const data = await alibabaCall('/eco/buyer/crossborder/product/check', {
            param0: JSON.stringify({ size, index }),
        });
        const ids = data.result?.result_data ?? data.result_data ?? [];

        if (!Array.isArray(ids) || ids.length === 0) {
            return [];
        }

        return ids.map((id, idx) => ({ rank: index * size + idx + 1, product_id: id }));
    },
});

// ─── buyer-local：海外本地库存商品列表（包装键: req）─────────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-local',
    description: 'List Alibaba products with overseas local inventory (buyer view, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'size', type: 'int', default: 50, help: 'Number of products (max 300)' },
        { name: 'index', type: 'int', default: 0, help: 'Page index (starts from 0)' },
    ],
    columns: ['rank', 'product_id'],
    func: async (_page, kwargs) => {
        const size = Math.min(Number(kwargs.size) || 50, 300);
        const index = Number(kwargs.index) || 0;

        const data = await alibabaCall('/eco/buyer/local/product/check', {
            req: JSON.stringify({ size, index }),
        });
        const ids = data.result?.result_data ?? data.result_data ?? [];

        if (!Array.isArray(ids) || ids.length === 0) {
            return [];
        }

        return ids.map((id, idx) => ({ rank: index * size + idx + 1, product_id: id }));
    },
});

// ─── buyer-local-regular：海外普通履约商品列表（包装键: req）─────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-local-regular',
    description: 'List Alibaba products with overseas local inventory (regular fulfillment, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        { name: 'size', type: 'int', default: 50, help: 'Number of products (max 300)' },
        { name: 'index', type: 'int', default: 0, help: 'Page index (starts from 0)' },
    ],
    columns: ['rank', 'product_id'],
    func: async (_page, kwargs) => {
        const size = Math.min(Number(kwargs.size) || 50, 300);
        const index = Number(kwargs.index) || 0;

        const data = await alibabaCall('/eco/buyer/localregular/product/check', {
            req: JSON.stringify({ size, index }),
        });
        const ids = data.result?.result_data ?? data.result_data ?? [];

        if (!Array.isArray(ids) || ids.length === 0) {
            return [];
        }

        return ids.map((id, idx) => ({ rank: index * size + idx + 1, product_id: id }));
    },
});

// ─── buyer-image-search：以图搜图（包装键: recReq）───────────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-image-search',
    description: 'Search visually similar products by product ID image (buyer view, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'item_id',
            required: true,
            positional: true,
            help: 'Source product ID to search visually similar products',
        },
        { name: 'size', type: 'int', default: 20, help: 'Results per page' },
        { name: 'index', type: 'int', default: 0, help: 'Page index (starts from 0)' },
    ],
    columns: ['rank', 'product_id', 'price', 'permalink'],
    func: async (_page, kwargs) => {
        const size = Number(kwargs.size) || 20;
        const index = Number(kwargs.index) || 0;
        const inner = { item_id: Number(kwargs.item_id), size, index };

        const data = await alibabaCall('/eco/buyer/item/rec/image', { recReq: JSON.stringify(inner) });
        const products = data.result?.result_data?.products ?? data.result_data?.products ?? [];

        if (!Array.isArray(products) || products.length === 0) {
            return [];
        }

        return products.map((p, idx) => ({
            rank: index * size + idx + 1,
            product_id: p.product_id ?? '-',
            price: p.price ?? '-',
            permalink: p.permalink ?? '-',
        }));
    },
});

// ─── buyer-rec：商品推荐（包装键: recReq）────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-rec',
    description: 'Get product recommendations by item ID (buyer view, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'item_id',
            required: true,
            positional: true,
            help: 'Source product ID',
        },
        {
            name: 'type',
            type: 'int',
            default: 2,
            help: 'Recommendation type: 1=image search, 2=similar products, 3=frequently sold together',
        },
        { name: 'size', type: 'int', default: 20, help: 'Results per page' },
        { name: 'index', type: 'int', default: 0, help: 'Page index (starts from 0)' },
    ],
    columns: ['rank', 'product_id', 'price', 'permalink'],
    func: async (_page, kwargs) => {
        const size = Number(kwargs.size) || 20;
        const index = Number(kwargs.index) || 0;
        const inner = { item_id: Number(kwargs.item_id), type: Number(kwargs.type) || 2, size, index };

        const data = await alibabaCall('/eco/buyer/item/rec', { recReq: JSON.stringify(inner) });
        const products = data.result?.result_data?.products ?? data.result_data?.products ?? [];

        if (!Array.isArray(products) || products.length === 0) {
            return [];
        }

        return products.map((p, idx) => ({
            rank: index * size + idx + 1,
            product_id: p.product_id ?? '-',
            price: p.price ?? '-',
            permalink: p.permalink ?? '-',
        }));
    },
});

// ─── buyer-events：通知渠道商品事件（POST）────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-events',
    description: 'Notify Alibaba of product listed/delisted events from external channels (POST, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'product_id',
            required: true,
            positional: true,
            help: 'Alibaba product ID',
        },
        {
            name: 'event_type',
            type: 'str',
            default: 'PRODUCT_LISTED',
            help: 'Event type: PRODUCT_LISTED, PRODUCT_DELISTED, ORDER_PLACED',
        },
        {
            name: 'channel',
            type: 'str',
            default: '',
            help: 'Channel identifier (uppercase): SHOPIFY, AMAZON, TEMU, WALMART, SHEIN, MERCADO, etc.',
        },
        {
            name: 'store_id',
            type: 'str',
            default: '',
            help: 'Channel store ID (optional)',
        },
    ],
    columns: ['field', 'value'],
    func: async (_page, kwargs) => {
        const event = {
            ali_product_id: Number(kwargs.product_id),
            event_type: String(kwargs.event_type || 'PRODUCT_LISTED'),
        };
        if (kwargs.channel) event.channel = String(kwargs.channel).toUpperCase();
        if (kwargs.store_id) event.channel_store_id = String(kwargs.store_id);

        const data = await alibabaPost('/eco/buyer/product/events', { query_req: { events: [event] } });
        const result = data.result ?? data;

        return [
            { field: 'result_code', value: result.result_code ?? data.code ?? '-' },
            { field: 'result_message', value: result.result_message ?? '-' },
            { field: 'total', value: result.result_data?.total ?? '-' },
        ];
    },
});

// ─── buyer-channel-import：批量导入商品到渠道店铺（POST）─────────────────────
cli({
    site: 'alibaba-api',
    name: 'buyer-channel-import',
    description: 'Batch import Alibaba products to an external channel store (POST, requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'product_ids',
            required: true,
            positional: true,
            help: 'Comma-separated Alibaba product IDs (max 100), e.g. "123,456,789"',
        },
        {
            name: 'ecology_type',
            type: 'str',
            required: true,
            help: 'Channel identifier (uppercase): SHOPIFY, WIX, MERCADO, etc.',
        },
        {
            name: 'language',
            type: 'str',
            default: 'en-US',
            help: 'Language code (IETF BCP 47): en-US, zh-CN, etc.',
        },
        {
            name: 'store_id',
            type: 'str',
            default: '',
            help: 'Channel store ID (optional)',
        },
        {
            name: 'instance_id',
            type: 'str',
            default: '',
            help: 'Channel instance ID (optional)',
        },
    ],
    columns: ['field', 'value'],
    func: async (_page, kwargs) => {
        const ids = String(kwargs.product_ids ?? '')
            .split(',')
            .map(s => Number(s.trim()))
            .filter(n => n > 0)
            .slice(0, 100);

        if (ids.length === 0) {
            throw new Error('No valid product IDs provided.');
        }

        const req = {
            ecology_type: String(kwargs.ecology_type ?? '').toUpperCase(),
            product_ids: ids,
            language: String(kwargs.language || 'en-US'),
        };
        if (kwargs.store_id) req.ecology_store_id = String(kwargs.store_id);
        if (kwargs.instance_id) req.ecology_instance_id = String(kwargs.instance_id);

        const data = await alibabaPost('/eco/buyer/product/channel/batch-import', { query_req: req });
        const result = data.result ?? data;

        return [
            { field: 'result_code', value: result.result_code ?? data.code ?? '-' },
            { field: 'result_message', value: String(result.result_message ?? '-') },
            { field: 'pending_count', value: result.result_data?.pending_count ?? '-' },
            { field: 'site_id', value: result.result_data?.site_id ?? '-' },
            { field: 'product_count', value: ids.length },
        ];
    },
});
