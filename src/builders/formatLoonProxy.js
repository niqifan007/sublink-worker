const quote = (value) => `"${String(value).replace(/[\r\n]/g, '').replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
const value = (input) => /[,"\r\n]/.test(String(input)) ? quote(input) : String(input);

export function formatLoonProxy(proxy) {
    const { tag, server, server_port: port, tls, transport } = proxy;
    if (!String(tag ?? '').trim() || !server || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) return null;
    if (transport?.type && !['tcp', 'ws', 'http'].includes(transport.type)) return null;
    if ([tag, server, proxy.password, proxy.uuid].some(part => /[\r\n]/.test(String(part ?? '')))) return null;

    let parts;
    switch (proxy.type) {
        case 'shadowsocks':
            if (!proxy.method || proxy.password == null || (proxy.plugin && proxy.plugin !== 'obfs')) return null;
            parts = ['Shadowsocks', server, port, proxy.method, quote(proxy.password)];
            if (proxy.plugin === 'obfs') {
                parts.push(`obfs-name=${value(proxy.plugin_opts?.mode || 'http')}`);
                if (proxy.plugin_opts?.host) parts.push(`obfs-host=${value(proxy.plugin_opts.host)}`);
                if (proxy.plugin_opts?.path) parts.push(`obfs-uri=${value(proxy.plugin_opts.path)}`);
            }
            break;
        case 'vmess':
            if (!proxy.uuid) return null;
            parts = ['VMess', server, port, proxy.security || 'auto', quote(proxy.uuid), `alterId=${proxy.alter_id ?? 0}`];
            break;
        case 'vless':
            if (!proxy.uuid) return null;
            parts = ['VLESS', server, port, quote(proxy.uuid)];
            if (proxy.flow) parts.push(`flow=${value(proxy.flow)}`);
            break;
        case 'trojan':
            if (proxy.password == null) return null;
            parts = ['Trojan', server, port, quote(proxy.password)];
            break;
        case 'hysteria2':
            if (proxy.password == null || (proxy.obfs?.type && proxy.obfs.type !== 'salamander')) return null;
            parts = ['Hysteria2', server, port, quote(proxy.password)];
            if (proxy.obfs?.type === 'salamander' && proxy.obfs.password) parts.push(`salamander-password=${value(proxy.obfs.password)}`);
            if (proxy.ports) parts.push(`server-ports=${value(proxy.ports)}`);
            if (proxy.hop_interval != null) parts.push(`hop-interval=${proxy.hop_interval}`);
            if (proxy.down != null) parts.push(`download-bandwidth=${proxy.down}`);
            break;
        case 'anytls':
            if (proxy.password == null) return null;
            parts = ['AnyTLS', server, port, quote(proxy.password)];
            if (proxy.idle_session_timeout ?? proxy['idle-session-timeout']) parts.push(`idle-session-timeout=${proxy.idle_session_timeout ?? proxy['idle-session-timeout']}`);
            if (proxy.max_stream_count ?? proxy['max-stream-count']) parts.push(`max-stream-count=${proxy.max_stream_count ?? proxy['max-stream-count']}`);
            break;
        default:
            return null;
    }

    if (['vmess', 'vless', 'trojan'].includes(proxy.type)) {
        if (transport?.type === 'ws' || transport?.type === 'http') {
            parts.push(`transport=${transport.type}`);
            if (transport.path) parts.push(`path=${value(Array.isArray(transport.path) ? transport.path[0] : transport.path)}`);
            const host = transport.headers?.host ?? transport.host;
            if (host) parts.push(`host=${value(Array.isArray(host) ? host[0] : host)}`);
        }
        if (['vmess', 'vless'].includes(proxy.type)) parts.push(`over-tls=${!!tls?.enabled}`);
    }

    if (tls?.server_name) parts.push(`sni=${value(tls.server_name)}`);
    if (tls?.insecure !== undefined) parts.push(`skip-cert-verify=${!!tls.insecure}`);
    const alpn = tls?.alpn ?? proxy.alpn;
    if (alpn?.length) parts.push(`alpn=${quote(Array.isArray(alpn) ? alpn.join(',') : alpn)}`);
    if (tls?.reality?.enabled) {
        if (!tls.reality.public_key) return null;
        parts.push(`public-key=${quote(tls.reality.public_key)}`);
        if (tls.reality.short_id) parts.push(`short-id=${value(tls.reality.short_id)}`);
    }
    if (['global', 'default', 'safari-ios18', 'safari-ios-26', 'chrome', 'chrome147'].includes(tls?.utls?.fingerprint)) {
        parts.push(`tls-profile=${tls.utls.fingerprint}`);
    }
    if (proxy.tcp_fast_open || proxy.fast_open) parts.push('fast-open=true');
    if (typeof proxy.udp === 'boolean') parts.push(`udp=${proxy.udp}`);

    return `${String(tag).replaceAll('=', ' ').trim()} = ${parts.join(',')}`;
}
