import { afterEach, describe, expect, it, vi } from 'vitest';
import yaml from 'js-yaml';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { SingboxConfigBuilder } from '../src/builders/SingboxConfigBuilder.js';
import { SING_BOX_CONFIG } from '../src/config/index.js';
import { decodeBase64, encodeBase64, sortProxiesByCountry } from '../src/utils.js';

vi.mock('../src/parsers/subscription/httpSubscriptionFetcher.js', async (importOriginal) => ({
    ...await importOriginal(),
    fetchSubscriptionWithFormat: vi.fn()
}));
import { fetchSubscriptionWithFormat } from '../src/parsers/subscription/httpSubscriptionFetcher.js';

const names = [
    '未知节点A', 'US-2', 'HK-2', '🇯🇵 01', '美国-1', '香港-1', '未知节点B',
    'DE-1', '新加坡-2', '台湾-1', 'UK-1', 'Singapore-1', '德国-2', 'IN-1', 'CA-1', 'India-2', 'France-1'
];
const sortedNames = [
    'HK-2', '香港-1', '新加坡-2', 'Singapore-1', '台湾-1', '🇯🇵 01', 'US-2', '美国-1',
    'DE-1', '德国-2', 'UK-1', 'France-1', 'IN-1', 'India-2', 'CA-1', '未知节点A', '未知节点B'
];
const uris = names.map((name, index) => `ss://YWVzLTEyOC1nY206dGVzdA@example.com:${4400 + index}#${encodeURIComponent(name)}`);
const proxies = names.map((tag, index) => ({
    tag, type: 'shadowsocks', server: 'example.com', server_port: 4400 + index, method: 'aes-128-gcm', password: 'test'
}));
const sortedPorts = sortedNames.map(name => 4400 + names.indexOf(name));

const readPorts = async (route, response) => {
    const text = await response.text();
    if (route === 'singbox') return JSON.parse(text).outbounds.filter(proxy => proxy.server).map(proxy => proxy.server_port);
    if (route === 'clash') return yaml.load(text).proxies.map(proxy => proxy.port);
    if (route === 'xray') return decodeBase64(text).split('\n').map(uri => Number(new URL(uri).port));
    return text.split('\n')
        .filter(line => / = (ss|Shadowsocks),/.test(line))
        .map(line => Number(line.split(',')[2]));
};

describe('country / region node sorting', () => {
    afterEach(() => vi.resetAllMocks());

    it('uses built-in weights and first-seen countries within each tier, preserving aliases and node order', () => {
        const input = [...names, undefined, 'plus-node'];
        expect(sortProxiesByCountry(input, name => name)).toEqual([
            ...sortedNames, undefined, 'plus-node'
        ]);
        expect(input).toEqual([...names, undefined, 'plus-node']);
        expect(sortProxiesByCountry([], name => name)).toEqual([]);
    });

    it.each(['singbox', 'clash', 'surge', 'loon', 'xray'])('sorts /%s only when enabled', async (route) => {
        const app = createApp({ kv: new MemoryKVAdapter() });
        for (const flag of ['', '&sort_by_country=false', '&sort_by_country=true']) {
            const response = await app.request(`http://localhost/${route}?config=${encodeURIComponent(uris.join('\n'))}${flag}`);
            expect(response.status).toBe(200);
            expect(await readPorts(route, response)).toEqual(flag.endsWith('=true') ? sortedPorts : proxies.map(proxy => proxy.server_port));
        }
    });

    it('sorts base and imported nodes together while preserving structural outbounds and selector order', async () => {
        const baseConfig = structuredClone(SING_BOX_CONFIG);
        baseConfig.outbounds = [
            { type: 'direct', tag: 'DIRECT' },
            proxies[1],
            { type: 'selector', tag: 'Custom', outbounds: ['DIRECT'] },
            proxies[2]
        ];
        const builder = new SingboxConfigBuilder(uris[5], [], [], baseConfig, 'en-US', 'test', true, false, undefined, undefined, '1.12', true, true);
        await builder.build();
        const retained = builder.config.outbounds.filter(outbound => outbound.server || ['DIRECT', 'Custom'].includes(outbound.tag));
        expect(retained.map(outbound => outbound.tag)).toEqual(['DIRECT', 'HK-2', 'Custom', '香港-1', 'US-2']);
        expect(builder.getProxyList()).toEqual(['HK-2', '香港-1', 'US-2']);
        const manual = builder.config.outbounds.find(outbound => outbound.tag === builder.t('outboundNames.Manual Switch'));
        expect(manual.outbounds).toEqual(['HK-2', '香港-1', 'US-2']);
        expect(baseConfig.outbounds[1].tag).toBe('US-2');
    });

    it.each(['clash', 'singbox'])('sorts HTTP subscription nodes together with local nodes for /%s', async (route) => {
        const content = route === 'clash'
            ? yaml.dump({ proxies: proxies.map(proxy => ({ name: proxy.tag, type: 'ss', server: proxy.server, port: proxy.server_port, cipher: proxy.method, password: proxy.password })) })
            : JSON.stringify({ outbounds: proxies });
        fetchSubscriptionWithFormat.mockResolvedValue({
            content, format: route, url: 'https://example.com/sub', subscriptionUserinfo: 'upload=1; download=2; total=100'
        });
        const app = createApp({ kv: new MemoryKVAdapter() });
        const input = `ss://YWVzLTEyOC1nY206dGVzdA@example.com:5000#JP-local\nhttps://example.com/sub`;
        const response = await app.request(`http://localhost/${route}?config=${encodeURIComponent(input)}&sort_by_country=true`);
        expect(response.status).toBe(200);
        expect(response.headers.get('subscription-userinfo')).toBe('upload=1; download=2; total=100');
        const text = await response.text();
        expect(text).not.toContain('_auto_provider_');
        expect(await readPorts(route, new Response(text))).toEqual(sortedPorts.flatMap(port => port === 4403 ? [5000, port] : [port]));
    });

    it('sorts VMess names and preserves original URIs, including malformed nodes', async () => {
        const vmess = `vmess://${encodeBase64(JSON.stringify({ ps: '日本-1', add: 'example.com', port: '443', id: 'test' }))}`;
        const malformed = 'ss://example.com:443#bad%';
        const input = [uris[1], malformed, vmess, uris[2], 'vmess://bad'];
        const app = createApp({ kv: new MemoryKVAdapter() });
        const response = await app.request(`http://localhost/xray?config=${encodeURIComponent(input.join('\n'))}&sort_by_country=true`);
        expect(response.status).toBe(200);
        expect(decodeBase64(await response.text()).split('\n')).toEqual([uris[2], vmess, uris[1], malformed, 'vmess://bad']);
    });
});
