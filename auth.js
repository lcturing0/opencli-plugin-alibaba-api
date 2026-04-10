/**
 * auth.js — Alibaba Open API 授权令牌管理
 *
 * 命令：
 *   opencli alibaba-api auth-url                    生成 OAuth 授权链接
 *   opencli alibaba-api token-create <auth_code>    生成 Access Token
 *   opencli alibaba-api token-refresh <refresh_token>  刷新 Access Token
 *
 * OAuth 授权端点：https://openapi-auth.alibaba.com/oauth/authorize
 * Token 端点：    https://openapi-api.alibaba.com/rest/auth/token/create
 */

import { cli, Strategy } from '@jackwener/opencli/registry';
import { alibabaCall, getCredentials } from './shared.js';

// ─── auth-url：生成 OAuth 授权链接 ───────────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'auth-url',
    description: 'Generate Alibaba OAuth authorization URL (requires ALI_APP_KEY)',
    domain: 'openapi-auth.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'redirect_uri',
            required: true,
            positional: true,
            help: 'OAuth callback URL registered in your app console, e.g. https://yoursite.com/callback',
        },
        {
            name: 'state',
            type: 'str',
            default: '',
            help: 'Optional CSRF state string (auto-generated if omitted)',
        },
    ],
    columns: ['field', 'value'],
    func: async (_page, kwargs) => {
        const { appKey } = getCredentials();
        const redirectUri = String(kwargs.redirect_uri ?? '').trim();
        const state = String(kwargs.state ?? '') || Math.random().toString(36).slice(2, 10);

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: appKey,
            redirect_uri: redirectUri,
            state,
        });
        const authUrl = `https://openapi-auth.alibaba.com/oauth/authorize?${params}`;

        return [
            { field: 'auth_url', value: authUrl },
            { field: 'state', value: state },
            { field: 'redirect_uri', value: redirectUri },
            { field: 'tip', value: 'Open auth_url in browser → login → copy ?code= from redirect URL' },
        ];
    },
});

// ─── token-create：OAuth 授权码换取 Access Token ──────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'token-create',
    description: 'Create Alibaba access token from OAuth authorization code (requires ALI_APP_KEY / ALI_APP_SECRET)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'code',
            required: true,
            positional: true,
            help: 'OAuth authorization code from redirect URL (after user grants permission)',
        },
    ],
    columns: ['field', 'value'],
    func: async (_page, kwargs) => {
        const code = String(kwargs.code ?? '').trim();
        // token-create 不需要 access_token
        const data = await alibabaCall('/auth/token/create', { code }, false);

        const userInfo = data.user_info ?? {};
        return [
            { field: 'access_token', value: data.access_token ?? '-' },
            { field: 'refresh_token', value: data.refresh_token ?? '-' },
            { field: 'expires_in', value: data.expires_in != null ? `${Math.round(data.expires_in / 86400)} days` : '-' },
            { field: 'refresh_expires_in', value: data.refresh_expires_in != null ? `${Math.round(data.refresh_expires_in / 86400)} days` : '-' },
            { field: 'account', value: data.account ?? '-' },
            { field: 'account_id', value: data.account_id ?? '-' },
            { field: 'country', value: data.country ?? '-' },
            { field: 'user_login_id', value: userInfo.loginId ?? '-' },
            { field: 'seller_id', value: userInfo.seller_id ?? '-' },
        ];
    },
});

// ─── token-refresh：刷新 Access Token ────────────────────────────────────────
cli({
    site: 'alibaba-api',
    name: 'token-refresh',
    description: 'Refresh Alibaba access token using refresh_token (requires ALI_APP_KEY / ALI_APP_SECRET)',
    domain: 'openapi.alibaba.com',
    strategy: Strategy.PUBLIC,
    browser: false,
    args: [
        {
            name: 'refresh_token',
            required: true,
            positional: true,
            help: 'Refresh token obtained from token-create (or current ALI_REFRESH_TOKEN)',
        },
    ],
    columns: ['field', 'value'],
    func: async (_page, kwargs) => {
        const refreshToken = String(kwargs.refresh_token ?? '').trim();
        const data = await alibabaCall('/auth/token/refresh', { refresh_token: refreshToken }, false);

        return [
            { field: 'access_token', value: data.access_token ?? '-' },
            { field: 'refresh_token', value: data.refresh_token ?? '-' },
            { field: 'expires_in', value: data.expires_in != null ? `${Math.round(data.expires_in / 86400)} days` : '-' },
            { field: 'refresh_expires_in', value: data.refresh_expires_in != null ? `${Math.round(data.refresh_expires_in / 86400)} days` : '-' },
            { field: 'account', value: data.account ?? '-' },
            { field: 'account_id', value: data.account_id ?? '-' },
            { field: 'country', value: data.country ?? '-' },
        ];
    },
});
