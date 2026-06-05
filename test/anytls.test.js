import { describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { parseAnytls } from '../src/parsers/protocols/anytlsParser.js';

describe('AnyTLS support', () => {
    it('parses AnyTLS URI into the internal proxy shape', () => {
        const result = parseAnytls('anytls://REPLACE%40PASS@example.com:8443/?sni=real.example.com&insecure=1&udp=false&alpn=h2,http/1.1&client-fingerprint=chrome&idle-session-check-interval=30&idle-session-timeout=120&min-idle-session=5#ANYTLS-main');

        expect(result).toEqual({
            tag: 'ANYTLS-main',
            type: 'anytls',
            server: 'example.com',
            server_port: 8443,
            password: 'REPLACE@PASS',
            udp: false,
            'idle-session-check-interval': 30,
            'idle-session-timeout': 120,
            'min-idle-session': 5,
            tls: {
                enabled: true,
                server_name: 'real.example.com',
                insecure: true,
                alpn: ['h2', 'http/1.1'],
                utls: {
                    enabled: true,
                    fingerprint: 'chrome'
                }
            }
        });
    });

    it('converts AnyTLS URI subscriptions to Clash YAML proxies', async () => {
        const input = 'anytls://REPLACE_ANYTLS_PASS@example.com:443/?sni=example.com&insecure=0&udp=true&alpn=h2,http/1.1&client-fingerprint=chrome&idle-session-check-interval=30&idle-session-timeout=120&min-idle-session=5#ANYTLS-main';
        const builder = new ClashConfigBuilder(input, 'minimal', [], null, 'zh-CN', 'mihomo');
        const built = yaml.load(await builder.build());

        expect(built.proxies).toHaveLength(1);
        expect(built.proxies[0]).toMatchObject({
            name: 'ANYTLS-main',
            type: 'anytls',
            server: 'example.com',
            port: 443,
            password: 'REPLACE_ANYTLS_PASS',
            udp: true,
            sni: 'example.com',
            alpn: ['h2', 'http/1.1'],
            'client-fingerprint': 'chrome',
            'skip-cert-verify': false,
            'idle-session-check-interval': 30,
            'idle-session-timeout': 120,
            'min-idle-session': 5
        });
    });

    it('uses port 443 for AnyTLS URIs without an explicit port', () => {
        const result = parseAnytls('anytls://letmein@example.com/?sni=real.example.com#default-port');

        expect(result.server).toBe('example.com');
        expect(result.server_port).toBe(443);
        expect(result.password).toBe('letmein');
        expect(result.tag).toBe('default-port');
    });
});
