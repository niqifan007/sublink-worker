import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import { ClashConfigBuilder } from '../src/builders/ClashConfigBuilder.js';
import { createTranslator } from '../src/i18n/index.js';
import { COUNTRY_DATA, addCountryFlagToNodeName, buildCountryNameFilter, groupProxiesByCountry, parseCountryFromNodeName } from '../src/utils.js';

// Create translator for tests
const t = createTranslator('zh-CN');

describe('Country Group Tests', () => {
    it('adds flags and country groups for every supported country code', async () => {
        const countries = Object.entries(COUNTRY_DATA);
        expect(COUNTRY_DATA.MO).toMatchObject({ emoji: '🇲🇴' });
        const input = countries.map(([code]) =>
            `ss://YWVzLTEyOC1nY206dGVzdA@${code.toLowerCase()}.example.com:443#${code}-Cyberzone`
        ).join('\n');
        const builder = new ClashConfigBuilder(input, [], [], null, 'zh-CN', 'test-agent', true);
        const config = yaml.load(await builder.build());

        for (const [code, country] of countries) {
            const nodeName = `${code}-Cyberzone`;
            const flaggedName = `${country.emoji} ${nodeName}`;
            expect(config.proxies.map(proxy => proxy.name)).toContain(flaggedName);
            expect(config['proxy-groups'].find(group => group.name === `${country.emoji} ${country.name}`).proxies).toEqual([flaggedName]);
            expect(parseCountryFromNodeName(nodeName.toLowerCase())).toMatchObject({ code });
            expect(parseCountryFromNodeName(`prefix${code}suffix`)).toBeNull();
            const filter = new RegExp(buildCountryNameFilter(country).replace(/^\(\?i\)/, ''), 'i');
            expect(filter.test(nodeName)).toBe(true);
            expect(filter.test(`prefix${code}suffix`)).toBe(false);
        }
    });

    it('should group proxies by country correctly', async () => {
        const input = `
ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK-Node-1
ss://YWVzLTEyOC1nY206dGVzdA@example.com:444#香港节点2
ss://YWVzLTEyOC1nY206dGVzdA@example.com:445#US-Node-1
trojan://password@example.com:443?sni=example.com#美国节点2
vmess://ewogICJ2IjogIjIiLAogICJwcyI6ICJ0dzEubm9kZS5jb20iLAogICJhZGQiOiAidHcxLm5vZGUuY29tIiwKICAicG9ydCI6IDQ0MywKICAiaWQiOiAiZGE4Y2FkMTYtYjEzNS00MmZlLWEzYjYtNzUyZGFhY2E5MGIwIiwKICAiYWlkIjogMCwKICAibmV0IjogIndzIiwKICAidHlwZSI6ICJub25lIiwKICAiaG9zdCI6ICJ0dzEubm9kZS5jb20iLAogICJwYXRoIjogIi92bWVzcyIsCiAgInRscyI6ICJ0bHMiCn0=#台湾节点
    `;

        const builder = new ClashConfigBuilder(input, 'all', [], null, 'zh-CN', 'test-agent', true);
        const yamlText = await builder.build();
        const built = yaml.load(yamlText);

        const proxiesCount = (built.proxies || []).length;
        expect(proxiesCount).toBeGreaterThan(0);
        expect(built.proxies.map(proxy => proxy.name)).toEqual(expect.arrayContaining([
            '🇭🇰 HK-Node-1',
            '🇭🇰 香港节点2',
            '🇺🇸 US-Node-1',
            '🇺🇸 美国节点2',
            '🇹🇼 台湾节点'
        ]));

        // Check Hong Kong group
        const hkGroup = (built['proxy-groups'] || []).find(g => g && g.name === '🇭🇰 Hong Kong');
        expect(hkGroup).toBeDefined();
        expect(hkGroup.proxies.length).toBe(2);
        expect(hkGroup.type).toBe('url-test');
        expect(hkGroup.icon).toBe('https://flagcdn.com/hk.svg');

        // Check US group
        const usGroup = (built['proxy-groups'] || []).find(g => g && g.name === '🇺🇸 United States');
        expect(usGroup).toBeDefined();
        expect(usGroup.proxies.length).toBe(2);
        expect(usGroup.type).toBe('url-test');
        expect(usGroup.icon).toBe('https://flagcdn.com/us.svg');

        // Check Taiwan group
        const twGroup = (built['proxy-groups'] || []).find(g => g && g.name === '🇹🇼 Taiwan');
        expect(twGroup).toBeDefined();
        expect(twGroup.proxies.length).toBe(1);
        expect(twGroup.type).toBe('url-test');
        expect(twGroup.icon).toBe('https://flagcdn.com/tw.svg');

        // Check manual switch group
        const manualName = t('outboundNames.Manual Switch');
        const manualGroup = (built['proxy-groups'] || []).find(g => g && g.name === manualName);
        expect(manualGroup).toBeDefined();
        expect(manualGroup.type).toBe('select');
        expect(manualGroup.proxies.length).toBe(proxiesCount);

        // Check node select group
        const nodeSelectLabel = t('outboundNames.Node Select');
        const autoName = t('outboundNames.Auto Select');
        const nodeSelectGroup = (built['proxy-groups'] || []).find(g => g && g.name === nodeSelectLabel);
        expect(nodeSelectGroup).toBeDefined();

        const expectedProxies = ['DIRECT', 'REJECT', autoName, manualName, '🇭🇰 Hong Kong', '🇹🇼 Taiwan', '🇺🇸 United States'];
        const actualProxies = nodeSelectGroup.proxies || [];
        expect(actualProxies.sort()).toEqual(expectedProxies.sort());

        // Check Youtube group has correct members
        const youtubeLabel = t('outboundNames.Youtube');
        const youtubeGroup = (built['proxy-groups'] || []).find(g => g && g.name === youtubeLabel);
        if (youtubeGroup) {
            const expectedMembers = [nodeSelectLabel, autoName, manualName, '🇭🇰 Hong Kong', '🇹🇼 Taiwan', '🇺🇸 United States'];
            const actualMembers = youtubeGroup.proxies || [];
            const missing = expectedMembers.filter(name => !actualMembers.includes(name));
            expect(missing).toEqual([]);
        }
    });

    it('groupProxiesByCountry helper normalizes names', () => {
        const sample = [
            { name: 'HK-Node-1' },
            { tag: '香港节点2' },
            'US-Node-1 = ss, example.com, 443',
            '台湾节点 = trojan, example.com, 443'
        ];
        const grouped = groupProxiesByCountry(sample);
        expect(Object.keys(grouped)).toEqual(expect.arrayContaining(['Hong Kong', 'United States', 'Taiwan']));
        expect(grouped['Hong Kong'].proxies).toHaveLength(2);
        expect(grouped['United States'].proxies).toHaveLength(1);
        expect(grouped['Taiwan'].proxies).toHaveLength(1);
    });

    describe('parseCountryFromNodeName word boundary handling', () => {
        it('should NOT match "US" inside "plus"', () => {
            expect(parseCountryFromNodeName('plus-node-1')).toBeNull();
            expect(parseCountryFromNodeName('surplus')).toBeNull();
            expect(parseCountryFromNodeName('focus')).toBeNull();
        });

        it('should NOT match "JP" inside "VJP123"', () => {
            expect(parseCountryFromNodeName('VJP123')).toBeNull();
        });

        it('should NOT match "IN" inside "main" or "point"', () => {
            const result1 = parseCountryFromNodeName('main-server');
            expect(result1?.code).not.toBe('IN');
            const result2 = parseCountryFromNodeName('endpoint-1');
            expect(result2?.code).not.toBe('IN');
        });

        it('should still match short codes with proper delimiters', () => {
            expect(parseCountryFromNodeName('US-Node-1')).toMatchObject({ code: 'US' });
            expect(parseCountryFromNodeName('HK 01')).toMatchObject({ code: 'HK' });
            expect(parseCountryFromNodeName('node-JP-fast')).toMatchObject({ code: 'JP' });
            expect(parseCountryFromNodeName('SG|premium')).toMatchObject({ code: 'SG' });
        });

        it('should match Chinese aliases without issues', () => {
            expect(parseCountryFromNodeName('香港节点1')).toMatchObject({ code: 'HK' });
            expect(parseCountryFromNodeName('日本高速')).toMatchObject({ code: 'JP' });
            expect(parseCountryFromNodeName('新加坡专线')).toMatchObject({ code: 'SG' });
        });

        it('should prefer longer alias over shorter (Indonesia vs India)', () => {
            expect(parseCountryFromNodeName('Indonesia-1')).toMatchObject({ code: 'ID' });
            expect(parseCountryFromNodeName('印度尼西亚节点')).toMatchObject({ code: 'ID' });
        });
    });

    describe('addCountryFlagToNodeName', () => {
        it('adds the detected flag without duplicating an existing flag', () => {
            expect(addCountryFlagToNodeName('JP-XXX')).toBe('🇯🇵 JP-XXX');
            expect(addCountryFlagToNodeName('🇯🇵 JP-XXX')).toBe('🇯🇵 JP-XXX');
            expect(addCountryFlagToNodeName('Unknown-XXX')).toBe('Unknown-XXX');
        });
    });
});
