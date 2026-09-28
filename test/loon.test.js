import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';
import { formatLoonProxy } from '../src/builders/formatLoonProxy.js';

describe('Loon node subscription', () => {
    it('formats supported nodes and optional MESL node DNS', async () => {
        const app = createApp({ kv: new MemoryKVAdapter() });
        const input = [
            'ss://YWVzLTEyOC1nY206dGVzdA==@ss.example.com:443#SS',
            'ss://YWVzLTEyOC1nY206dGVzdA==@other.example.com:443#SS',
            'vless://11111111-1111-1111-1111-111111111111@vless.example.com:443?security=reality&type=tcp&sni=front.example.com&pbk=publickey&sid=abcd&flow=xtls-rprx-vision#VLESS',
            'hysteria2://secret@hy.example.com:443?security=tls&sni=hy.example.com&alpn=h3#HY2',
            'tuic://11111111-1111-1111-1111-111111111111:secret@tuic.example.com:443#TUIC'
        ].join('\n');
        const config = encodeURIComponent(input);

        const normal = await app.request(`http://localhost/loon?config=${config}`);
        const normalText = await normal.text();
        expect(normal.status).toBe(200);
        expect(normalText).toContain('[Proxy]\nSS = Shadowsocks,ss.example.com,443,aes-128-gcm,"test"');
        expect(normalText).toContain('SS 2 = Shadowsocks,other.example.com,443,aes-128-gcm,"test"');
        expect(normalText).toContain('VLESS = VLESS,vless.example.com,443,"11111111-1111-1111-1111-111111111111"');
        expect(normalText).toContain('public-key="publickey"');
        expect(normalText).toContain('HY2 = Hysteria2,hy.example.com,443,"secret"');
        expect(normalText).not.toContain('TUIC');
        expect(normalText).not.toContain('[DNS]');
        expect(normalText).not.toContain('server-dns=');

        const mesl = await (await app.request(`http://localhost/loon?config=${config}&enable_mesl_dns=true`)).text();
        expect(mesl).not.toContain('[DNS]');
        const meslNodes = mesl.split('[Proxy]\n')[1].split('\n');
        expect(meslNodes).toHaveLength(4);
        expect(meslNodes.every(line => line.endsWith('server-dns="https://zone.rlose.com:39933/api-query,https://radar.rlose.com/api-query"'))).toBe(true);
    });

    it('quotes commas in credentials and resolves short links', async () => {
        expect(formatLoonProxy({ tag: 'Node', type: 'shadowsocks', server: 'ss.example.com', server_port: 443, method: 'aes-128-gcm', password: 'a,b' }))
            .toBe('Node = Shadowsocks,ss.example.com,443,aes-128-gcm,"a,b"');

        const kv = new MemoryKVAdapter();
        await kv.put('demo', '?config=ss%3A%2F%2Fexample');
        const app = createApp({ kv });
        expect(await (await app.request('http://localhost/')).text()).toContain('Loon 节点订阅链接');
        const short = await app.request('http://localhost/l/demo');
        expect(short.status).toBe(302);
        expect(short.headers.get('location')).toBe('http://localhost/loon?config=ss%3A%2F%2Fexample');
        const resolved = await app.request('http://localhost/resolve?url=http%3A%2F%2Flocalhost%2Fl%2Fdemo');
        expect((await resolved.json()).originalUrl).toBe('http://localhost/loon?config=ss%3A%2F%2Fexample');

        const unsupported = await app.request('http://localhost/loon?config=tuic%3A%2F%2Funsupported');
        expect(unsupported.status).toBe(400);
    });
});
