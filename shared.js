/**
 * shared.js — Alibaba Open API 公共工具
 *
 * 网关地址：https://openapi-api.alibaba.com/rest/{api_path}
 * 签名算法：HMAC-SHA256(api_path + sorted_key_value_pairs, appSecret)，结果转大写十六进制
 *
 * 环境变量：
 *   ALI_APP_KEY     — 控制台分配的 App Key（必填）
 *   ALI_APP_SECRET  — 控制台分配的 App Secret（必填）
 *   ALI_ACCESS_TOKEN — OAuth 访问令牌（大多数接口必填，auth 接口除外）
 */

import { createHmac } from 'crypto';
import { CommandExecutionError } from '@jackwener/opencli/errors';

/** Alibaba Open API 统一网关前缀 */
export const ALIBABA_GATEWAY = 'https://openapi-api.alibaba.com/rest';

/**
 * 从环境变量读取凭证，缺失时抛出友好提示
 */
export function getCredentials() {
    const appKey = process.env.ALI_APP_KEY;
    const appSecret = process.env.ALI_APP_SECRET;
    const accessToken = process.env.ALI_ACCESS_TOKEN;

    if (!appKey || !appSecret) {
        throw new CommandExecutionError(
            'Alibaba Open API credentials not configured',
            'Set environment variables:\n' +
            '  ALI_APP_KEY=<your_app_key>\n' +
            '  ALI_APP_SECRET=<your_app_secret>\n' +
            'Get your credentials from: https://openapi.alibaba.com',
        );
    }
    return { appKey, appSecret, accessToken };
}

/**
 * 生成 Alibaba Open API 请求签名
 *
 * 算法步骤：
 *   1. 将所有请求参数（不含 sign）按 key ASCII 码升序排列
 *   2. 拼接字符串：{api_path}{key1}{value1}{key2}{value2}...
 *   3. 用 App Secret 做 HMAC-SHA256（UTF-8）
 *   4. 转大写十六进制
 *
 * @param {string} apiPath - API 路径，如 "/auth/token/create"
 * @param {string} appSecret - App Secret
 * @param {Record<string, string>} params - 所有请求参数（不含 sign）
 */
export function generateSign(apiPath, appSecret, params) {
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys.map(k => `${k}${params[k]}`).join('');
    const signString = apiPath + paramString;
    return createHmac('sha256', appSecret)
        .update(signString, 'utf-8')
        .digest('hex')
        .toUpperCase();
}

/**
 * 调用 Alibaba Open API
 *
 * @param {string} apiPath - API 路径，如 "/alibaba/order/get"
 * @param {Record<string, string>} params - 业务参数（不含系统参数）
 * @param {boolean} requireToken - 是否需要 access_token（默认 true）
 */
export async function alibabaCall(apiPath, params, requireToken = true) {
    const { appKey, appSecret, accessToken } = getCredentials();

    if (requireToken && !accessToken) {
        throw new CommandExecutionError(
            'Alibaba access token not configured',
            'Set environment variable: ALI_ACCESS_TOKEN=<your_access_token>\n' +
            'Obtain via OAuth or run: opencli alibaba-api token-create --code <auth_code>\n' +
            'OAuth guide: https://openapi.alibaba.com/doc/doc.htm',
        );
    }

    const timestamp = String(Date.now());
    const allParams = {
        app_key: appKey,
        timestamp,
        sign_method: 'sha256',
        ...params,
    };

    if (requireToken && accessToken) {
        allParams.access_token = accessToken;
    }

    // 签名（必须在所有参数确定后生成）
    allParams.sign = generateSign(apiPath, appSecret, allParams);

    const url = `${ALIBABA_GATEWAY}${apiPath}?${new URLSearchParams(allParams).toString()}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
        throw new CommandExecutionError(
            `Alibaba Open API gateway returned HTTP ${response.status}`,
            'Check your ALI_APP_KEY / ALI_APP_SECRET, then retry.',
        );
    }

    const data = await response.json();

    // 错误格式1：{ error_response: { code, msg, sub_msg } }（IOP 风格）
    const errResp = data.error_response;
    if (errResp) {
        const code = String(errResp.code ?? '');
        const msg = String(errResp.msg ?? 'Unknown error');
        const subMsg = String(errResp.sub_msg ?? '');
        throw new CommandExecutionError(
            `Alibaba API error [${code}]: ${msg}`,
            subMsg || 'Check your parameters and permissions.',
        );
    }

    // 错误格式2：{ type: 'ISV'|'ISP', code, message }（Open API 风格）
    if (data.type === 'ISV' || data.type === 'ISP') {
        const hint = data.type === 'ISP'
            ? 'This API requires additional permission. Apply at: https://openapi.alibaba.com'
            : 'Check your request parameters.';
        throw new CommandExecutionError(
            `Alibaba API error [${data.code ?? data.type}]: ${data.message ?? 'Unknown error'}`,
            hint,
        );
    }

    return data;
}

/**
 * 调用 Alibaba Open API — POST with JSON body
 *
 * 系统参数（app_key / timestamp / sign / access_token）放 URL query，
 * 业务参数以 JSON 放 body（适合含数组/嵌套对象的 /eco/buyer/ POST 接口）。
 *
 * @param {string} apiPath - API 路径，如 "/eco/buyer/product/events"
 * @param {object} body    - 业务参数对象（原样 JSON 序列化）
 * @param {boolean} requireToken - 是否需要 access_token（默认 true）
 */
export async function alibabaPost(apiPath, body, requireToken = true) {
    const { appKey, appSecret, accessToken } = getCredentials();

    if (requireToken && !accessToken) {
        throw new CommandExecutionError(
            'Alibaba access token not configured',
            'Set environment variable: ALI_ACCESS_TOKEN=<your_access_token>\n' +
            'OAuth guide: https://openapi.alibaba.com/doc/doc.htm',
        );
    }

    const timestamp = String(Date.now());
    // 只对系统参数签名（body 为复杂对象，不参与签名）
    const sysParams = {
        app_key: appKey,
        timestamp,
        sign_method: 'sha256',
    };
    if (requireToken && accessToken) {
        sysParams.access_token = accessToken;
    }
    sysParams.sign = generateSign(apiPath, appSecret, sysParams);

    const url = `${ALIBABA_GATEWAY}${apiPath}?${new URLSearchParams(sysParams).toString()}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new CommandExecutionError(
            `Alibaba Open API gateway returned HTTP ${response.status}`,
            'Check your ALI_APP_KEY / ALI_APP_SECRET, then retry.',
        );
    }

    const data = await response.json();

    const errResp = data.error_response;
    if (errResp) {
        throw new CommandExecutionError(
            `Alibaba API error [${errResp.code ?? ''}]: ${errResp.msg ?? 'Unknown error'}`,
            String(errResp.sub_msg ?? 'Check your parameters and permissions.'),
        );
    }

    if (data.type === 'ISV' || data.type === 'ISP') {
        const hint = data.type === 'ISP'
            ? 'This API requires additional permission. Apply at: https://openapi.alibaba.com'
            : 'Check your request parameters.';
        throw new CommandExecutionError(
            `Alibaba API error [${data.code ?? data.type}]: ${data.message ?? 'Unknown error'}`,
            hint,
        );
    }

    return data;
}

/**
 * 格式化日期字符串（原样输出，保留 API 返回格式）
 * @param {unknown} val
 */
export function formatDate(val) {
    if (val === null || val === undefined) return '-';
    return String(val);
}

/**
 * 格式化金额
 * @param {unknown} amount
 * @param {unknown} currency
 */
export function formatAmount(amount, currency) {
    if (amount === null || amount === undefined) return '-';
    const cur = currency ? String(currency) : 'USD';
    return `${amount} ${cur}`;
}
