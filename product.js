/**
 * product.js — Alibaba ICBU 商品管理（V2 API）
 *
 * 命令：
 *   opencli alibaba-api category-get        获取类目树
 *   opencli alibaba-api product-get <id>    获取商品详情
 *   opencli alibaba-api product-list        查询商品列表
 *   opencli alibaba-api product-search <kw> 按型号/SKU搜索商品
 *   opencli alibaba-api product-status <id> 查询商品上架状态
 *
 * 以上命令均需要 ALI_APP_KEY / ALI_APP_SECRET / ALI_ACCESS_TOKEN
 *
 * 实测响应结构（2026-04）：
 *   category-get  → { data: [{ category_id, category_name, level, leaf_category }] }
 *   product-get   → { success, product_info: { basic_info, category_info, trade_info } }
 *   product-list  → { result: { total_item, products: [{ id, subject, status, category_id, gmt_modified }] } }
 *   product-search→ { success, product_info: [{ basic_info, category_info, trade_info }] }
 *   product-status→ { product_id, status, ... } (需 product_id 单数参数)
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { alibabaCall } from './shared.js';

// ─── category-get：获取类目树 ─────────────────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'category-get',
    description: 'Get Alibaba ICBU category tree (requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'parent_id',
            type: 'str',
            default: '',
            help: 'Parent category ID (empty = root first-level categories)',
        },
        {
            name: 'language',
            type: 'str',
            default: 'en_US',
            help: 'Language code: en_US, zh_CN, etc.',
        },
    ],
    columns: ['category_id', 'name', 'level', 'leaf'],
    func: async (_page, kwargs) => {
        const params = { language: String(kwargs.language || 'en_US') };
        if (kwargs.parent_id) {
            params.parent_category_id = String(kwargs.parent_id);
        }

        const data = await alibabaCall('/alibaba/icbu/category/get/v2', params);

        // 实测：{ data: [{ category_id, category_name, level, leaf_category }] }
        const categories = data.data ?? [];

        if (!Array.isArray(categories) || categories.length === 0) {
            return [];
        }

        return categories.map(cat => ({
            category_id: cat.category_id ?? '-',
            name: cat.category_name ?? cat.name ?? '-',
            level: cat.level ?? '-',
            leaf: cat.leaf_category ?? cat.is_leaf ?? false,
        }));
    },
});

// ─── product-get：获取商品详情 ────────────────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'product-get',
    description: 'Get Alibaba ICBU product details by product ID (requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'product_id',
            required: true,
            positional: true,
            help: 'Product ID (numeric), e.g. 10000041447815',
        },
        {
            name: 'language',
            type: 'str',
            default: 'en_US',
            help: 'Language code: en_US, zh_CN, etc.',
        },
    ],
    columns: ['field', 'value'],
    func: async (_page, kwargs) => {
        const params = {
            product_id: String(kwargs.product_id ?? '').trim(),
            language: String(kwargs.language || 'en_US'),
        };

        const data = await alibabaCall('/alibaba/icbu/product/get/v2', params);

        // 实测：{ success, product_info: { basic_info, category_info, trade_info } }
        const info = data.product_info ?? {};
        const basic = info.basic_info ?? {};
        const category = info.category_info ?? {};
        const trade = info.trade_info ?? {};

        const rows = [
            { field: 'product_id', value: basic.product_id ?? kwargs.product_id },
            { field: 'title', value: basic.title ?? '-' },
            { field: 'status', value: basic.status ?? '-' },
            { field: 'audit_status', value: basic.audit_status ?? '-' },
            { field: 'category', value: category.category_name ?? '-' },
            { field: 'category_id', value: category.category_id ?? '-' },
            { field: 'keywords', value: basic.keywords ?? '-' },
            { field: 'moq', value: trade.moq != null ? `${trade.moq} ${trade.unit ?? ''}`.trim() : '-' },
            { field: 'created_at', value: basic.create_timestamp ? new Date(basic.create_timestamp).toISOString().slice(0, 10) : '-' },
            { field: 'modified_at', value: basic.last_modified_timestamp ? new Date(basic.last_modified_timestamp).toISOString().slice(0, 10) : '-' },
            { field: 'image_count', value: Array.isArray(basic.product_images) ? basic.product_images.length : '-' },
        ];

        // 价格（tiered 取第一档，range 取区间）
        const price = trade.price ?? {};
        if (price.price_type === 'TIERED' && Array.isArray(price.tiered_price)) {
            const first = price.tiered_price[0];
            rows.push({ field: 'price', value: `${first.price} ${price.currency ?? 'USD'} (qty≥${first.quantity})` });
        } else if (price.price_type === 'RANGE') {
            const rp = price.range_price ?? {};
            rows.push({ field: 'price_range', value: `${rp.min ?? '-'} ~ ${rp.max ?? '-'} ${price.currency ?? 'USD'}` });
        }

        return rows;
    },
});

// ─── product-list：查询商品列表 ───────────────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'product-list',
    description: 'List Alibaba ICBU products with optional keyword/category/status filter (requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'keyword',
            type: 'str',
            default: '',
            help: 'Product name keyword filter',
        },
        {
            name: 'category_id',
            type: 'str',
            default: '',
            help: 'Category ID filter',
        },
        {
            name: 'status',
            type: 'str',
            default: '',
            help: 'Product status filter: published, member_deleted, unsafe_deleted, modify',
        },
        {
            name: 'limit',
            type: 'int',
            default: 20,
            help: 'Products per page (max 30)',
        },
        {
            name: 'page',
            type: 'int',
            default: 1,
            help: 'Page number (starts from 1)',
        },
        {
            name: 'language',
            type: 'str',
            default: 'en_US',
            help: 'Language code: en_US, zh_CN, etc.',
        },
    ],
    columns: ['rank', 'product_id', 'subject', 'status', 'display', 'category_id', 'gmt_modified'],
    func: async (_page, kwargs) => {
        const limit = Math.min(Number(kwargs.limit) || 20, 30);
        const pageNo = Number(kwargs.page) || 1;

        const params = {
            current_page: String(pageNo),
            page_size: String(limit),
            language: String(kwargs.language || 'en_US'),
        };

        if (kwargs.keyword) params.subject = String(kwargs.keyword);
        if (kwargs.category_id) params.category_id = String(kwargs.category_id);
        if (kwargs.status) params.product_status_type = String(kwargs.status);

        const data = await alibabaCall('/alibaba/icbu/product/list', params);

        // 实测：{ result: { total_item, curr_page, page_size, products: [...] } }
        const products = data.result?.products ?? [];

        if (!Array.isArray(products) || products.length === 0) {
            return [];
        }

        return products.map((p, idx) => ({
            rank: (pageNo - 1) * limit + idx + 1,
            product_id: p.id ?? '-',           // 实测字段名为 id
            subject: String(p.subject ?? '').slice(0, 55),
            status: p.status ?? '-',
            display: p.display ?? '-',
            category_id: p.category_id ?? '-',
            gmt_modified: p.gmt_modified ?? '-',
        }));
    },
});

// ─── product-search：按型号/SKU码搜索商品 ────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'product-search',
    description: 'Search Alibaba ICBU products by model number or SKU code (requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'keyword',
            required: true,
            positional: true,
            help: 'Model number or SKU code to search',
        },
        {
            name: 'limit',
            type: 'int',
            default: 20,
            help: 'Results per page (max 30)',
        },
        {
            name: 'page',
            type: 'int',
            default: 1,
            help: 'Page number',
        },
    ],
    columns: ['rank', 'product_id', 'title', 'status', 'audit_status', 'category', 'moq'],
    func: async (_page, kwargs) => {
        const limit = Math.min(Number(kwargs.limit) || 20, 30);
        const pageNo = Number(kwargs.page) || 1;

        const params = {
            model_number_or_sku_code: String(kwargs.keyword ?? '').trim(),
            current_page: String(pageNo),
            page_size: String(limit),
        };

        const data = await alibabaCall('/alibaba/icbu/product/search/v2', params);

        // 实测：{ success, product_info: [{ basic_info, category_info, trade_info }] }
        const products = data.product_info ?? [];

        if (!Array.isArray(products) || products.length === 0) {
            return [];
        }

        return products.map((p, idx) => {
            const basic = p.basic_info ?? {};
            const category = p.category_info ?? {};
            const trade = p.trade_info ?? {};
            return {
                rank: (pageNo - 1) * limit + idx + 1,
                product_id: basic.product_id ?? '-',
                title: String(basic.title ?? '').slice(0, 55),
                status: basic.status ?? '-',
                audit_status: basic.audit_status ?? '-',
                category: String(category.category_name ?? '').split(' / ').pop() ?? '-',
                moq: trade.moq != null ? `${trade.moq} ${trade.unit ?? ''}`.trim() : '-',
            };
        });
    },
});

// ─── product-status：查询商品上架状态 ────────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'product-status',
    description: 'Get Alibaba ICBU product publish status by product ID (requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'product_id',
            required: true,
            positional: true,
            help: 'Product ID (use id field from product-list, e.g. 10000041447815)',
        },
    ],
    columns: ['field', 'value'],
    func: async (_page, kwargs) => {
        const params = { product_id: String(kwargs.product_id ?? '').trim() };

        const data = await alibabaCall('/alibaba/icbu/product/status/get/v2', params);

        // 实测：{ result: { data: { status, status_desc }, success }, code: '0' }
        const info = data.result?.data ?? {};
        return [
            { field: 'product_id', value: kwargs.product_id },
            { field: 'status', value: info.status ?? '-' },
            { field: 'status_desc', value: info.status_desc || '(none)' },
            { field: 'success', value: String(data.result?.success ?? false) },
        ];
    },
});
