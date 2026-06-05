import { parseArray, parseBool, parseMaybeNumber } from '../../utils.js';

function safeDecode(value) {
    if (!value) return value;
    try {
        return decodeURIComponent(value);
    } catch (_) {
        return value;
    }
}

function stripIpv6Brackets(hostname) {
    if (typeof hostname !== 'string') return hostname;
    return hostname.startsWith('[') && hostname.endsWith(']')
        ? hostname.slice(1, -1)
        : hostname;
}

function firstDefined(...values) {
    return values.find(value => value !== undefined && value !== null && value !== '');
}

export function parseAnytls(url) {
    const parsed = new URL(url);
    const params = Object.fromEntries(parsed.searchParams.entries());
    const tls = {
        enabled: true,
        server_name: firstDefined(params.sni, params.servername, params.peer),
        insecure: parseBool(
            firstDefined(params.insecure, params['skip-cert-verify'], params.allowInsecure, params.allow_insecure),
            false
        ),
        alpn: parseArray(params.alpn)
    };
    const fingerprint = firstDefined(params['client-fingerprint'], params.fingerprint, params.fp);
    if (fingerprint) {
        tls.utls = {
            enabled: true,
            fingerprint
        };
    }

    return {
        tag: safeDecode(parsed.hash ? parsed.hash.slice(1) : '') || stripIpv6Brackets(parsed.hostname),
        type: 'anytls',
        server: stripIpv6Brackets(parsed.hostname),
        server_port: parsed.port ? parseInt(parsed.port) : 443,
        password: safeDecode(firstDefined(parsed.username, params.password, params.auth)),
        udp: parseBool(params.udp, undefined),
        'idle-session-check-interval': parseMaybeNumber(params['idle-session-check-interval'] ?? params.idle_session_check_interval),
        'idle-session-timeout': parseMaybeNumber(params['idle-session-timeout'] ?? params.idle_session_timeout),
        'min-idle-session': parseMaybeNumber(params['min-idle-session'] ?? params.min_idle_session),
        tls
    };
}
