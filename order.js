/**
 * order.js — Alibaba 订单管理
 *
 * 命令：
 *   opencli alibaba-api order-list           查询订单列表
 *   opencli alibaba-api order-get <id>       获取订单详情
 *   opencli alibaba-api order-tracking <id>  查询物流轨迹（需特殊权限）
 *   opencli alibaba-api order-cancel <id>    取消订单
 *
 * 以上命令均需要 ALI_APP_KEY / ALI_APP_SECRET / ALI_ACCESS_TOKEN
 *
 * 实测响应结构（2026-04）：
 *   order-list → { value: { total_count, order_list: [{ trade_id, trade_status, create_date }] } }
 *   order-get  → { value: { trade_id, trade_status, order_products, shipping_address, ... } }
 *   order-tracking → 需要额外权限（ISP: Insufficient permissions）
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { alibabaCall, formatAmount } from './shared.js';

// ─── order-list：查询订单列表 ─────────────────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'order-list',
    description: 'Query Alibaba order list by status or time range (requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'role',
            type: 'str',
            default: 'seller',
            help: 'Viewing role: seller or buyer',
        },
        {
            name: 'status',
            type: 'str',
            default: '',
            help: 'Order status: wait_seller_confirmed, wait_seller_send, wait_buyer_confirm, success, cancel',
        },
        {
            name: 'start',
            type: 'str',
            default: '',
            help: 'Create time start (format: yyyy-MM-dd HH:mm:ss)',
        },
        {
            name: 'end',
            type: 'str',
            default: '',
            help: 'Create time end (format: yyyy-MM-dd HH:mm:ss)',
        },
        {
            name: 'limit',
            type: 'int',
            default: 20,
            help: 'Orders per page (max 50)',
        },
        {
            name: 'page',
            type: 'int',
            default: 1,
            help: 'Page number (starts from 1)',
        },
    ],
    columns: ['trade_id', 'status', 'created_at', 'modified_at'],
    func: async (_page, kwargs) => {
        const limit = Math.min(Number(kwargs.limit) || 20, 50);
        const pageNo = Number(kwargs.page) || 1;

        const params = {
            role: String(kwargs.role || 'seller'),
            page: String(pageNo),
            page_size: String(limit),
        };

        if (kwargs.status) params.status = String(kwargs.status);
        if (kwargs.start) params.create_start_time = String(kwargs.start);
        if (kwargs.end) params.create_end_time = String(kwargs.end);

        const data = await alibabaCall('/alibaba/order/list', params);

        // 实测：{ value: { total_count, order_list: [{ trade_id, trade_status, create_date, modify_date }] } }
        const orders = data.value?.order_list ?? [];

        if (!Array.isArray(orders) || orders.length === 0) {
            return [];
        }

        return orders.map(o => ({
            trade_id: o.trade_id ?? '-',
            status: o.trade_status ?? '-',
            created_at: o.create_date?.format_date ?? '-',
            modified_at: o.modify_date?.format_date ?? '-',
        }));
    },
});

// ─── order-get：获取订单详情 ──────────────────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'order-get',
    description: 'Get Alibaba order details by trade ID (requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'trade_id',
            required: true,
            positional: true,
            help: 'Trade ID from order-list (e.g. 219602191501223876)',
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
            e_trade_id: String(kwargs.trade_id ?? '').trim(),
            language: String(kwargs.language || 'en_US'),
        };

        const data = await alibabaCall('/alibaba/order/get', params);

        // 实测：{ value: { trade_id, trade_status, order_products, shipping_address, ... } }
        const order = data.value ?? {};

        const addr = order.shipping_address ?? {};
        const products = Array.isArray(order.order_products) ? order.order_products : [];

        const rows = [
            { field: 'trade_id', value: order.trade_id ?? kwargs.trade_id },
            { field: 'status', value: order.trade_status ?? '-' },
            { field: 'fulfillment_channel', value: order.fulfillment_channel ?? '-' },
            { field: 'nation', value: order.nation ?? '-' },
            { field: 'seller', value: order.seller?.full_name ?? '-' },
            { field: 'created_at', value: order.create_date?.format_date ?? '-' },
            { field: 'modified_at', value: order.modify_date?.format_date ?? '-' },
        ];

        // 收货地址
        if (addr.country) {
            rows.push({
                field: 'ship_to',
                value: [addr.contact_person, addr.city, addr.province, addr.country].filter(Boolean).join(', '),
            });
        }

        // 商品明细
        products.forEach((p, i) => {
            const qty = parseFloat(p.quantity ?? 0);
            const unitPrice = p.unit_price?.amount ?? '-';
            const cur = p.unit_price?.currency ?? 'USD';
            rows.push({
                field: `product_${i + 1}`,
                value: `${p.name ?? '-'} × ${qty} ${p.unit ?? ''} @ ${unitPrice} ${cur}`,
            });
        });

        // VAT
        if (order.vat_amount?.amount) {
            rows.push({ field: 'vat_amount', value: formatAmount(order.vat_amount.amount, order.vat_amount.currency) });
        }

        return rows;
    },
});

// ─── order-tracking：查询物流轨迹 ────────────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'order-tracking',
    description: 'Get Alibaba order logistics tracking (requires extra API permission)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'trade_id',
            required: true,
            positional: true,
            help: 'Trade ID from order-list',
        },
    ],
    columns: ['time', 'status', 'location'],
    func: async (_page, kwargs) => {
        // 实测参数名为 trade_id（非 e_trade_id），权限不足时 alibabaCall 会自动抛出友好错误
        const params = { trade_id: String(kwargs.trade_id ?? '').trim() };

        const data = await alibabaCall('/order/logistics/tracking/get', params);
        const trackingList = data.value?.tracking_list ?? data.tracking_list ?? [];

        if (!Array.isArray(trackingList) || trackingList.length === 0) {
            return [];
        }

        return trackingList.map(t => ({
            time: t.time ?? t.track_time ?? '-',
            status: t.desc ?? t.status ?? '-',
            location: t.location ?? t.city ?? '-',
        }));
    },
});

// ─── order-cancel：取消订单 ───────────────────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'order-cancel',
    description: 'Cancel an Alibaba order by trade ID (requires ALI_ACCESS_TOKEN)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'trade_id',
            required: true,
            positional: true,
            help: 'Trade ID to cancel',
        },
        {
            name: 'reason',
            type: 'str',
            default: 'Cancelled by seller',
            help: 'Cancellation reason text',
        },
    ],
    columns: ['field', 'value'],
    func: async (_page, kwargs) => {
        const params = {
            e_trade_id: String(kwargs.trade_id ?? '').trim(),
            cancel_reason: String(kwargs.reason || 'Cancelled by seller'),
        };

        const data = await alibabaCall('/alibaba/order/cancel', params);
        const result = data.value ?? data.result ?? data;

        return [
            { field: 'trade_id', value: kwargs.trade_id },
            { field: 'success', value: String(result.success ?? result.is_success ?? false) },
            { field: 'message', value: result.message ?? result.error_msg ?? result.msg ?? '-' },
        ];
    },
});
